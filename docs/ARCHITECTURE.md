# BountyBoard — architecture

A USDC-powered micro-task bounty platform on Arc. The contract holds the money,
enforces the rules, and records the value-bearing lifecycle events. The database
holds the content.

## The model in one paragraph

A bounty is **open to many workers** and pays up to **`maxWinners`** of them a
flat **`rewardPerWinner`**. A classic single-winner bounty is just `maxWinners =
1`. Anyone (except the creator) can press "working on it", which registers them
onchain via `startWorking`, so the whole board sees who started. While *nobody*
is working, the creator can withdraw (`cancelBounty`). Once at least one person
is working, the creator cannot withdraw; instead they accept workers one at a
time (`approveWork`) — up to `maxWinners`, after which the bounty auto-completes.
If the creator pays fewer than `maxWinners` and wants to stop, `finalizeBounty`
closes the bounty and refunds the unspent prize pool.

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
| Bounty creator | `Bounty.creator` | Authorization for accept/finalize/withdraw |
| Who is working | `isWorking` + `Bounty.workers` | The "working on it" set |
| Who was paid | `isWinner` + `Bounty.winners` | Accepted winners so far |
| Worker / winner counts | `workerCount`, `winnerCount` | Gate withdrawal and completion |
| Prize structure | `rewardPerWinner`, `maxWinners` | Escrow = `rewardPerWinner * maxWinners` |
| Reward held | `remainingReward(id)` | Unclaimed winner slots |
| Escrow status | `Bounty.status` + `isFunded()` | Funds in or out |
| Application deadline | `Bounty.applicationDeadline` | Last time to `startWorking` |
| Submission deadline | `Bounty.submissionDeadline` | When submissions are expected |
| Content hash | `Bounty.contentHash` | Root of offchain metadata (title, files, …) |
| Accepted submission refs | `BountyWinnerPaid` event | Hash of each accepted submission |
| Lifecycle events | emitted events | Indexed for the app/audit trail |

### Offchain (database — see `db/schema.sql`)

Task title, description, category; images, attachments, instructions; full work
submissions and comments; search tags, profiles, UI preferences; moderation
records and notifications. None of this is required to move funds.

### Linking the two

- `contentHash` anchors the task content; the API resolves it to a `task` row.
- Each `BountyWinnerPaid.submissionRef` anchors an accepted submission; the API
  resolves it to a `submission` row and marks it accepted.
- `WorkStarted` events populate the `bounty_workers` table, so the UI can show
  "N working" without every client replaying chain logs.
- The chain is the source of truth for money and permissions; the database is
  the source of truth for content.

## Lifecycle state machine

```
                 createBounty (escrow = rewardPerWinner * maxWinners)
                          |
                          v
                     Open  <---- startWorking (any worker, before app. deadline)
                      |  |
     cancelBounty ----+  |      (creator, only while workerCount == 0)
     (refund all)        |       -> Cancelled
                         v
               approveWork(worker, ref)   repeatable, up to maxWinners
                         |                  pays rewardPerWinner each time
                         +--> winnerCount == maxWinners -> Completed
                         |
     finalizeBounty -----+  (creator, >=1 winner paid) -> Completed
     (refund unspent)        refund = rewardPerWinner * (maxWinners - winnerCount)

     expireBounty (permissionless safety valve) -> Expired (refund unspent -> creator)
        - abandoned:      past app deadline and (no live workers)
        - creator silent: past submissionDeadline + reviewPeriod
```

- The creator can withdraw the whole pool (`cancelBounty`) **only while no one
  is working**. Once a worker starts, the creator's only money-moving actions
  are `approveWork` and `finalizeBounty`.
- `approveWork` pays a worker only if they are in the `isWorking` set, so the
  creator cannot redirect the funds to an arbitrary address.
- `finalizeBounty` lets the creator cap the number of winners early and reclaim
  the unspent pool (e.g. only 2 of 3 slots were worth filling).
- `expireBounty` guarantees funds can never be locked: unspent escrow is refunded
  to the creator by anyone after the deadlines. Already-paid winners keep their
  rewards; only the remainder is refunded.

## Worker incentives (read this before shipping)

Because anyone can start and only the creator picks winners, a worker's reward
is not guaranteed until `approveWork` lands. Consequences the product must handle
offchain:

- **Duplicate work is possible.** Many workers may do the same task and only
  `maxWinners` are paid. `getWorkers` is public, so the UI can show "3 working,
  1 spot left" to discourage piling on.
- **No onchain worker protection.** There is no `claimUnreviewed`: the creator
  always chooses. If you later want to protect a worker who finished but is
  ignored, add a bounded submit → accept → claim flow rather than trusting the
  offchain clock. This is a deliberate trade to keep the contract small.

## Offchain indexer expectations

A backend watches the contract's events (`BountyCreated`, `WorkStarted`,
`BountyWinnerPaid`, `BountyCompleted`, `BountyCancelled`, `BountyExpired`) and
writes the projected lifecycle into the database. Bounty `id` is the join key
between the chain and the `bounty` table. `BountyWinnerPaid` may fire up to
`maxWinners` times per bounty.

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
- Escrow accounting is exact: escrowed = `rewardPerWinner * maxWinners`; each
  payout subtracts one `rewardPerWinner`; refunds use the remaining slots. Over
  the life of a bounty, `sum(payouts) + refunds == escrow`, so the contract
  never pays out more than it holds.
- No admin, no upgradeability, no arbitrary token: the contract is immutable and
  only ever moves the one configured USDC. This keeps the audit surface small.
- The payout recipient is constrained to the onchain `isWorking` set, so the
  creator cannot drain escrow to an address of their choosing.
- Offchain values (hashes) are opaque `bytes32`; the contract never parses or
  trusts them beyond storing/emitting them.
