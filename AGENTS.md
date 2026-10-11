# Hardhat + viem project

## Project layout

```
contracts/        Solidity source files (*.sol) and unit tests (*.t.sol)
contracts/mocks/  Test-only tokens (MockUSDC, 6 decimals)
test/             TypeScript integration tests and Solidity unit tests (*.sol)
ignition/         Hardhat Ignition deployment modules
scripts/          Standalone scripts run with `hardhat run`
db/               Offchain database schema (content lives offchain)
docs/             Architecture and the onchain/offchain boundary
hardhat.config.ts
```

## BountyBoard

`contracts/BountyBoard.sol` is a USDC escrow + lifecycle contract for open,
many-worker bounties paying up to `maxWinners` winners a flat `rewardPerWinner`
(single-winner == `maxWinners = 1`). Anyone can `startWorking` (recorded
onchain); the creator accepts workers via `approveWork` (repeatable, up to the
cap) and can `finalizeBounty` early, refunding the unspent pool; the creator can
withdraw (`cancelBounty`) only while no one is working. The chain holds
money/permissions/rules and emits lifecycle events; the database
(`db/schema.sql`) holds all content, linked by `contentHash` and the
`BountyWinnerPaid` submission refs. Read `docs/ARCHITECTURE.md` before changing
the contract: the onchain/offchain boundary and the worker-incentive tradeoffs
are deliberate and drive the design.

- USDC amounts are 6-decimal base units (Arc's USDC ERC-20 interface).
- Use custom errors, not string reverts, and `nonReentrant` on fund-moving fns.
- `MockUSDC` is test-only; never deploy it to a real network.

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to choose between them, `forge-std` cheatcodes, the `network.create()` API, `networkHelpers`, and the compile-then-typecheck workflow. The skill itself points to the matching `hardhat-toolbox-*` skill for toolbox-specific guidance (clients, contract interaction, assertions).

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt

## Frontend

`frontend/` is a Vite + React app (TanStack Query, react-router) served on port
12000. It uses Supabase for auth and content and reads no secrets at build time
other than the public anon key. `frontend/src/api/db.js` adapts the Supabase JS
client to the entity call shapes the pages use (`db.entities.*.filter/create/
update`, `db.auth.*`, `db.integrations.Core.UploadPrivateFile`); pages import it
as `@/api/db`. `frontend/src/lib/bountyChain.js` is the only module that talks
to the escrow contract — it is currently a mock and is the seam to replace with
real `viem` calls.

Supabase schema and RLS policies live in `db/supabase_schema.sql` (idempotent;
also creates the private `box` storage bucket). Apply it with
`psql "$SUPABASE_DB_URL" -f db/supabase_schema.sql`. Money-bearing bounty fields
are guarded by a trigger so only the creator can change escrow/payout/winner
columns; the contract remains the source of truth for funds. The direct DB host
does not resolve from here — connect through the Supabase pooler
(`aws-0-eu-west-1.pooler.supabase.com:6543`, user `postgres.<ref>`).
