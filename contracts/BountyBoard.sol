// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyBoard
/// @notice USDC escrow and rule enforcement for a micro-task bounty platform.
/// @dev The contract is intentionally small: it custodies funds and records the
///      value-bearing facts of a bounty's lifecycle. All human-readable content
///      (title, description, attachments, comments, submissions) lives offchain
///      and is referenced here only by an opaque content hash. The accepted work
///      is referenced by a submission hash. Nothing offchain is trusted for
///      money movement; it is only used by the UI/API to resolve hashes.
contract BountyBoard is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  /// @dev Lifecycle of a bounty. Money moves only out of Open and Submitted.
  enum Status {
    Open, // funded, accepting applications
    Assigned, // a worker has been assigned, work in progress
    Submitted, // worker delivered a submission reference, awaiting review
    Completed, // paid out to the worker
    Cancelled, // refunded to the creator before assignment
    Expired, // application deadline passed with no worker, refunded
    Reclaimed // creator never reviewed in time, worker claimed the reward
  }

  struct Bounty {
    address creator; // funds the escrow, approves the work
    uint64 applicationDeadline; // last timestamp a worker can be assigned
    uint64 submissionDeadline; // last timestamp work can be submitted
    Status status;
    uint256 reward; // USDC amount held in escrow (6-decimal base units)
    address worker; // assigned worker, if any
    uint64 submittedAt; // timestamp work was submitted, if any
    bytes32 contentHash; // offchain metadata root (title, description, files)
    bytes32 submissionRef; // accepted submission reference/hash
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  /// @notice USDC token used for all rewards. On Arc this is the ERC-20
  ///         interface at 0x3600...0000; on test chains it is a MockUSDC.
  IERC20 public immutable usdc;

  /// @notice Time a creator has to review a submission before the worker can
  ///         claim the reward without the creator's cooperation.
  uint64 public immutable reviewPeriod;

  /// @notice Number of bounties ever created; also the id of the next bounty.
  uint256 public bountyCount;

  mapping(uint256 id => Bounty) private _bounties;

  // ---------------------------------------------------------------------------
  // Events (bounty lifecycle)
  // ---------------------------------------------------------------------------

  event BountyCreated(
    uint256 indexed id,
    address indexed creator,
    uint256 reward,
    uint64 applicationDeadline,
    uint64 submissionDeadline,
    bytes32 contentHash
  );
  event BountyFunded(uint256 indexed id, address indexed creator, uint256 amount);
  event WorkerAssigned(uint256 indexed id, address indexed worker);
  event WorkSubmitted(uint256 indexed id, address indexed worker, bytes32 submissionRef);
  event BountyCompleted(uint256 indexed id, address indexed worker, uint256 amount);
  event BountyCancelled(uint256 indexed id, address indexed creator, uint256 refund);
  event BountyExpired(uint256 indexed id, address indexed creator, uint256 refund);
  event BountyReclaimed(uint256 indexed id, address indexed worker, uint256 amount);

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  error ZeroReward();
  error InvalidDeadlines();
  error InvalidReviewPeriod();
  error ZeroAddress();
  error UnknownBounty();
  error NotCreator();
  error NotWorker();
  error WrongStatus();
  error ApplicationsClosed();
  error SubmissionsClosed();
  error ReviewWindowOpen();
  error WorkerIsCreator();

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------

  modifier onlyCreator(uint256 id) {
    if (_bounties[id].creator != msg.sender) revert NotCreator();
    _;
  }

  modifier onlyWorker(uint256 id) {
    if (_bounties[id].worker != msg.sender) revert NotWorker();
    _;
  }

  modifier existing(uint256 id) {
    if (id >= bountyCount) revert UnknownBounty();
    _;
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /// @param usdc_ ERC-20 USDC used for rewards.
  /// @param reviewPeriod_ Seconds a creator has to review before a worker can
  ///        reclaim an unreviewed submission. Must be greater than zero.
  constructor(IERC20 usdc_, uint64 reviewPeriod_) {
    if (address(usdc_) == address(0)) revert ZeroAddress();
    if (reviewPeriod_ == 0) revert InvalidReviewPeriod();
    usdc = usdc_;
    reviewPeriod = reviewPeriod_;
  }

  // ---------------------------------------------------------------------------
  // Creator flow
  // ---------------------------------------------------------------------------

  /// @notice Creates a funded bounty. Reward is pulled into escrow immediately.
  /// @param reward USDC amount in 6-decimal base units.
  /// @param applicationDeadline Last timestamp a worker can be assigned.
  /// @param submissionDeadline Last timestamp work can be submitted.
  /// @param contentHash Hash/root of the offchain task content.
  /// @return id The new bounty id.
  function createBounty(
    uint256 reward,
    uint64 applicationDeadline,
    uint64 submissionDeadline,
    bytes32 contentHash
  ) external nonReentrant returns (uint256 id) {
    if (reward == 0) revert ZeroReward();
    if (applicationDeadline < block.timestamp || submissionDeadline <= applicationDeadline) {
      revert InvalidDeadlines();
    }

    id = bountyCount++;
    Bounty storage b = _bounties[id];
    b.creator = msg.sender;
    b.reward = reward;
    b.applicationDeadline = applicationDeadline;
    b.submissionDeadline = submissionDeadline;
    b.status = Status.Open;
    b.contentHash = contentHash;

    // Pull funds into escrow before recording the bounty as funded.
    usdc.safeTransferFrom(msg.sender, address(this), reward);

    emit BountyCreated(
      id,
      msg.sender,
      reward,
      applicationDeadline,
      submissionDeadline,
      contentHash
    );
    emit BountyFunded(id, msg.sender, reward);
  }

  /// @notice Assigns an applicant as the worker. Creator-only, while Open.
  function assignWorker(
    uint256 id,
    address worker
  ) external existing(id) onlyCreator(id) {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (block.timestamp > b.applicationDeadline) revert ApplicationsClosed();
    if (worker == address(0)) revert ZeroAddress();
    if (worker == b.creator) revert WorkerIsCreator();

    b.worker = worker;
    b.status = Status.Assigned;
    emit WorkerAssigned(id, worker);
  }

  /// @notice Approves a submission and pays the worker. Creator-only.
  function approveWork(
    uint256 id
  ) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Submitted) revert WrongStatus();

    uint256 amount = b.reward;
    b.reward = 0;
    b.status = Status.Completed;

    usdc.safeTransfer(b.worker, amount);
    emit BountyCompleted(id, b.worker, amount);
  }

  /// @notice Refunds an open, unassigned bounty to its creator.
  function cancelBounty(
    uint256 id
  ) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();

    uint256 refund = b.reward;
    b.reward = 0;
    b.status = Status.Cancelled;

    usdc.safeTransfer(b.creator, refund);
    emit BountyCancelled(id, b.creator, refund);
  }

  // ---------------------------------------------------------------------------
  // Worker flow
  // ---------------------------------------------------------------------------

  /// @notice Submits a reference to the delivered work. Worker-only.
  function submitWork(
    uint256 id,
    bytes32 submissionRef
  ) external existing(id) onlyWorker(id) {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Assigned) revert WrongStatus();
    if (block.timestamp > b.submissionDeadline) revert SubmissionsClosed();

    b.submissionRef = submissionRef;
    b.submittedAt = uint64(block.timestamp);
    b.status = Status.Submitted;
    emit WorkSubmitted(id, b.worker, submissionRef);
  }

  /// @notice Claims the reward when the creator has not reviewed in time.
  ///         Worker-only, after the review window has elapsed.
  function claimUnreviewed(
    uint256 id
  ) external existing(id) onlyWorker(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Submitted) revert WrongStatus();
    if (block.timestamp <= uint256(b.submittedAt) + reviewPeriod) {
      revert ReviewWindowOpen();
    }

    uint256 amount = b.reward;
    b.reward = 0;
    b.status = Status.Reclaimed;

    usdc.safeTransfer(b.worker, amount);
    emit BountyReclaimed(id, b.worker, amount);
  }

  // ---------------------------------------------------------------------------
  // Permissionless maintenance
  // ---------------------------------------------------------------------------

  /// @notice Refunds a bounty whose application deadline passed with no worker.
  ///         Callable by anyone; funds always return to the creator.
  function expireBounty(uint256 id) external existing(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (block.timestamp <= b.applicationDeadline) revert ApplicationsClosed();

    uint256 refund = b.reward;
    b.reward = 0;
    b.status = Status.Expired;

    usdc.safeTransfer(b.creator, refund);
    emit BountyExpired(id, b.creator, refund);
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  /// @notice Returns the full onchain record for a bounty.
  function getBounty(uint256 id) external view existing(id) returns (Bounty memory) {
    return _bounties[id];
  }

  /// @notice True when funds are still held in escrow for `id`.
  function isFunded(uint256 id) external view existing(id) returns (bool) {
    Status s = _bounties[id].status;
    return s == Status.Open || s == Status.Assigned || s == Status.Submitted;
  }
}
