import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys BountyBoard against a real USDC address. Defaults to Arc's USDC
// ERC-20 interface (6 decimals). Override with --parameters, e.g. to point at
// an existing testnet deployment instead of redeploying the mock.
//
// Worker caps and review windows are set per bounty in createBounty, so the
// deployment itself takes no timing parameters.
export default buildModule("BountyBoardModule", (m) => {
  const usdc = m.getParameter("usdc", "0x3600000000000000000000000000000000000000");

  const board = m.contract("BountyBoard", [usdc]);

  return { board };
});
