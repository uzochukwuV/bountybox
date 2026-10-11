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
  address internal stranger = makeAddr("stranger");

  uint256 internal constant REWARD = 100e6; // 100 USDC (6 decimals)
  uint64 internal constant REVIEW_PERIOD = 1 days;

  function setUp() public {
    usdc = new MockUSDC();
    board = new BountyBoard(usdc, REVIEW_PERIOD);

    usdc.mint(creator, 1_000e6);
    vm.prank(creator);
    usdc.approve(address(board), type(uint256).max);
  }

  function _create() internal returns (uint256 id) {
    vm.prank(creator);
    id = board.createBounty(
      REWARD,
      uint64(block.timestamp + 1 days),
      uint64(block.timestamp + 2 days),
      bytes32("content")
    );
  }

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  function test_CreateEscrowsFundsAndRecords() public {
    uint256 before = usdc.balanceOf(creator);
    uint256 id = _create();

    assertEq(id, 0);
    assertEq(board.bountyCount(), 1);
    assertEq(usdc.balanceOf(creator), before - REWARD);
    assertEq(usdc.balanceOf(address(board)), REWARD);

    BountyBoard.Bounty memory b = board.getBounty(id);
    assertEq(b.creator, creator);
    assertEq(b.reward, REWARD);
    assertEq(uint256(b.status), uint256(BountyBoard.Status.Open));
    assertEq(b.workerCount, 0);
    assertTrue(board.isFunded(id));
  }

  function test_CreateRevertsOnZeroReward() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.ZeroReward.selector);
    board.createBounty(0, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), 0);
  }

  function test_CreateRevertsWhenDeadlinesInvalid() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidDeadlines.selector);
    board.createBounty(REWARD, uint64(block.timestamp + 2 days), uint64(block.timestamp + 1 days), 0);
  }

  function test_CreateRevertsWhenApplicationDeadlineInPast() public {
    vm.warp(10 days);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidDeadlines.selector);
    board.createBounty(REWARD, uint64(block.timestamp - 1), uint64(block.timestamp + 1 days), 0);
  }

  // ---------------------------------------------------------------------------
  // startWorking (the "working on it" button)
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

  function test_StartWorkingEmitsEvent() public {
    uint256 id = _create();
    vm.expectEmit(true, true, false, false, address(board));
    emit BountyBoard.WorkStarted(id, alice);
    vm.prank(alice);
    board.startWorking(id);
  }

  // ---------------------------------------------------------------------------
  // approveWork (creator accepts any worker who started)
  // ---------------------------------------------------------------------------

  function test_ApproveAnyWorkerPaysThem() public {
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

    BountyBoard.Bounty memory b = board.getBounty(id);
    assertEq(uint256(b.status), uint256(BountyBoard.Status.Completed));
    assertEq(b.winningWorker, bob);
    assertEq(b.winningSubmissionRef, bytes32("bob-submission"));
    assertFalse(board.isFunded(id));
  }

  function test_ApproveOnlyCreator() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.approveWork(id, alice, bytes32("s"));
  }

  function test_ApproveNonWorkerReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.NotWorking.selector);
    board.approveWork(id, bob, bytes32("s"));
  }

  function test_ApproveTwiceReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    board.approveWork(id, alice, bytes32("s"));
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WrongStatus.selector);
    board.approveWork(id, alice, bytes32("s2"));
  }

  // ---------------------------------------------------------------------------
  // cancelBounty (only when nobody is working)
  // ---------------------------------------------------------------------------

  function test_CancelWithNoWorkersRefunds() public {
    uint256 id = _create();
    uint256 before = usdc.balanceOf(creator);
    vm.prank(creator);
    board.cancelBounty(id);

    assertEq(usdc.balanceOf(creator), before + REWARD);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Cancelled));
  }

  function test_CancelWithWorkersPresentReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WorkersPresent.selector);
    board.cancelBounty(id);
  }

  function test_CancelOnlyCreator() public {
    uint256 id = _create();
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.cancelBounty(id);
  }

  // ---------------------------------------------------------------------------
  // expireBounty (safety valve)
  // ---------------------------------------------------------------------------

  function test_ExpireAbandonedWithNoWorkers() public {
    uint256 id = _create();
    vm.warp(block.timestamp + 1 days + 1);
    vm.prank(stranger); // anyone may trigger the refund
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
  }

  function test_ExpireWithWorkersBeforeReviewGraceReverts() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);

    // after the app deadline but before the submission deadline + grace: a
    // worker is present, so the bounty is not abandoned and can't expire yet.
    vm.warp(block.timestamp + 1 days + 1);
    vm.expectRevert(BountyBoard.ExpiryNotReached.selector);
    board.expireBounty(id);
  }

  function test_ExpireWhenCreatorSilentAfterGrace() public {
    uint256 id = _create();
    vm.prank(alice);
    board.startWorking(id);

    vm.warp(block.timestamp + 2 days + REVIEW_PERIOD + 1);
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
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
  // Misc
  // ---------------------------------------------------------------------------

  function test_UnknownBountyReverts() public {
    vm.expectRevert(BountyBoard.UnknownBounty.selector);
    board.getBounty(999);
  }

  function test_ConstructorRejectsZeroAddress() public {
    vm.expectRevert(BountyBoard.ZeroAddress.selector);
    new BountyBoard(MockUSDC(address(0)), REVIEW_PERIOD);
  }

  function test_ConstructorRejectsZeroReviewPeriod() public {
    vm.expectRevert(BountyBoard.InvalidReviewPeriod.selector);
    new BountyBoard(usdc, 0);
  }

  function testFuzz_CreateEscrowsExactly(uint96 reward) public {
    vm.assume(reward > 0);
    usdc.mint(creator, reward);
    vm.startPrank(creator);
    usdc.approve(address(board), reward);
    board.createBounty(reward, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), 0);
    vm.stopPrank();
    assertEq(usdc.balanceOf(address(board)), reward);
  }
}
