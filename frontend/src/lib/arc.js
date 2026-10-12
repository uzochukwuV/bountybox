// Arc network config, USDC helpers, and explorer links.
//
// The wallet itself is Privy (see `lib/useWallet.js`); this module is the shared
// source of chain constants plus the pure formatting/unit helpers the UI uses.
// Arc's USDC exists twice: as the native gas token (18 decimals) and as an
// ERC-20 interface at a fixed predeploy (6 decimals). Rewards are denominated
// in the ERC-20 token; never mix the two views.

import { createPublicClient, formatUnits, http, parseUnits } from 'viem';

export const ARC_CHAIN = {
  id: 5042002,
  // Alias kept for call sites that still read `chainId`.
  chainId: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'ArcScan', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
};

/** ERC-20 USDC interface predeployed on Arc (6 decimals). */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
export const USDC_DECIMALS = 6;

export const FAUCET_URL = 'https://faucet.circle.com';

/** Escrow contract address, set after `ignition deploy` (Phase 3). */
export const ESCROW_ADDRESS = import.meta.env.VITE_BOUNTYBOARD_ADDRESS || '';

export const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
];

export const publicClient = createPublicClient({
  chain: ARC_CHAIN,
  transport: http(),
});

/** ERC-20 USDC balance in base units (6 dp) for `address`. */
export async function getUSDCBalance(address) {
  if (!address) return 0n;
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
}

/** Base units (bigint) -> decimal string, e.g. 25000000n -> "25". */
export function formatUSDCUnits(value) {
  return formatUnits(BigInt(value ?? 0), USDC_DECIMALS);
}

/** Decimal USDC (string | number) -> base units (bigint). */
export function parseUSDC(value) {
  return parseUnits(String(value ?? '0'), USDC_DECIMALS);
}

export function shortAddress(address = '') {
  return address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Formats a whole-USDC number for display, e.g. 25 -> "25", 12.5 -> "12.5". */
export function formatUSDC(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function explorerTx(hash) {
  return `${ARC_CHAIN.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address) {
  return `${ARC_CHAIN.blockExplorers.default.url}/address/${address}`;
}

/* ------------------------------------------------------------------ */
/* Transitional helpers (removed when the write path lands in Phase 4) */
/* ------------------------------------------------------------------ */

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEX = '0123456789abcdef';
const randomHex = (length) =>
  Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join('');

export function randomTxHash() {
  return `0x${randomHex(64)}`;
}

export function randomBlock() {
  return 4180000 + Math.floor(Math.random() * 90000);
}
