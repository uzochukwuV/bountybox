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

`contracts/BountyBoard.sol` is a USDC escrow + lifecycle contract for micro-task
bounties. The chain holds money/permissions/rules and emits lifecycle events;
the database (`db/schema.sql`) holds all content, linked by `contentHash` and
`submissionRef`. Read `docs/ARCHITECTURE.md` before changing the contract: the
onchain/offchain boundary is deliberate and drives the design.

- USDC amounts are 6-decimal base units (Arc's USDC ERC-20 interface).
- Use custom errors, not string reverts, and `nonReentrant` on fund-moving fns.
- `MockUSDC` is test-only; never deploy it to a real network.

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to choose between them, `forge-std` cheatcodes, the `network.create()` API, `networkHelpers`, and the compile-then-typecheck workflow. The skill itself points to the matching `hardhat-toolbox-*` skill for toolbox-specific guidance (clients, contract interaction, assertions).

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt
