import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Local / simulated-chain deployment. Arc's USDC predeploy does not exist on a
// local node, so this deploys a 6-decimal MockUSDC and wires it in.
export default buildModule("BountyBoardLocalModule", (m) => {
  const usdc = m.contract("MockUSDC");
  const board = m.contract("BountyBoard", [usdc]);

  return { usdc, board };
});
