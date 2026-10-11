// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyBoard
/// @notice USDC escrow and rule enforcement for a micro-task bounty platform.
/// @dev Bounties are open to many workers: anyone may mark themselves as
///      working, and the creator accepts any one of them and pays that worker.
///      The contract is intentionally small: it custodies funds and records the
///      value-bearing facts of a bounty's lifecycle. All human-readable content
///      (title, description, attachments, comments, submissions) lives offchain
///      and is referenced here only by an opaque content hash. Nothing offchain
///      is trusted for money movement; it is only used by the UI/API to resolve
///      hashes and to display who is working.
///
///      Lifecycle:
///        createBounty  -> Open      (reward escrowed)
///        startWorking  -> Open      (any worker, before the application deadline)
///        cancelBounty  -> Cancelled (creator, only while no one is working)
///        approveWork   -> Completed (creator accepts one worker and pays them)
///        expireBounty  -> Expired   (refund; permissionless safety valve)
contract BountyBoard is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  enum Status {
    Open, // funded; workers may start, creator may cancel or accept one
    Completed, // creator accepted a worker's work and paid the reward
    Cancelled, // refunded to the creator because no one was working
    Expired // refunded to the creator via the permissionless safety valve
  }

  struct Bounty {
    address creator; // funds the escrow, accepts the work
    uint64 applicationDeadline; // last timestamp a worker may start working
    uint64 submissionDeadline; // when submissions are expected by
    Status status;
    uint256 reward; // USDC amount held in escrow (6-decimal base units)
    uint32 workerCount; // number of distinct workers who started
    address winningWorker; // worker whose work was accepted (once completed)
    bytes32 contentHash; // offchain metadata root (title, description, files)
    bytes32 winningSubmissionRef; // accepted submission reference/hash
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  /// @notice USDC token used for all rewards. On Arc this is the ERC-20
  ///         interface at 0x3600...0000; on test chains it is a MockUSDC.
  IERC20 public immutable usdc;

  /// @notice Grace period after `submissionDeadline` during which the creator
  ///         can still accept a worker before anyone may expire the bounty.
  uint64 public immutable reviewPeriod;

  /// @notice Number of bounties ever created; also the id of the next bounty.
  uint256 public bountyCount;

  mapping(uint256 id => Bounty) private _bounties;

  /// @notice Whether `worker` has marked themselves as working on bounty `id`.
  mapping(uint256 id => mapping(address worker => bool)) public isWorking;

  /// @notice Enumerable list of workers per bounty, for onchain discovery.
  mapping(uint256 id => address[] workers) private _workers;

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
  event WorkStarted(uint256 indexed id, address indexed worker);
  event BountyCompleted(
    uint256 indexed id,
    address indexed worker,
    uint256 amount,
    bytes32 submissionRef
  );
  event BountyCancelled(uint256 indexed id, address indexed creator, uint256 refund);
  event BountyExpired(uint256 indexed id, address indexed creator, uint256 refund);

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  error ZeroReward();
  error InvalidDeadlines();
  error InvalidReviewPeriod();
  error ZeroAddress();
  error UnknownBounty();
  error NotCreator();
  error WrongStatus();
  error ApplicationsClosed();
  error AlreadyWorking();
  error CreatorCannotWork();
  error NotWorking();
  error ExpiryNotReached();
  error WorkersPresent();

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------

  modifier onlyCreator(uint256 id) {
    if (_bounties[id].creator != msg.sender) revert NotCreator();
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
  /// @param reviewPeriod_ Seconds after `submissionDeadline` before the bounty
  ///        can be expired by anyone. Must be greater than zero.
  constructor(IERC20 usdc_, uint64 reviewPeriod_) {
    if (address(usdc_) == address(0)) revert ZeroAddress();
    if (reviewPeriod_ == 0) revert InvalidReviewPeriod();
    usdc = usdc_;
    reviewPeriod = reviewPeriod_;
  }

  // ---------------------------------------------------------------------------
  // Creator flow
  // ---------------------------------------------------------------------------

  /// @notice Creates a funded bounty. The reward is pulled into escrow at once.
  /// @param reward USDC amount in 6-decimal base units.
  /// @param applicationDeadline Last timestamp a worker may start working.
  /// @param submissionDeadline When submissions are expected by; must be after
  ///        `applicationDeadline`.
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

    // Pull funds into escrow before the bounty is considered live.
    usdc.safeTransferFrom(msg.sender, address(this), reward);

    emit BountyCreated(
      id,
      msg.sender,
      reward,
      applicationDeadline,
      submissionDeadline,
      contentHash
    );
  }

  /// @notice Accepts one worker's work and pays them the reward. Creator-only.
  /// @dev The worker must have marked themselves as working, so the creator
  ///      cannot pay an arbitrary address and the set of potential recipients
  ///      stays bounded and visible onchain.
  /// @param worker The worker whose work is accepted.
  /// @param submissionRef Hash of the accepted offchain submission.
  function approveWork(
    uint256 id,
    address worker,
    bytes32 submissionRef
  ) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (!isWorking[id][worker]) revert NotWorking();

    uint256 amount = b.reward;
    b.reward = 0;
    b.status = Status.Completed;
    b.winningWorker = worker;
    b.winningSubmissionRef = submissionRef;

    usdc.safeTransfer(worker, amount);
    emit BountyCompleted(id, worker, amount, submissionRef);
  }

  /// @notice Withdraws the reward when no one is working on the bounty.
  ///         Creator-only.
  function cancelBounty(uint256 id) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (b.workerCount != 0) revert WorkersPresent();

    uint256 refund = b.reward;
    b.reward = 0;
    b.status = Status.Cancelled;

    usdc.safeTransfer(b.creator, refund);
    emit BountyCancelled(id, b.creator, refund);
  }

  // ---------------------------------------------------------------------------
  // Worker flow
  // ---------------------------------------------------------------------------

  /// @notice Marks the caller as working on the bounty. Anyone except the
  ///         creator, while applications are open.
  function startWorking(uint256 id) external existing(id) {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (block.timestamp > b.applicationDeadline) revert ApplicationsClosed();
    if (msg.sender == b.creator) revert CreatorCannotWork();
    if (isWorking[id][msg.sender]) revert AlreadyWorking();

    isWorking[id][msg.sender] = true;
    _workers[id].push(msg.sender);
    b.workerCount = uint32(_workers[id].length);

    emit WorkStarted(id, msg.sender);
  }

  // ---------------------------------------------------------------------------
  // Permissionless maintenance
  // ---------------------------------------------------------------------------

  /// @notice Refunds a stuck bounty to its creator. Callable by anyone.
  /// @dev Two cases that would otherwise lock funds:
  ///      - no one started working and the application deadline passed;
  ///      - the creator never accepted anyone within the review grace period.
  ///      Funds always return to the creator.
  function expireBounty(uint256 id) external existing(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();

    bool abandoned = b.workerCount == 0 && block.timestamp > b.applicationDeadline;
    bool creatorSilent = block.timestamp > uint256(b.submissionDeadline) + reviewPeriod;
    if (!abandoned && !creatorSilent) revert ExpiryNotReached();

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

  /// @notice Returns every worker who marked themselves as working on `id`.
  function getWorkers(uint256 id) external view existing(id) returns (address[] memory) {
    return _workers[id];
  }

  /// @notice True when the reward is still held in escrow for `id`.
  function isFunded(uint256 id) external view existing(id) returns (bool) {
    return _bounties[id].status == Status.Open;
  }
}
