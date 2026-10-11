import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

// USDC amounts are in 6-decimal base units.
const REWARD = 100_000_000n; // 100 USDC
const REVIEW_PERIOD = 86_400n; // 1 day
const DAY = 86_400n;

// viem types byte params as `0x${string}`; build them explicitly.
const b32 = (s: string) => `0x${s.repeat(32)}` as const;

// Status enum indices, mirroring BountyBoard.Status.
const Status = { Open: 0, Completed: 1, Cancelled: 2, Expired: 3 } as const;

describe("BountyBoard", async function () {
  const { viem, networkHelpers } = await network.create();

  async function deploy() {
    const [creator, alice, bob] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const usdc = await viem.deployContract("MockUSDC");
    const board = await viem.deployContract("BountyBoard", [usdc.address, REVIEW_PERIOD]);

    await usdc.write.mint([creator.account.address, 1_000_000_000n]); // 1000 USDC
    await usdc.write.approve([board.address, 2n ** 256n - 1n], {
      account: creator.account,
    });

    const now = BigInt((await publicClient.getBlock()).timestamp);
    return { creator, alice, bob, usdc, board, now };
  }

  it("runs the bounty flow: create -> workers start -> creator accepts one", async function () {
    const { creator, alice, bob, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await viem.assertions.emitWithArgs(
      board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("11")], {
        account: creator.account,
      }),
      board,
      "BountyCreated",
      [0n, creator.account.address, REWARD, now + DAY, now + 2n * DAY, b32("11")],
    );

    // funds are held by the contract
    assert.equal(await usdc.read.balanceOf([board.address]), REWARD);

    // two workers click "working on it" — both visible onchain
    await board.write.startWorking([0n], { account: alice.account });
    await board.write.startWorking([0n], { account: bob.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.workerCount), 2);
    const workers = await board.read.getWorkers([0n]);
    assert.deepEqual(
      workers.map((w) => w.toLowerCase()),
      [alice.account.address.toLowerCase(), bob.account.address.toLowerCase()],
    );

    // creator accepts bob's work and pays exactly one worker
    await board.write.approveWork([0n, bob.account.address, b32("22")], {
      account: creator.account,
    });

    const b = await board.read.getBounty([0n]);
    assert.equal(b.status, Status.Completed);
    assert.equal(b.winningWorker.toLowerCase(), bob.account.address.toLowerCase());
    assert.equal(await usdc.read.balanceOf([bob.account.address]), REWARD);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), 0n);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
  });

  it("lets the creator withdraw while nobody is working", async function () {
    const { creator, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.cancelBounty([0n], { account: creator.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Cancelled);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n);
  });

  it("blocks the creator from withdrawing once someone is working", async function () {
    const { creator, alice, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.startWorking([0n], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      board.write.cancelBounty([0n], { account: creator.account }),
      board,
      "WorkersPresent",
    );
  });

  it("rejects approving someone who never started working", async function () {
    const { creator, alice, bob, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.startWorking([0n], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      board.write.approveWork([0n, bob.account.address, b32("44")], {
        account: creator.account,
      }),
      board,
      "NotWorking",
    );
  });

  it("expires an abandoned bounty (no workers) for anyone", async function () {
    const { creator, bob, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });

    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await testClient.mine({ blocks: 1 });

    // a stranger can trigger the refund; funds still go to the creator
    await board.write.expireBounty([0n], { account: bob.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Expired);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n);
  });

  it("rejects expiring while workers are active within the grace period", async function () {
    const { creator, alice, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.startWorking([0n], { account: alice.account });

    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await testClient.mine({ blocks: 1 });

    await viem.assertions.revertWithCustomError(
      board.write.expireBounty([0n], { account: alice.account }),
      board,
      "ExpiryNotReached",
    );
  });
});
