# BountyBoard — architecture

A USDC-powered micro-task bounty platform on Arc. The contract holds the money,
enforces the rules, and records the value-bearing lifecycle events. The database
holds the content.

## The model in one paragraph

A bounty is **open to many workers**. Anyone (except the creator) can press
"working on it", which registers them onchain via `startWorking` — so the whole
board sees who has started. While *nobody* has started, the creator can withdraw
the reward (`cancelBounty`). Once at least one person is working, the creator
cannot withdraw; instead they accept exactly one worker's submission
(`approveWork`) and the reward is paid to that worker. This is a bounty-style
"many attempts, one winner" flow.

## Why split onchain / offchain

The contract is kept small enough to audit and test quickly. Anything that
moves money, grants permission, or enforces a rule is onchain and verifiable.
Anything large, mutable, human-readable, or private stays offchain and is
referenced by an opaque hash. The chain never trusts offchain data for money
movement — the offchain records are only used by the app to resolve hashes and
to display who is working.

### Onchain (`contracts/BountyBoard.sol`)

| Data | Where | Notes |
| --- | --- | --- |
| Bounty creator | `Bounty.creator` | Authorization for accept/withdraw |
| Who is working | `isWorking[id][worker]`, `_workers[id]` | The "working on it" set |
| Worker count | `Bounty.workerCount` | Gates creator withdrawal |
| USDC reward amount | `Bounty.reward` | 6-decimal base units |
| Escrow status | `Bounty.status` + `isFunded()` | Funds in or out |
| Application deadline | `Bounty.applicationDeadline` | Last time to `startWorking` |
| Submission deadline | `Bounty.submissionDeadline` | When submissions are expected |
| Accepted worker | `Bounty.winningWorker` | Who got paid |
| Accepted submission reference | `Bounty.winningSubmissionRef` | Hash of offchain submission |
| Content hash | `Bounty.contentHash` | Root of offchain metadata (title, files, …) |
| Lifecycle events | emitted events | Indexed for the app/audit trail |
| Refund / payout eligibility | state machine rules | See below |

### Offchain (database — see `db/schema.sql`)

Task title, description, category; images, attachments, instructions; full work
submissions and comments; search tags, profiles, UI preferences; moderation
records and notifications. None of this is required to move funds.

### Linking the two

- `contentHash` anchors the task content; the API resolves it to a `task` row.
- `winningSubmissionRef` anchors the accepted work; the API resolves it to a
  `submission` row.
- `WorkStarted` events populate the `bounty_workers` table, so the UI can show
  "N working" without every client replaying chain logs.
- The chain is the source of truth for money and permissions; the database is
  the source of truth for content.

## Lifecycle state machine

```
                 createBounty (funds escrowed)
                          |
                          v
                     Open  <---- startWorking (any worker, before app. deadline)
                      |  |
     cancelBounty ----+  |
     (creator, only      |
      while workerCount  |
      == 0)              |
      -> Cancelled       |
                         v
                    approveWork (creator accepts one worker)
                         -> Completed (pay -> that worker)

     expireBounty (permissionless safety valve) -> Expired (refund -> creator)
        - abandoned:      workerCount == 0 and applicationDeadline passed
        - creator silent: submissionDeadline + reviewPeriod passed
```

- The creator can withdraw (`cancelBounty`) **only while no one is working**.
  Once a worker starts, the creator's only money-moving action is `approveWork`.
- `approveWork` pays exactly one worker who must be in the `isWorking` set. The
  creator cannot redirect the funds to an arbitrary address.
- `expireBounty` guarantees funds can never be locked: an abandoned bounty
  (nobody started) or one the creator never resolves is refunded to the creator
  by anyone, after the deadlines. If a worker *is* working, the creator has the
  review grace period before the valve opens.

## Worker incentives (read this before shipping)

Because anyone can start and only the creator picks a winner, a worker's reward
is not guaranteed until `approveWork` lands. Two consequences the product must
handle offchain:

- **Duplicate work is possible.** Multiple workers may independently do the same
  task and only one is paid. The `getWorkers` list is public, so the UI can show
  "3 people are working on this" to discourage piling on.
- **No onchain worker protection.** Unlike a single-worker escrow, there is no
  `claimUnreviewed` for the worker: the creator always chooses. If you later want
  to protect a worker who finished but is ignored, add a bounded
  "submit → creator must act → worker can claim" flow rather than trusting the
  offchain clock. This is a deliberate trade to keep the contract small.

## Offchain indexer expectations

A backend watches the contract's events (`BountyCreated`, `WorkStarted`,
`BountyCompleted`, `BountyCancelled`, `BountyExpired`) and writes the projected
lifecycle into the database. Bounty `id` is the join key between the chain and
the `bounty` table.

## USDC on Arc

- Arc is Circle's USDC-native L1 (chain id 5042002). USDC is the gas token AND
  exposes an ERC-20 interface at `0x3600000000000000000000000000000000000000`.
- The ERC-20 interface uses **6 decimals**; the native gas balance uses 18.
  Always read `decimals()` and never mix the two views.
- Rewards are denominated in the ERC-20 USDC (6 decimals). Deploy
  `BountyBoard` with `usdc = 0x3600...0000`; no wrapped-USDC step is needed.
- Local/simulated chains have no such predeploy, so
  `ignition/modules/BountyBoardLocal.ts` deploys a `MockUSDC` instead.

## Deploying

```shell
# local simulated chain
npx hardhat ignition deploy ignition/modules/BountyBoardLocal.ts

# Arc testnet (set ARC_TESTNET_RPC_URL + ARC_PRIVATE_KEY in .env first)
npx hardhat ignition deploy ignition/modules/BountyBoard.ts --network arcTestnet
```

## Security notes

- `SafeERC20` for all transfers; `nonReentrant` on every function that moves funds.
- Custom errors instead of string reverts (cheaper, easier to assert in tests).
- Escrow amount is zeroed before every external transfer (checks-effects-interactions).
- No admin, no upgradeability, no arbitrary token: the contract is immutable and
  only ever moves the one configured USDC. This keeps the audit surface small.
- The payout recipient is constrained to the onchain `isWorking` set, so the
  creator cannot drain escrow to an address of their choosing.
- Values from offchain (hashes) are opaque `bytes32`; the contract never parses
  or trusts them beyond storing/emitting them.
