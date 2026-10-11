import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

// USDC amounts are in 6-decimal base units.
const REWARD = 100_000_000n; // 100 USDC
const REVIEW_PERIOD = 86_400n; // 1 day
const DAY = 86_400n;

// viem types byte params as `0x${string}`; build them explicitly.
const b32 = (s: string) => `0x${s.repeat(32)}` as const;

describe("BountyBoard", async function () {
  const { viem, networkHelpers } = await network.create();

  async function deploy() {
    const [creator, worker, other] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const usdc = await viem.deployContract("MockUSDC");
    const board = await viem.deployContract("BountyBoard", [usdc.address, REVIEW_PERIOD]);

    await usdc.write.mint([creator.account.address, 1_000_000_000n]); // 1000 USDC
    await usdc.write.approve([board.address, 2n ** 256n - 1n], {
      account: creator.account,
    });

    const now = BigInt((await publicClient.getBlock()).timestamp);
    return { creator, worker, other, usdc, board, now };
  }

  it("runs the happy path: fund -> assign -> submit -> approve", async function () {
    const { creator, worker, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await viem.assertions.emitWithArgs(
      board.write.createBounty(
        [REWARD, now + DAY, now + 2n * DAY, b32("11")],
        { account: creator.account },
      ),
      board,
      "BountyCreated",
      [0n, creator.account.address, REWARD, now + DAY, now + 2n * DAY, b32("11")],
    );

    // funds are held by the contract
    assert.equal(await usdc.read.balanceOf([board.address]), REWARD);

    await board.write.assignWorker([0n, worker.account.address], {
      account: creator.account,
    });
    await board.write.submitWork([0n, b32("22")], {
      account: worker.account,
    });
    await board.write.approveWork([0n], { account: creator.account });

    const b = await board.read.getBounty([0n]);
    assert.equal(b.status, 3); // Completed
    assert.equal(b.worker.toLowerCase(), worker.account.address.toLowerCase());
    assert.equal(await usdc.read.balanceOf([worker.account.address]), REWARD);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
    assert.equal(await board.read.isFunded([0n]), false);
  });

  it("refunds the creator when an open bounty is cancelled", async function () {
    const { creator, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.cancelBounty([0n], { account: creator.account });

    const b = await board.read.getBounty([0n]);
    assert.equal(b.status, 4); // Cancelled
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n);
  });

  it("lets the worker reclaim the reward if the creator never reviews", async function () {
    const { creator, worker, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.assignWorker([0n, worker.account.address], {
      account: creator.account,
    });
    await board.write.submitWork([0n, b32("33")], {
      account: worker.account,
    });

    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(REVIEW_PERIOD) + 1 });
    await testClient.mine({ blocks: 1 });

    await board.write.claimUnreviewed([0n], { account: worker.account });

    const b = await board.read.getBounty([0n]);
    assert.equal(b.status, 6); // Reclaimed
    assert.equal(await usdc.read.balanceOf([worker.account.address]), REWARD);
  });

  it("enforces creator-only approval", async function () {
    const { creator, worker, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.assignWorker([0n, worker.account.address], {
      account: creator.account,
    });
    await board.write.submitWork([0n, b32("44")], {
      account: worker.account,
    });

    await viem.assertions.revertWithCustomError(
      board.write.approveWork([0n], { account: worker.account }),
      board,
      "NotCreator",
    );
  });

  it("refunds the creator if the assigned worker never delivers", async function () {
    const { creator, worker, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });
    await board.write.assignWorker([0n, worker.account.address], {
      account: creator.account,
    });

    const testClient = await viem.getTestClient();
    await testClient.increaseTime({ seconds: Number(2n * DAY) + 1 });
    await testClient.mine({ blocks: 1 });

    await board.write.expireBounty([0n], { account: worker.account });

    assert.equal(await board.read.getBounty([0n]).then((b) => b.status), 5); // Expired
    assert.equal(await usdc.read.balanceOf([creator.account.address]), 1_000_000_000n);
    assert.equal(await usdc.read.balanceOf([board.address]), 0n);
  });

  it("escrows the exact reward amount", async function () {
    const { creator, usdc, board, now } = await networkHelpers.loadFixture(deploy);

    await board.write.createBounty([REWARD, now + DAY, now + 2n * DAY, b32("00")], {
      account: creator.account,
    });

    assert.equal(await usdc.read.balanceOf([board.address]), REWARD);
  });
});
