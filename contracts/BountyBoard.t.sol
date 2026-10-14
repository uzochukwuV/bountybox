// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "./BountyBoard.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract BountyBoardTest is Test {
  MockUSDC internal usdc;
  BountyBoard internal board;

  address internal creator = makeAddr("creator");
  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");
  address internal carol = makeAddr("carol");
  address internal dave = makeAddr("dave");
  address internal stranger = makeAddr("stranger");

  uint256 internal constant REWARD = 100e6; // 100 USDC per winner
  uint64 internal constant REVIEW_PERIOD = 1 days;

  function setUp() public {
    usdc = new MockUSDC();
    board = new BountyBoard(usdc);

    usdc.mint(creator, 1_000e6);
    vm.prank(creator);
    usdc.approve(address(board), type(uint256).max);
  }

  /// Single-winner bounty: escrows exactly REWARD.
  function _create() internal returns (uint256 id) {
    vm.prank(creator);
    id = board.createBounty(
      REWARD,
      1,
      5, // maxWorkers
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      REVIEW_PERIOD,
      bytes32("content")
    );
  }

  /// Multi-winner bounty: escrows REWARD per winner.
  function _createMulti(uint32 maxWinners) internal returns (uint256 id) {
    return _createCapped(maxWinners, 10);
  }

  /// Multi-winner bounty with an explicit worker cap.
  function _createCapped(uint32 maxWinners, uint32 maxWorkers) internal returns (uint256 id) {
    vm.prank(creator);
    id = board.createBounty(
      REWARD,
      maxWinners,
      maxWorkers,
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      REVIEW_PERIOD,
      bytes32("content")
    );
  }

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  function test_CreateEscrowsRewardPerWinnerTimesMaxWinners() public {
    uint256 before = usdc.balanceOf(creator);
    uint256 id = _createMulti(3);

    assertEq(usdc.balanceOf(creator), before - REWARD * 3);
    assertEq(usdc.balanceOf(address(board)), REWARD * 3);
    assertEq(board.remainingReward(id), REWARD * 3);

    BountyBoard.Bounty memory b = board.getBounty(id);
    assertEq(b.creator, creator);
    assertEq(b.rewardPerWinner, REWARD);
    assertEq(b.maxWinners, 3);
    assertEq(b.maxWorkers, 10);
    assertEq(b.reviewPeriod, REVIEW_PERIOD);
    assertEq(b.winnerCount, 0);
    assertTrue(board.isFunded(id));
    assertEq(board.totalEscrowed(), REWARD * 3);
  }

  function test_SingleWinnerBountyIsTheMaxWinnersOneCase() public {
    uint256 before = usdc.balanceOf(creator);
    uint256 id = _create();
    assertEq(usdc.balanceOf(creator), before - REWARD);
    assertEq(board.getBounty(id).maxWinners, 1);
  }

  function test_CreateRevertsOnZeroReward() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.ZeroReward.selector);
    board.createBounty(
      0, 1, 5, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), REVIEW_PERIOD, 0
    );
  }

  function test_CreateRevertsOnZeroWinners() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidWinners.selector);
    board.createBounty(
      REWARD, 0, 5, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), REVIEW_PERIOD, 0
    );
  }

  function test_CreateRevertsOnZeroMaxWorkers() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidMaxWorkers.selector);
    board.createBounty(
      REWARD, 1, 0, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), REVIEW_PERIOD, 0
    );
  }

  function test_CreateRevertsWhenMaxWorkersBelowMaxWinners() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidMaxWorkers.selector);
    board.createBounty(
      REWARD, 3, 2, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), REVIEW_PERIOD, 0
    );
  }

  function test_CreateRevertsOnZeroReviewPeriod() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidReviewPeriod.selector);
    board.createBounty(
      REWARD, 1, 5, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), 0, 0
    );
  }

  function test_CreateRevertsWhenDeadlinesInvalid() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidDeadlines.selector);
    board.createBounty(
      REWARD, 1, 5, uint64(block.timestamp + 2 days), uint64(block.timestamp + 1 days), REVIEW_PERIOD, 0
    );
  }

  // ---------------------------------------------------------------------------
  // startWorking
  // ---------------------------------------------------------------------------

  function test_StartWorkingRegistersWorker() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);

    assertTrue(board.isWorking(id, alice));
    assertEq(board.getBounty(id).workerCount, 1);
    assertEq(board.getWorkers(id).length, 1);
    assertEq(board.getWorkers(id)[0], alice);
  }

  function test_MultipleWorkersCanStart() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(bob);
    board.startWorking(id);

    assertEq(board.getBounty(id).workerCount, 2);
    address[] memory ws = board.getWorkers(id);
    assertEq(ws.length, 2);
    assertEq(ws[0], alice);
    assertEq(ws[1], bob);
  }

  function test_StartWorkingTwiceReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(alice);
    vm.expectRevert(BountyBoard.AlreadyWorking.selector);
    board.startWorking(id);
  }

  function test_StartWorkingBeyondMaxWorkersReverts() public {
    uint256 id = _createCapped(1, 2);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(bob);
    board.startWorking(id);

    assertEq(board.getBounty(id).workerCount, 2);

    vm.prank(carol);
    vm.expectRevert(BountyBoard.MaxWorkersReached.selector);
    board.startWorking(id);
  }

  function test_MaxWorkersEqualToMaxWinnersIsAllowed() public {
    uint256 id = _createCapped(2, 2);
    assertEq(board.getBounty(id).maxWorkers, 2);
  }

  function test_CreatorCannotStartWorking() public {
    uint256 id = _create();
    vm.prank(creator);
    vm.expectRevert(BountyBoard.CreatorCannotWork.selector);
    board.startWorking(id);
  }

  function test_StartWorkingAfterDeadlineReverts() public {
    uint256 id = _create();
    vm.warp(block.timestamp + 1 days + 1);
    vm.prank(alice);
    vm.expectRevert(BountyBoard.ApplicationsClosed.selector);
    board.startWorking(id);
  }

  // ---------------------------------------------------------------------------
  // approveWork (single winner)
  // ---------------------------------------------------------------------------

  function test_ApproveSingleWinnerPaysAndCompletes() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(bob);
    board.startWorking(id);

    vm.prank(creator);
    board.approveWork(id, bob, bytes32("bob-submission"));

    assertEq(usdc.balanceOf(bob), REWARD);
    assertEq(usdc.balanceOf(alice), 0);
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Completed));
    assertTrue(board.isWinner(id, bob));
    assertFalse(board.isFunded(id));
    assertEq(board.totalEscrowed(), 0);
  }

  // ---------------------------------------------------------------------------
  // approveWork (multiple winners)
  // ---------------------------------------------------------------------------

  function test_MultipleWinnersEachPaid() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(bob);
    board.startWorking(id);
    vm.prank(carol);
    board.startWorking(id);

    vm.startPrank(creator);
    board.approveWork(id, alice, bytes32("a"));
    board.approveWork(id, bob, bytes32("b"));
    // still Open with one slot left
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Open));
    assertEq(board.remainingReward(id), REWARD);
    board.approveWork(id, carol, bytes32("c"));
    vm.stopPrank();

    assertEq(usdc.balanceOf(alice), REWARD);
    assertEq(usdc.balanceOf(bob), REWARD);
    assertEq(usdc.balanceOf(carol), REWARD);
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Completed));
    assertEq(board.getWinners(id).length, 3);
    assertEq(board.totalEscrowed(), 0);
  }

  function test_ApproveBeyondMaxWinnersReverts() public {
    uint256 id = _createMulti(2);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(bob);
    board.startWorking(id);
    vm.prank(carol);
    board.startWorking(id);

    vm.startPrank(creator);
    board.approveWork(id, alice, bytes32("a"));
    board.approveWork(id, bob, bytes32("b"));
    vm.expectRevert(BountyBoard.WrongStatus.selector); // Completed after the cap
    board.approveWork(id, carol, bytes32("c"));
    vm.stopPrank();
  }

  function test_ApproveSameWorkerTwiceReverts() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("a"));
    vm.prank(creator);
    vm.expectRevert(BountyBoard.AlreadyWinner.selector);
    board.approveWork(id, alice, bytes32("a2"));
  }

  function test_ApproveNonWorkerReverts() public {
    uint256 id = _createMulti(2);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.NotWorking.selector);
    board.approveWork(id, bob, bytes32("s"));
  }

  function test_ApproveOnlyCreator() public {
    uint256 id = _createMulti(2);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.approveWork(id, alice, bytes32("s"));
  }

  // ---------------------------------------------------------------------------
  // finalizeBounty (close early + refund unspent)
  // ---------------------------------------------------------------------------

  function test_FinalizeRefundsUnspentToCreator() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("a"));

    uint256 before = usdc.balanceOf(creator);
    vm.prank(creator);
    board.finalizeBounty(id);

    assertEq(usdc.balanceOf(creator), before + REWARD * 2); // 2 unspent slots
    assertEq(usdc.balanceOf(alice), REWARD);
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Completed));
    assertEq(board.totalEscrowed(), 0);
  }

  function test_FinalizeWithoutAnyWinnerReverts() public {
    uint256 id = _createMulti(3);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.NothingPaid.selector);
    board.finalizeBounty(id);
  }

  function test_FinalizeOnlyCreator() public {
    uint256 id = _createMulti(2);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("a"));
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.finalizeBounty(id);
  }

  // ---------------------------------------------------------------------------
  // cancelBounty (only when nobody is working)
  // ---------------------------------------------------------------------------

  function test_CancelWithNoWorkersRefunds() public {
    uint256 id = _createMulti(3);
    uint256 before = usdc.balanceOf(creator);
    vm.prank(creator);
    board.cancelBounty(id);

    assertEq(usdc.balanceOf(creator), before + REWARD * 3);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Cancelled));
    assertEq(board.totalEscrowed(), 0);
  }

  function test_CancelWithWorkersPresentReverts() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WorkersPresent.selector);
    board.cancelBounty(id);
  }

  // ---------------------------------------------------------------------------
  // expireBounty (safety valve, per-bounty review period)
  // ---------------------------------------------------------------------------

  function test_ExpireAbandonedWithNoWorkers() public {
    uint256 id = _createMulti(3);
    vm.warp(block.timestamp + 1 days + 1);
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
    assertEq(board.totalEscrowed(), 0);
  }

  function test_ExpireWithLiveWorkersBeforeGraceReverts() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);

    vm.warp(block.timestamp + 1 days + 1);
    vm.expectRevert(BountyBoard.ExpiryNotReached.selector);
    board.expireBounty(id);
  }

  function test_ExpireCreatorSilentAfterGrace() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);

    vm.warp(block.timestamp + 2 days + REVIEW_PERIOD + 1);
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
  }

  function test_ExpireRespectsPerBountyReviewPeriod() public {
    // Bounty A: short 1-hour review. Bounty B: long 7-day review.
    vm.startPrank(creator);
    uint256 a = board.createBounty(
      REWARD,
      1,
      5,
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      1 hours,
      bytes32("a")
    );
    uint256 b = board.createBounty(
      REWARD,
      1,
      5,
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      7 days,
      bytes32("b")
    );
    vm.stopPrank();

    vm.prank(alice);
    board.startWorking(a);
    vm.prank(bob);
    board.startWorking(b);

    vm.warp(block.timestamp + 2 days + 1 hours + 1);

    // A is expirable; B is not yet.
    vm.prank(stranger);
    board.expireBounty(a);
    assertEq(uint256(board.getBounty(a).status), uint256(BountyBoard.Status.Expired));

    vm.prank(stranger);
    vm.expectRevert(BountyBoard.ExpiryNotReached.selector);
    board.expireBounty(b);
  }

  function test_ExpireRefundsOnlyUnspentAfterPartialPayout() public {
    uint256 id = _createMulti(3);
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("a"));

    // creator accepted only 1 of 3 and went silent
    vm.warp(block.timestamp + 2 days + REVIEW_PERIOD + 1);
    uint256 before = usdc.balanceOf(creator);
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(alice), REWARD); // winner keeps the reward
    assertEq(usdc.balanceOf(creator), before + REWARD * 2); // unspent refunded
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(board.totalEscrowed(), 0);
  }

  function test_ExpireCompletedReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("s"));
    vm.warp(block.timestamp + 100 days);
    vm.expectRevert(BountyBoard.WrongStatus.selector);
    board.expireBounty(id);
  }

  // ---------------------------------------------------------------------------
  // rescueSurplus (stray USDC sent outside createBounty)
  // ---------------------------------------------------------------------------

  function test_RescueSurplusReturnsStrayFunds() public {
    uint256 id = _createMulti(2); // 200 escrowed
    assertEq(board.totalEscrowed(), REWARD * 2);

    // Stranger accidentally transfers USDC directly to the board.
    usdc.mint(stranger, 50e6);
    vm.prank(stranger);
    usdc.transfer(address(board), 50e6);

    assertEq(board.surplus(), 50e6);

    uint256 before = usdc.balanceOf(dave);
    vm.prank(stranger);
    board.rescueSurplus(dave, 50e6);

    assertEq(usdc.balanceOf(dave), before + 50e6);
    assertEq(board.surplus(), 0);
    // Escrow untouched: the bounty can still pay out in full.
    assertEq(usdc.balanceOf(address(board)), REWARD * 2);
    assertEq(board.totalEscrowed(), REWARD * 2);

    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("a"));
    assertEq(usdc.balanceOf(alice), REWARD);
  }

  function test_RescueRevertsWhenNoSurplus() public {
    _createMulti(2);
    assertEq(board.surplus(), 0);
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NothingToRescue.selector);
    board.rescueSurplus(stranger, 1);
  }

  function test_RescueCannotTouchEscrow() public {
    _createMulti(2); // 200 escrowed, no surplus
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NothingToRescue.selector);
    board.rescueSurplus(stranger, REWARD);

    // Partial surplus: can rescue the stray part, not a wei more.
    usdc.mint(stranger, 10e6);
    vm.prank(stranger);
    usdc.transfer(address(board), 10e6);

    vm.prank(stranger);
    vm.expectRevert(BountyBoard.InsufficientSurplus.selector);
    board.rescueSurplus(stranger, 10e6 + 1);

    vm.prank(stranger);
    vm.expectRevert(BountyBoard.InsufficientSurplus.selector);
    board.rescueSurplus(stranger, 0);
  }

  function test_RescueRevertsOnZeroAddress() public {
    _createMulti(1);
    usdc.mint(stranger, 10e6);
    vm.prank(stranger);
    usdc.transfer(address(board), 10e6);

    vm.prank(stranger);
    vm.expectRevert(BountyBoard.ZeroAddress.selector);
    board.rescueSurplus(address(0), 10e6);
  }

  // ---------------------------------------------------------------------------
  // Misc
  // ---------------------------------------------------------------------------

  function test_UnknownBountyReverts() public {
    vm.expectRevert(BountyBoard.UnknownBounty.selector);
    board.getBounty(999);
  }

  function test_ConstructorRejectsZeroAddress() public {
    vm.expectRevert(BountyBoard.ZeroAddress.selector);
    new BountyBoard(MockUSDC(address(0)));
  }

  function testFuzz_CreateEscrowsExactly(uint96 reward, uint8 winners, uint8 workers) public {
    vm.assume(reward > 0 && winners > 0);
    vm.assume(workers >= winners && workers > 0);
    uint256 escrow = uint256(reward) * winners;
    usdc.mint(creator, escrow);
    vm.startPrank(creator);
    usdc.approve(address(board), escrow);
    board.createBounty(
      reward,
      winners,
      workers,
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      REVIEW_PERIOD,
      0
    );
    vm.stopPrank();
    assertEq(usdc.balanceOf(address(board)), escrow);
  }
}
