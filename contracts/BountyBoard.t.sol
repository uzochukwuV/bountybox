// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BountyBoard} from "./BountyBoard.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract BountyBoardTest is Test {
  MockUSDC internal usdc;
  BountyBoard internal board;

  address internal creator = makeAddr("creator");
  address internal worker = makeAddr("worker");
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

  function _assign(uint256 id) internal {
    vm.prank(creator);
    board.assignWorker(id, worker);
  }

  function _submit(uint256 id) internal {
    vm.prank(worker);
    board.submitWork(id, bytes32("submission"));
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
    assertEq(b.contentHash, bytes32("content"));
    assertTrue(board.isFunded(id));
  }

  function test_CreateEmitsFundedEvent() public {
    vm.expectEmit(true, true, false, true, address(board));
    emit BountyBoard.BountyCreated(0, creator, REWARD, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), bytes32("content"));
    _create();
  }

  function test_CreateRevertsOnZeroReward() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.ZeroReward.selector);
    board.createBounty(0, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), 0);
  }

  function test_CreateRevertsWhenDeadlinesInvalid() public {
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidDeadlines.selector);
    // submission deadline not after application deadline
    board.createBounty(REWARD, uint64(block.timestamp + 2 days), uint64(block.timestamp + 1 days), 0);
  }

  function test_CreateRevertsWhenApplicationDeadlineInPast() public {
    vm.warp(10 days);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.InvalidDeadlines.selector);
    board.createBounty(REWARD, uint64(block.timestamp - 1), uint64(block.timestamp + 1 days), 0);
  }

  // ---------------------------------------------------------------------------
  // Assignment
  // ---------------------------------------------------------------------------

  function test_AssignWorker() public {
    uint256 id = _create();
    _assign(id);

    BountyBoard.Bounty memory b = board.getBounty(id);
    assertEq(b.worker, worker);
    assertEq(uint256(b.status), uint256(BountyBoard.Status.Assigned));
  }

  function test_AssignOnlyCreator() public {
    uint256 id = _create();
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.assignWorker(id, worker);
  }

  function test_AssignRejectsCreatorAsWorker() public {
    uint256 id = _create();
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WorkerIsCreator.selector);
    board.assignWorker(id, creator);
  }

  function test_AssignAfterDeadlineReverts() public {
    uint256 id = _create();
    vm.warp(block.timestamp + 1 days + 1);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.ApplicationsClosed.selector);
    board.assignWorker(id, worker);
  }

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  function test_SubmitRecordsReference() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);

    BountyBoard.Bounty memory b = board.getBounty(id);
    assertEq(b.submissionRef, bytes32("submission"));
    assertEq(b.submittedAt, uint64(block.timestamp));
    assertEq(uint256(b.status), uint256(BountyBoard.Status.Submitted));
  }

  function test_SubmitOnlyWorker() public {
    uint256 id = _create();
    _assign(id);
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotWorker.selector);
    board.submitWork(id, bytes32("x"));
  }

  function test_SubmitAfterDeadlineReverts() public {
    uint256 id = _create();
    _assign(id);
    vm.warp(block.timestamp + 2 days + 1);
    vm.prank(worker);
    vm.expectRevert(BountyBoard.SubmissionsClosed.selector);
    board.submitWork(id, bytes32("x"));
  }

  // ---------------------------------------------------------------------------
  // Approval / payout
  // ---------------------------------------------------------------------------

  function test_ApprovePaysWorker() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);

    vm.prank(creator);
    board.approveWork(id);

    assertEq(usdc.balanceOf(worker), REWARD);
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Completed));
    assertFalse(board.isFunded(id));
  }

  function test_ApproveOnlyCreator() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);
    vm.prank(worker);
    vm.expectRevert(BountyBoard.NotCreator.selector);
    board.approveWork(id);
  }

  function test_ApproveRequiresSubmitted() public {
    uint256 id = _create();
    _assign(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WrongStatus.selector);
    board.approveWork(id);
  }

  // ---------------------------------------------------------------------------
  // Cancel / expire
  // ---------------------------------------------------------------------------

  function test_CancelRefundsCreator() public {
    uint256 id = _create();
    uint256 before = usdc.balanceOf(creator);
    vm.prank(creator);
    board.cancelBounty(id);

    assertEq(usdc.balanceOf(creator), before + REWARD);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Cancelled));
  }

  function test_CancelAfterAssignmentReverts() public {
    uint256 id = _create();
    _assign(id);
    vm.prank(creator);
    vm.expectRevert(BountyBoard.WrongStatus.selector);
    board.cancelBounty(id);
  }

  function test_ExpireRefundsAnyoneAfterDeadline() public {
    uint256 id = _create();
    vm.warp(block.timestamp + 1 days + 1);

    // anyone can trigger the refund; funds still go to the creator
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
  }

  function test_ExpireBeforeDeadlineReverts() public {
    uint256 id = _create();
    vm.expectRevert(BountyBoard.ApplicationsClosed.selector);
    board.expireBounty(id);
  }

  /// A worker who is assigned but never delivers must not lock the funds: once
  /// the submission deadline passes, anyone can refund the creator.
  function test_ExpireAssignedAfterSubmissionDeadlineRefunds() public {
    uint256 id = _create();
    _assign(id);

    // still before the submission deadline -> cannot expire yet
    vm.expectRevert(BountyBoard.SubmissionOpen.selector);
    board.expireBounty(id);

    vm.warp(block.timestamp + 2 days + 1);
    vm.prank(stranger);
    board.expireBounty(id);

    assertEq(usdc.balanceOf(creator), 1_000e6);
    assertEq(usdc.balanceOf(address(board)), 0);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Expired));
  }

  function test_ExpireSubmittedReverts() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);
    vm.warp(block.timestamp + 100 days);
    vm.expectRevert(BountyBoard.WrongStatus.selector);
    board.expireBounty(id);
  }

  // ---------------------------------------------------------------------------
  // Reclaim after silent creator
  // ---------------------------------------------------------------------------

  function test_ClaimUnreviewedPaysWorkerAfterWindow() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);

    // still inside the review window
    vm.prank(worker);
    vm.expectRevert(BountyBoard.ReviewWindowOpen.selector);
    board.claimUnreviewed(id);

    vm.warp(block.timestamp + REVIEW_PERIOD + 1);
    vm.prank(worker);
    board.claimUnreviewed(id);

    assertEq(usdc.balanceOf(worker), REWARD);
    assertEq(uint256(board.getBounty(id).status), uint256(BountyBoard.Status.Reclaimed));
  }

  function test_ClaimUnreviewedOnlyWorker() public {
    uint256 id = _create();
    _assign(id);
    _submit(id);
    vm.warp(block.timestamp + REVIEW_PERIOD + 1);
    vm.prank(stranger);
    vm.expectRevert(BountyBoard.NotWorker.selector);
    board.claimUnreviewed(id);
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
