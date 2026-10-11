import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys BountyBoard against a real USDC address. Defaults to Arc's USDC
// ERC-20 interface (6 decimals). Override with --parameters, e.g. to point at
// an existing testnet deployment instead of redeploying the mock.
export default buildModule("BountyBoardModule", (m) => {
  const usdc = m.getParameter("usdc", "0x3600000000000000000000000000000000000000");
  const reviewPeriod = m.getParameter("reviewPeriod", 3n * 24n * 60n * 60n); // 3 days

  const board = m.contract("BountyBoard", [usdc, reviewPeriod]);

  return { board };
});
