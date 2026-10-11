# BountyBoard — USDC micro-task bounty platform (Hardhat 3 + viem)

A USDC-powered micro-task bounty platform for Arc. The smart contract holds the
money, enforces the rules, and records the value-bearing lifecycle events. The
database holds the content. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
the onchain/offchain split, and [db/schema.sql](db/schema.sql) for the schema.

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
- Worker: `startWorking(id)` — the UI's "working on it" button.
- Anyone: `expireBounty(id)` (unspent escrow always returns to the creator).
- Views: `getBounty`, `getWorkers`, `getWinners`, `isWorking`, `isWinner`,
  `remainingReward`, `isFunded`.

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
# local simulated chain (deploys a 6-decimal MockUSDC too)
npx hardhat ignition deploy ignition/modules/BountyBoardLocal.ts

# Arc testnet (copy .env.example -> .env and fill ARC_TESTNET_RPC_URL/ARC_PRIVATE_KEY)
npx hardhat ignition deploy ignition/modules/BountyBoard.ts --network arcTestnet
```

Rewards use Arc's USDC ERC-20 interface at `0x3600000000000000000000000000000000000000`
(6 decimals). Arc is USDC-native: USDC is also the gas token (18-decimal native
view). Never mix the two views; always read `decimals()`.

---

## Hardhat 3 sample scaffold

This project started from the Hardhat 3 `node:test` + `viem` sample. The
original notes follow.

This project showcases a Hardhat 3 project using the native Node.js test runner (`node:test`) and the `viem` library for Ethereum interactions.

To learn more about Hardhat 3, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). To share your feedback, join our [Hardhat 3](https://hardhat.org/hardhat3-telegram-group) Telegram group or [open an issue](https://github.com/NomicFoundation/hardhat/issues/new) in our GitHub issue tracker.

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using [`node:test`](nodejs.org/api/test.html), the new Node.js native test runner, and [`viem`](https://viem.sh/).
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
