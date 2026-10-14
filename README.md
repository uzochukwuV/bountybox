# BountyBox — USDC micro-task bounties on Arc

**Live:** [bountybox-brown.vercel.app](https://bountybox-brown.vercel.app/) ·
**Contract (Arc mainnet):** [`0x57bC93735d190c24c0215DB48f52DEc796770e21`](https://explorer.arc.io/address/0x57bC93735d190c24c0215DB48f52DEc796770e21)

BountyBox lets anyone post a paid micro-task and lets anyone in the world do
it — with the reward locked in an onchain escrow instead of a platform's
custody. A creator funds a bounty in USDC; contributors register onchain,
submit work, and get paid automatically when the creator accepts it. Built on
**Arc mainnet** for **Arc Microgrants**.

## Why it's useful

Paying strangers on the internet for small jobs is a trust problem: the worker
fears doing the work and never getting paid, the poster fears paying upfront
for work that never arrives. BountyBox removes the middleman from that trade:

- **Workers see locked money, not promises.** The full prize pool moves into
  the escrow contract before a bounty goes live, and every payout is a public
  onchain event. You start work knowing the funds exist and can only go to
  registered workers.
- **Creators keep control without holding funds.** Accept winners one at a
  time, close early and reclaim the unspent pool, or withdraw while nobody is
  working. Once someone starts, the creator can no longer pocket the escrow —
  the contract only allows paying workers or refunding.
- **Money can never get stuck.** A permissionless safety valve refunds unspent
  escrow after the deadlines, and stray transfers are recoverable. No admin
  keys, no upgradeability, no one to appeal to — and no one needed.
- **Made for Arc.** USDC is Arc's gas token *and* the reward currency, so there
  is no swapping, bridging, or wrapping: the same asset you transact with is
  the asset you're paid in.

Whether it's a bug fix, a design asset, a translation, or a weekend
experiment, if the work can be described and judged, it can be a bounty. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full onchain/offchain
design.

## Deployed addresses

| Network | Chain id | BountyBoard | Explorer |
| --- | --- | --- | --- |
| Arc mainnet | 5042 | `0x57bC93735d190c24c0215DB48f52DEc796770e21` | [ArcScan](https://explorer.arc.io/address/0x57bC93735d190c24c0215DB48f52DEc796770e21) |
| Arc testnet | 5042002 | `0xDc553dF938B2ad9d846784dCbc583a5c9f5F0d22` | [ArcScan](https://explorer.testnet.arc.io/address/0xDc553dF938B2ad9d846784dCbc583a5c9f5F0d22) |

Rewards on both networks use Arc's USDC ERC-20 interface at
`0x3600000000000000000000000000000000000000` (6 decimals, verified
`symbol() == USDC` on mainnet). Arc is USDC-native: USDC is also the gas token
(18-decimal native view). Never mix the two views; always read `decimals()`.

## Contract

`contracts/BountyBoard.sol` escrows USDC for open, many-worker bounties that pay
up to `maxWinners` workers a flat `rewardPerWinner` (a classic single-winner
bounty is just `maxWinners = 1`). Workers press "working on it" (recorded
onchain), the creator accepts workers one at a time, and a permissionless safety
valve guarantees refunds of any unspent prize pool.

```
createBounty ──► Open ──startWorking──► (workers register onchain)
                 │ │
   cancelBounty  │ │   (creator, only while workerCount == 0) ──► Cancelled (refund all)
                 │ ├─approveWork(worker, ref) ──► pays rewardPerWinner  (repeatable)
                 │ │     └── winnerCount == maxWinners ──► Completed
                 │ └─finalizeBounty ──► Completed (refund unspent pool)
                 └─expireBounty ──► Expired (refund unspent; permissionless)
                    · abandoned: nobody working, app deadline passed
                    · creator silent: submissionDeadline + reviewPeriod passed
```

- Creator: `createBounty`, `approveWork(id, worker, ref)`, `finalizeBounty`, `cancelBounty`.
- Worker: `startWorking(id)` — the UI's "working on it" button (capped by per-bounty `maxWorkers`).
- Anyone: `expireBounty(id)` (unspent escrow always returns to the creator, after the per-bounty `reviewPeriod`); `rescueSurplus(to, amount)` (recovers stray USDC sent outside `createBounty`, escrow never touchable).
- Views: `getBounty`, `getWorkers`, `getWinners`, `isWorking`, `isWinner`,
  `remainingReward`, `isFunded`, `surplus`, `totalEscrowed`.

Once someone is working the creator can no longer withdraw the pool — the only
ways to move money are accepting workers or finalizing. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#worker-incentives-read-this-before-shipping)
for the worker-incentive tradeoffs.

Run the tests:

```shell
npx hardhat test            # Solidity unit tests + TypeScript integration tests
npx hardhat test solidity   # contracts/*.t.sol only
npx hardhat test nodejs     # test/*.ts only
```

## Deploy

```shell
# local simulated chain (deploys a 6-decimal MockUSDC too; no secrets needed)
npm run deploy:local

# Arc testnet (.env: ARC_TESTNET_RPC_URL + ARC_PRIVATE_KEY)
echo "y" | npm run deploy:testnet

# Arc mainnet, chain 5042 (.env: ARC_MAINNET_RPC_URL + funded ARC_PRIVATE_KEY).
# Uses the optimized production build; Ignition asks for confirmation.
echo "y" | npm run deploy:mainnet
```

The frontend selects its chain with `VITE_ARC_NETWORK` (`testnet` default,
`mainnet` for the live board) and the contract with
`VITE_BOUNTYBOARD_ADDRESS` — both are runtime env vars, no rebuild needed.

## Frontend

Vite + React app (`frontend/`: TanStack Query, react-router, Privy auth,
viem). Identity is Privy (email/social/wallet, embedded wallet on Arc); the
contract is the source of truth for money and lifecycle — the UI reads
`getBounty`/`getWorkers`/`getWinners` directly and layers them over Supabase
content rows. No indexer.

**Live app:** [bountybox-brown.vercel.app](https://bountybox-brown.vercel.app/)

![Bounty board with escrow-backed statuses](screenshot-bounties.png)

- **Bounties board** — kanban by live escrow state (Open / In Progress / In
  Review / Paid), search, category filters, escrow totals. The navbar wallet
  chip shows the connected address with one-click copy.
- **Dashboard** — posted bounties, escrow locked, active hunts, earned shares,
  wallet balance with faucet shortcut (testnet), and the full submission
  history including paid winners.

![Dashboard with escrow stats and payout history](screenshot-dashboard.png)

- **Post a bounty** — two-step flow (details → fund escrow): reward, winner
  slots, worker cap, review window, deadlines; USDC approval + `createBounty`
  in one guided transaction.
- **Bounty detail** — escrow panel, workers, submissions with accept/reject,
  lifecycle timeline, comments; creator actions (accept, finalize, withdraw,
  expire) call the contract and refresh the DB display cache.

Run it:

```shell
cd frontend && npm install && npm run dev   # .env: VITE_* keys (see env usage in src/lib/env.js)
npm run build                               # production bundle (ships as nginx container)
```

Rewards use Arc's USDC ERC-20 interface at `0x3600000000000000000000000000000000000000`
(6 decimals). Arc is USDC-native: USDC is also the gas token (18-decimal native
view). Never mix the two views; always read `decimals()`.


