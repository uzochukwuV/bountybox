// Arc network + mock wallet session.
// Everything onchain in Bounty Box is simulated: no real funds move.

export const ARC_CHAIN = {
  name: 'Arc Testnet',
  chainId: 5042002,
  currency: 'USDC',
  explorer: 'https://testnet.arcscan.app',
  usdc: '0x3600000000000000000000000000000000000000',
  escrow: '0x7a3f9c1d4e5b8a2f6c0d9e3b1a4c7f2e8b5d0a91',
};

export const ESCROW_ADDRESS = ARC_CHAIN.escrow;

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEX = '0123456789abcdef';
const randomHex = (length) =>
  Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join('');

export function randomTxHash() {
  return `0x${randomHex(64)}`;
}

export function randomAddress() {
  return `0x${randomHex(40)}`;
}

export function randomBlock() {
  return 4180000 + Math.floor(Math.random() * 90000);
}

export function shortAddress(address = '') {
  return address && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function formatUSDC(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function explorerTx(hash) {
  return `${ARC_CHAIN.explorer}/tx/${hash}`;
}

export function explorerAddress(address) {
  return `${ARC_CHAIN.explorer}/address/${address}`;
}

/* ------------------------------------------------------------------ */
/* Mock wallet session, kept in browser storage                        */
/* ------------------------------------------------------------------ */

const WALLET_KEY = 'bb.wallet';
const BALANCE_KEY = 'bb.balance';
const DEFAULT_BALANCE = 2400;

function emit() {
  window.dispatchEvent(new Event('bb:wallet'));
}

export function loadWallet() {
  try {
    return JSON.parse(localStorage.getItem(WALLET_KEY)) || null;
  } catch {
    return null;
  }
}

export function loadBalance() {
  const raw = parseFloat(localStorage.getItem(BALANCE_KEY));
  return Number.isFinite(raw) ? raw : DEFAULT_BALANCE;
}

export function saveBalance(value) {
  localStorage.setItem(BALANCE_KEY, String(Math.max(0, Math.round(value * 100) / 100)));
  emit();
}

export async function connectWallet() {
  await wait(900);
  const existing = loadWallet();
  const wallet = existing || {
    address: randomAddress(),
    chain: ARC_CHAIN.name,
    connected_at: new Date().toISOString(),
  };
  localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  if (localStorage.getItem(BALANCE_KEY) === null) {
    localStorage.setItem(BALANCE_KEY, String(DEFAULT_BALANCE));
  }
  emit();
  return wallet;
}

export function disconnectWallet() {
  localStorage.removeItem(WALLET_KEY);
  emit();
}

export function addTestUSDC(amount = 1000) {
  saveBalance(loadBalance() + amount);
}