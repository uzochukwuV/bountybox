import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

// USDC amounts are in 6-decimal base units.
const REWARD = 100_000_000n; // 100 USDC per winner
const REVIEW_PERIOD = 86_400n; // 1 day
const DAY = 86_400n;

// viem types byte params as `0x${string}`; build them explicitly.
const b32 = (s: string) => `0x${s.repeat(32)}` as const;

// Status enum indices, mirroring BountyBoard.Status.
const Status = { Open: 0, Completed: 1, Cancelled: 2, Expired: 3 } as const;

describe("BountyBoard", async function () {
  const { viem, networkHelpers } = await network.create();

  async function deploy() {
    const [creator, alice, bob, carol] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const usdc = await viem.deployContract("MockUSDC");
    const board = await viem.deployContract("BountyBoard", [usdc.address, REVIEW_PERIOD]);

    await usdc.write.mint([creator.account.address, 1_000_000_000n]); // 1000 USDC
    await usdc.write.approve([board.address, 2n ** 256n - 1n], {
      account: creator.account,
    });

    const now = BigInt((await publicClient.getBlock()).timestamp);
    return { creator, alice, bob, carol, usdc, board, now };
  }

  async function create(board: any, creator: any, maxWinners: number, now: bigint) {
    await board.write.createBounty(
      [REWARD, maxWinners, now + DAY, now + 2n * DAY, b32("11")],
      { account: creator.account },
    );
  }

  it("single-winner bounty: create -> workers start -> creator accepts one", async function () {
    const { creator, alice, bob, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await viem.assertions.emitWithArgs(
      board.write.createBounty([REWARD, 1, now + DAY, now + 2n * DAY, b32("11")], {
        account: creator.account,
      }),
      board,
      "BountyCreated",
      [0n, creator.account.address, REWARD, 1, now + DAY, now + 2n * DAY, b32("11")],
    );

    assert.equal(await usdc.read.balanceOf([board.address]), REWARD);

    await board.write.startWorking([0n], { account: alice.account });
    await board.write.startWorking([0n], { account: bob.account });
    assert.equal(await board.read.getBounty([0n]).then((b) => b.workerCount), 2);

    await board.write.approveWork([0n, bob.account.address, b32("22")], {
      account: creator.account,
    });

    const b = await board.read.getBounty([0n]);
    assert.equal(b.status, Status.Completed);
    assert.equal(b.winnerCount, 1);
    assert.equal(await usdc.read.balanceOf([bob.account.address]), REWARD);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), 0n);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
  });

  it("multi-winner bounty: pays up to maxWinners and refunds the rest on finalize", async function () {
    const { creator, alice, bob, carol, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await create(board, creator, 2, now); // 2 winners @ 100 USDC = 200 escrowed
    assert.equal(await usdc.read.balanceOf([board.address]), REWARD * 2n);

    for (const w of [alice, bob, carol]) {
      await board.write.startWorking([0n], { account: w.account });
    }

    await board.write.approveWork([0n, alice.account.address, b32("a1")], {
      account: creator.account,
    });
    // one slot left -> still Open
    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Open);
    assert.equal(await board.read.remainingReward([0n]), REWARD);

    await board.write.approveWork([0n, bob.account.address, b32("b1")], {
      account: creator.account,
    });

    // cap reached -> Completed
    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Completed);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), REWARD);
    assert.equal(await usdc.read.balanceOf([bob.account.address]), REWARD);
    assert.equal(await usdc.read.balanceOf([carol.account.address]), 0n);

    const winners = await board.read.getWinners([0n]);
    assert.deepEqual(
      winners.map((w) => w.toLowerCase()),
      [alice.account.address.toLowerCase(), bob.account.address.toLowerCase()],
    );
  });

  it("finalize closes early with fewer than maxWinners and refunds the creator", async function () {
    const { creator, alice, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await create(board, creator, 3, now); // 300 escrowed
    await board.write.startWorking([0n], { account: alice.account });
    await board.write.approveWork([0n, alice.account.address, b32("a1")], {
      account: creator.account,
    });

    await board.write.finalizeBounty([0n], { account: creator.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Completed);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), REWARD);
    // creator spent 100 of 1000, got 200 back
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n - REWARD);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
  });

  it("escrows exactly rewardPerWinner * maxWinners", async function () {
    const { creator, usdc, board, now } = await networkHelpers.loadFixture(deploy);
    await create(board, creator, 5, now);
    assert.equal(await usdc.read.balanceOf([board.address]), REWARD * 5n);
  });

  it("blocks the creator from withdrawing once someone is working", async function () {
    const { creator, alice, board, now } = await networkHelpers.loadFixture(deploy);

    await create(board, creator, 2, now);
    await board.write.startWorking([0n], { account: alice.account });

    await viem.assertions.revertWithCustomError(
      board.write.cancelBounty([0n], { account: creator.account }),
      board,
      "WorkersPresent",
    );
  });

  it("rejects approving someone who never started working", async function () {
    const { creator, alice, bob, board, now } = await networkHelpers.loadFixture(deploy);

    await create(board, creator, 2, now);
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

    await create(board, creator, 2, now);

    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(DAY) + 1 });
    await testClient.mine({ blocks: 1 });

    await board.write.expireBounty([0n], { account: bob.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Expired);
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n);
  });

  it("breaks the deadlock: expire after partial payout refunds only the unspent escrow", async function () {
    const { creator, alice, bob, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await create(board, creator, 3, now); // 300 escrowed
    await board.write.startWorking([0n], { account: alice.account });
    await board.write.approveWork([0n, alice.account.address, b32("a1")], {
      account: creator.account,
    });
    // creator now stalls with 2 slots unfilled and a worker set that reports
    // "not complete" for expiry purposes
    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(2n * DAY + REVIEW_PERIOD) + 1 });
    await testClient.mine({ blocks: 1 });

    await board.write.expireBounty([0n], { account: bob.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), Status.Expired);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), REWARD); // keeps pay
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n - REWARD);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
  });
});
