// Exports the compiled BountyBoard ABI into the frontend as a typed module.
//
// The frontend ships without a build step that can read Hardhat artifacts, so
// the ABI is vendored at frontend/src/lib/bountyBoardAbi.ts. Regenerate it after
// changing contracts/BountyBoard.sol:
//
//   npx hardhat compile && npx hardhat run scripts/export-abi.ts
//
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = resolve(
  here,
  "../artifacts/contracts/BountyBoard.sol/BountyBoard.json",
);
const target = resolve(here, "../frontend/src/lib/bountyBoardAbi.ts");

const { abi } = JSON.parse(readFileSync(artifact, "utf8"));

const header = `// BountyBoard contract ABI.
//
// Generated from the compiled artifact by scripts/export-abi.ts. Regenerate:
//   npx hardhat compile && npx hardhat run scripts/export-abi.ts
//
// Typed as const so viem infers function names and argument types.

`;

writeFileSync(target, `${header}export const BOUNTYBOARD_ABI = ${JSON.stringify(abi, null, 2)} as const;\n`);

console.log(`Wrote ${abi.length} ABI entries to ${target}`);
