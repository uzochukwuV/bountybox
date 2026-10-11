# BountyBoard — architecture

A USDC-powered micro-task bounty platform on Arc. The contract holds the money,
enforces the rules, and records the value-bearing lifecycle events. The database
holds the content.

## Why split onchain / offchain

The contract is kept small enough to audit and test quickly. Anything that
moves money, grants permission, or enforces a rule is onchain and verifiable.
Anything large, mutable, human-readable, or private stays offchain and is
referenced by an opaque hash. The chain never trusts offchain data for money
movement — the offchain records are only used by the app to resolve hashes into
content.

### Onchain (`contracts/BountyBoard.sol`)

| Data | Where | Notes |
| --- | --- | --- |
| Bounty creator | `Bounty.creator` | Authorization for assign/approve/cancel |
| Assigned worker | `Bounty.worker` | Authorization for submit/claim, payout target |
| USDC reward amount | `Bounty.reward` | 6-decimal base units |
| Escrow status | `Bounty.status` + `isFunded()` | Funds in or out |
| Application deadline | `Bounty.applicationDeadline` | Enforced on assignment |
| Submission deadline | `Bounty.submissionDeadline` | Enforced on submission |
| Accepted submission reference | `Bounty.submissionRef` | Hash of offchain submission |
| Content hash | `Bounty.contentHash` | Root of offchain metadata (title, files, …) |
| Lifecycle events | emitted events | Indexed for the app/audit trail |
| Refund / payout eligibility | state machine rules | See below |

### Offchain (database — see `db/schema.sql`)

Task title, description, category; images, attachments, instructions; full work
submissions and comments; search tags, profiles, UI preferences; moderation
records and notifications. None of this is required to move funds.

### Linking the two

- `contentHash` is stored at creation and anchors the task content. The API
  resolves it to a `task` row (and its attachments) in the database.
- `submissionRef` is stored on submission and anchors the delivered work. The
  API resolves it to a `submission` row.
- The chain is the source of truth for money and permissions; the database is
  the source of truth for content. On reorg-free finality (Arc: deterministic,
  sub-second) an event indexer reconciles the database's cached `status` with
  the chain.

## Lifecycle state machine

```
                 createBounty (funds escrowed)
                          │
                          ▼
   cancelBounty ───────► Open ◄──── expireBounty (deadline passed, no worker)
     (creator)            │                     (anyone; refund → creator)
                          │ assignWorker (creator, before app. deadline)
                          ▼
                      Assigned
                          │ submitWork (worker, before submission deadline)
                          ▼
                     Submitted ────────── approveWork (creator) ──► Completed
                          │                                          (pay → worker)
                          │ claimUnreviewed (worker, after reviewPeriod)
                          ▼
                      Reclaimed
                       (pay → worker)
```

- Funds leave escrow only in `Completed`, `Reclaimed`, `Cancelled`, or `Expired`.
- `Cancelled`/`Expired` refund the creator; `Completed`/`Reclaimed` pay the worker.
- The creator cannot `cancelBounty` once a worker is assigned; the worker is
  protected.
- If a creator goes silent after submission, the worker can self-pay via
  `claimUnreviewed` once `reviewPeriod` elapses. This removes the creator as a
  single point of failure without giving the worker the funds immediately.

## Nostr / offchain indexer expectations

A backend watches the contract's events (`BountyCreated`, `BountyFunded`,
`WorkerAssigned`, `WorkSubmitted`, `BountyCompleted`, `BountyCancelled`,
`BountyExpired`, `BountyReclaimed`) and writes the projected lifecycle into the
database. Bounty `id` is the join key between the chain and the `bounty` table.

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
- Values from offchain (hashes) are opaque `bytes32`; the contract never parses
  or trusts them beyond storing/emitting them.
