// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BountyBoard
/// @notice USDC escrow and rule enforcement for a micro-task bounty platform.
/// @dev Bounties are open to many workers and can pay up to `maxWinners` of
///      them. A pure single-winner bounty is simply `maxWinners == 1`; a
///      multi-winner bounty pays a flat `rewardPerWinner` to each accepted
///      worker. Anyone may mark themselves as working, and the creator accepts
///      whomever they choose, up to the cap.
///
///      The contract is intentionally small: it custodies funds and records the
///      value-bearing facts of a bounty's lifecycle. All human-readable content
///      (title, description, attachments, comments, submissions) lives offchain
///      and is referenced here only by an opaque content hash. Nothing offchain
///      is trusted for money movement; it is only used by the UI/API to resolve
///      hashes and to display who is working.
///
///      Lifecycle:
///        createBounty  -> Open      (reward escrowed = rewardPerWinner * maxWinners)
///        startWorking  -> Open      (any worker, before the application deadline)
///        approveWork   -> Open      (creator accepts a worker; may be called up to maxWinners times)
///        cancelBounty  -> Cancelled (creator, only while no one is working and none paid)
///        expireBounty  -> Expired   (refund of any unspent escrow; permissionless)
contract BountyBoard is ReentrancyGuard {
  using SafeERC20 for IERC20;

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  enum Status {
    Open, // funded; workers may start, creator may cancel, accept, or finish
    Completed, // maxWinners reached (or closed after paying at least one)
    Cancelled, // fully refunded to the creator (nobody worked, nobody paid)
    Expired // refunded unspent escrow to the creator via the safety valve
  }

  struct Bounty {
    address creator; // funds the escrow, accepts the work
    uint64 applicationDeadline; // last timestamp a worker may start working
    uint64 submissionDeadline; // when submissions are expected by
    Status status;
    uint32 maxWinners; // maximum number of paid winners
    uint32 winnerCount; // number of winners paid so far
    uint32 workerCount; // number of distinct workers who started
    uint256 rewardPerWinner; // USDC paid to each winner (6-decimal base units)
    bytes32 contentHash; // offchain metadata root (title, description, files)
    address[] workers; // workers who marked themselves as working
    address[] winners; // workers whose work was accepted and paid
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  /// @notice USDC token used for all rewards. On Arc this is the ERC-20
  ///         interface at 0x3600...0000; on test chains it is a MockUSDC.
  IERC20 public immutable usdc;

  /// @notice Grace period after `submissionDeadline` during which the creator
  ///         can still accept workers before anyone may expire the bounty.
  uint64 public immutable reviewPeriod;

  /// @notice Number of bounties ever created; also the id of the next bounty.
  uint256 public bountyCount;

  mapping(uint256 id => Bounty) private _bounties;

  /// @notice Whether `worker` has marked themselves as working on bounty `id`.
  mapping(uint256 id => mapping(address worker => bool)) public isWorking;

  /// @notice Whether `worker` has already been paid on bounty `id`.
  mapping(uint256 id => mapping(address worker => bool)) public isWinner;

  // ---------------------------------------------------------------------------
  // Events (bounty lifecycle)
  // ---------------------------------------------------------------------------

  event BountyCreated(
    uint256 indexed id,
    address indexed creator,
    uint256 rewardPerWinner,
    uint32 maxWinners,
    uint64 applicationDeadline,
    uint64 submissionDeadline,
    bytes32 contentHash
  );
  event WorkStarted(uint256 indexed id, address indexed worker);
  event BountyWinnerPaid(
    uint256 indexed id,
    address indexed worker,
    uint256 amount,
    bytes32 submissionRef
  );
  event BountyCompleted(uint256 indexed id);
  event BountyCancelled(uint256 indexed id, address indexed creator, uint256 refund);
  event BountyExpired(uint256 indexed id, address indexed creator, uint256 refund);

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  error ZeroReward();
  error InvalidWinners();
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
  error AlreadyWinner();
  error MaxWinnersReached();
  error ExpiryNotReached();
  error WorkersPresent();
  error NothingPaid();

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

  /// @notice Creates a funded bounty. Escrow = rewardPerWinner * maxWinners,
  ///         pulled in at once.
  /// @param rewardPerWinner USDC paid per winner, in 6-decimal base units.
  /// @param maxWinners Maximum number of paid winners; 1 for a classic bounty.
  /// @param applicationDeadline Last timestamp a worker may start working.
  /// @param submissionDeadline When submissions are expected by; must be after
  ///        `applicationDeadline`.
  /// @param contentHash Hash/root of the offchain task content.
  /// @return id The new bounty id.
  function createBounty(
    uint256 rewardPerWinner,
    uint32 maxWinners,
    uint64 applicationDeadline,
    uint64 submissionDeadline,
    bytes32 contentHash
  ) external nonReentrant returns (uint256 id) {
    if (rewardPerWinner == 0) revert ZeroReward();
    if (maxWinners == 0) revert InvalidWinners();
    if (applicationDeadline < block.timestamp || submissionDeadline <= applicationDeadline) {
      revert InvalidDeadlines();
    }

    id = bountyCount++;
    Bounty storage b = _bounties[id];
    b.creator = msg.sender;
    b.rewardPerWinner = rewardPerWinner;
    b.maxWinners = maxWinners;
    b.applicationDeadline = applicationDeadline;
    b.submissionDeadline = submissionDeadline;
    b.status = Status.Open;
    b.contentHash = contentHash;

    // Pull the full prize pool into escrow before the bounty is live.
    uint256 escrow = rewardPerWinner * maxWinners;
    usdc.safeTransferFrom(msg.sender, address(this), escrow);

    emit BountyCreated(
      id,
      msg.sender,
      rewardPerWinner,
      maxWinners,
      applicationDeadline,
      submissionDeadline,
      contentHash
    );
  }

  /// @notice Accepts one worker's work and pays them. Creator-only; may be
  ///         called repeatedly until `maxWinners` is reached.
  /// @dev The worker must have marked themselves as working, so the creator
  ///      cannot pay an arbitrary address and the set of potential recipients
  ///      stays bounded and visible onchain.
  function approveWork(
    uint256 id,
    address worker,
    bytes32 submissionRef
  ) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (!isWorking[id][worker]) revert NotWorking();
    if (isWinner[id][worker]) revert AlreadyWinner();
    if (b.winnerCount >= b.maxWinners) revert MaxWinnersReached();

    isWinner[id][worker] = true;
    b.winners.push(worker);
    b.winnerCount += 1;

    usdc.safeTransfer(worker, b.rewardPerWinner);

    emit BountyWinnerPaid(id, worker, b.rewardPerWinner, submissionRef);

    if (b.winnerCount == b.maxWinners) {
      b.status = Status.Completed;
      emit BountyCompleted(id);
    }
  }

  /// @notice Closes the bounty early once at least one winner is paid, and
  ///         refunds the remaining unspent prize pool to the creator.
  function finalizeBounty(uint256 id) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (b.winnerCount == 0) revert NothingPaid();

    uint256 refund = b.rewardPerWinner * (b.maxWinners - b.winnerCount);
    b.status = Status.Completed;

    usdc.safeTransfer(b.creator, refund);
    emit BountyCompleted(id);
  }

  /// @notice Withdraws the full reward when no one is working. Creator-only.
  function cancelBounty(uint256 id) external existing(id) onlyCreator(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();
    if (b.workerCount != 0) revert WorkersPresent();

    uint256 refund = b.rewardPerWinner * b.maxWinners;
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
    b.workers.push(msg.sender);
    b.workerCount = uint32(b.workers.length);

    emit WorkStarted(id, msg.sender);
  }

  // ---------------------------------------------------------------------------
  // Permissionless maintenance
  // ---------------------------------------------------------------------------

  /// @notice Refunds unspent escrow to the creator. Callable by anyone.
  /// @dev Covers three cases that would otherwise lock funds:
  ///      - the creator never accepted anyone and nobody is working;
  ///      - the creator accepted fewer than `maxWinners` and stopped;
  ///      - a worker-dominated bounty was never resolved by the creator.
  ///      Already-paid winners keep their rewards; only the remainder is
  ///      refunded.
  function expireBounty(uint256 id) external existing(id) nonReentrant {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) revert WrongStatus();

    bool liveWorkers = b.workerCount > 0 && b.winnerCount < b.maxWinners;
    bool pastDeadline = block.timestamp > b.applicationDeadline;
    bool creatorSilent = block.timestamp > uint256(b.submissionDeadline) + reviewPeriod;
    if (!(pastDeadline && (!liveWorkers || creatorSilent))) revert ExpiryNotReached();

    uint256 refund = b.rewardPerWinner * (b.maxWinners - b.winnerCount);
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
    return _bounties[id].workers;
  }

  /// @notice Returns every worker who has been accepted and paid on `id`.
  function getWinners(uint256 id) external view existing(id) returns (address[] memory) {
    return _bounties[id].winners;
  }

  /// @notice USDC still held in escrow for unclaimed winner slots.
  function remainingReward(uint256 id) external view existing(id) returns (uint256) {
    Bounty storage b = _bounties[id];
    if (b.status != Status.Open) return 0;
    return b.rewardPerWinner * (b.maxWinners - b.winnerCount);
  }

  /// @notice True while the reward is still held in escrow for `id`.
  function isFunded(uint256 id) external view existing(id) returns (bool) {
    return _bounties[id].status == Status.Open;
  }
}
