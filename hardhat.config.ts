import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    // Arc is Circle's USDC-native L1. USDC is the gas token and also exposes an
    // ERC-20 interface at 0x3600...0000 (6 decimals). Rewards are denominated
    // in that ERC-20 USDC. See docs/ARCHITECTURE.md and Arc's contract addresses.
    arcTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 5042002,
      url: configVariable("ARC_TESTNET_RPC_URL"),
      accounts: [configVariable("ARC_PRIVATE_KEY")],
    },
    arcMainnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_MAINNET_RPC_URL"),
      accounts: [configVariable("ARC_PRIVATE_KEY")],
    },
  },
});
