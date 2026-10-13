// Real Arc chain access for the BountyBoard escrow contract.
//
// This is the only module that talks to the contract. It resolves the wallet
// provider (Privy's embedded wallet, or any injected EIP-1193 provider), sends
// transactions, waits for receipts, and decodes the struct/events the app needs.
//
// There is no indexer: the contract is the source of truth, so the UI reads the
// authoritative state straight from `getBounty`/`getWorkers`/`getWinners` and
// uses the database only for content (titles, submissions, comments).

import { createWalletClient, custom, decodeEventLog } from 'viem';

import { ARC_CHAIN, ESCROW_ADDRESS, USDC_ABI, USDC_ADDRESS, publicClient } from '@/lib/arc';
import { BOUNTYBOARD_ABI } from '@/lib/bountyBoardAbi';

export const CHAIN_STATUS = { Open: 0, Completed: 1, Cancelled: 2, Expired: 3 };

/** True when the escrow address is configured (VITE_BOUNTYBOARD_ADDRESS). */
export const isChainConfigured = !!ESCROW_ADDRESS;

/* -------------------------------------------------------------------------- */
/* Wallet provider                                                            */
/* -------------------------------------------------------------------------- */

// The wallet lives in React (Privy hooks); chain.js is outside the tree, so
// useWallet registers a resolver instead of us reaching into window.ethereum
// (Privy's embedded wallet is not injected there).
let providerResolver = null;

export function registerWalletProvider(resolver) {
  providerResolver = resolver;
}

async function resolveProvider() {
  if (providerResolver) {
    const provider = await providerResolver();
    if (provider) return provider;
  }
  if (typeof window !== 'undefined' && window.ethereum) return window.ethereum;
  throw new Error('No wallet available. Sign in with Privy to create one.');
}

/** A viem wallet client bound to the connected account on Arc. */
export async function getWalletClient() {
  const provider = await resolveProvider();
  const [account] = await provider.request({ method: 'eth_requestAccounts' });
  return createWalletClient({
    account,
    chain: ARC_CHAIN,
    transport: custom(provider),
  });
}

/** Switches the wallet to Arc if it is on another chain. */
export async function ensureArc() {
  const provider = await resolveProvider();
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (Number(chainId) === ARC_CHAIN.id) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ARC_CHAIN.id.toString(16)}` }],
    });
  } catch (error) {
    // 4902: the chain is unknown to the wallet; add it, then the user retries.
    if (error?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${ARC_CHAIN.id.toString(16)}`,
            chainName: ARC_CHAIN.name,
            nativeCurrency: ARC_CHAIN.nativeCurrency,
            rpcUrls: ARC_CHAIN.rpcUrls.default.http,
            blockExplorerUrls: [ARC_CHAIN.blockExplorers.default.url],
          },
        ],
      });
      return;
    }
    throw error;
  }
}

function requireEscrow() {
  if (!ESCROW_ADDRESS) {
    throw new Error('Escrow contract not configured. Set VITE_BOUNTYBOARD_ADDRESS.');
  }
  return ESCROW_ADDRESS;
}

/* -------------------------------------------------------------------------- */
/* Reads (public client — no wallet needed)                                   */
/* -------------------------------------------------------------------------- */

function normalizeBounty(raw) {
  return {
    creator: raw.creator,
    applicationDeadline: Number(raw.applicationDeadline),
    submissionDeadline: Number(raw.submissionDeadline),
    status: Number(raw.status),
    maxWinners: Number(raw.maxWinners),
    winnerCount: Number(raw.winnerCount),
    workerCount: Number(raw.workerCount),
    rewardPerWinner: raw.rewardPerWinner,
    contentHash: raw.contentHash,
    workers: [...raw.workers],
    winners: [...raw.winners],
  };
}

/** The full onchain record for one bounty id. */
export async function readBounty(id) {
  const raw = await publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'getBounty',
    args: [BigInt(id)],
  });
  return normalizeBounty(raw);
}

/** Reads a range of bounties in one multicall (ids [fromId, toId)). */
export async function readBountyRange(fromId, toId) {
  const ids = [];
  for (let id = fromId; id < toId; id += 1) ids.push(id);
  if (ids.length === 0) return [];
  const results = await publicClient.multicall({
    allowFailure: true,
    contracts: ids.map((id) => ({
      address: requireEscrow(),
      abi: BOUNTYBOARD_ABI,
      functionName: 'getBounty',
      args: [BigInt(id)],
    })),
  });
  return results
    .map((result, index) =>
      result.status === 'success' ? { id: ids[index], ...normalizeBounty(result.result) } : null
    )
    .filter(Boolean);
}

/** Number of bounties ever created == id of the next one. */
export async function readBountyCount() {
  const count = await publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'bountyCount',
  });
  return Number(count);
}

export async function readRemainingReward(id) {
  return publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'remainingReward',
    args: [BigInt(id)],
  });
}

export async function readIsWorking(id, worker) {
  return publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'isWorking',
    args: [BigInt(id), worker],
  });
}

export async function readIsWinner(id, worker) {
  return publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'isWinner',
    args: [BigInt(id), worker],
  });
}

// reviewPeriod is immutable per deployment, so cache it after the first read.
let reviewPeriodCache = null;
export async function getReviewPeriod() {
  if (reviewPeriodCache !== null) return reviewPeriodCache;
  const value = await publicClient.readContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName: 'reviewPeriod',
  });
  reviewPeriodCache = Number(value);
  return reviewPeriodCache;
}

/* -------------------------------------------------------------------------- */
/* USDC reads                                                                 */
/* -------------------------------------------------------------------------- */

export async function readUsdcBalance(address) {
  if (!address) return 0n;
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
}

export async function readUsdcAllowance(owner, spender = ESCROW_ADDRESS) {
  if (!owner || !spender) return 0n;
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

/* -------------------------------------------------------------------------- */
/* Writes (wallet client)                                                     */
/* -------------------------------------------------------------------------- */

export async function waitForReceipt(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function send(functionName, args) {
  await ensureArc();
  const wallet = await getWalletClient();
  const account = wallet.account;
  // Simulate first so a custom error is decoded here (a clean message) rather
  // than surfacing only as a reverted receipt.
  const { request } = await publicClient.simulateContract({
    address: requireEscrow(),
    abi: BOUNTYBOARD_ABI,
    functionName,
    args,
    account,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await waitForReceipt(hash);
  if (receipt.status !== 'success') throw new Error(`Transaction reverted (${hash})`);
  return { hash, receipt };
}

/** Approves the escrow to pull `amount` USDC, only if the allowance is short. */
export async function ensureUsdcAllowance(amount, owner) {
  const current = await readUsdcAllowance(owner);
  if (current >= amount) return null;
  await ensureArc();
  const wallet = await getWalletClient();
  const { request } = await publicClient.simulateContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'approve',
    args: [requireEscrow(), amount],
    account: wallet.account,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await waitForReceipt(hash);
  if (receipt.status !== 'success') throw new Error(`USDC approval reverted (${hash})`);
  return hash;
}

function parseBountyId(receipt) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: BOUNTYBOARD_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === 'BountyCreated') return Number(decoded.args.id);
    } catch {
      // Not one of our events; skip.
    }
  }
  return null;
}

/** createBounty(...) -> { hash, id, receipt }. */
export async function writeCreateBounty({
  rewardPerWinner,
  maxWinners,
  applicationDeadline,
  submissionDeadline,
  contentHash,
}) {
  const { hash, receipt } = await send('createBounty', [
    rewardPerWinner,
    maxWinners,
    BigInt(applicationDeadline),
    BigInt(submissionDeadline),
    contentHash,
  ]);
  const id = parseBountyId(receipt);
  if (id === null) throw new Error('BountyCreated event not found in receipt');
  return { hash, id, receipt };
}

export async function writeStartWorking(id) {
  return send('startWorking', [BigInt(id)]);
}

export async function writeApproveWork(id, worker, submissionRef) {
  return send('approveWork', [BigInt(id), worker, submissionRef]);
}

export async function writeFinalizeBounty(id) {
  return send('finalizeBounty', [BigInt(id)]);
}

export async function writeCancelBounty(id) {
  return send('cancelBounty', [BigInt(id)]);
}

export async function writeExpireBounty(id) {
  return send('expireBounty', [BigInt(id)]);
}

/* -------------------------------------------------------------------------- */
/* Mapping onchain state -> the app's bounty vocabulary                       */
/* -------------------------------------------------------------------------- */

// The contract has four states; the UI has a richer vocabulary. Without an
// indexer there is no "in_review", so an Open bounty with workers reads as
// in_progress. Completed -> paid, Cancelled -> cancelled, Expired -> refunded.
export function appStatusOf(chain) {
  switch (chain.status) {
    case CHAIN_STATUS.Completed:
      return 'paid';
    case CHAIN_STATUS.Cancelled:
      return 'cancelled';
    case CHAIN_STATUS.Expired:
      return 'refunded';
    case CHAIN_STATUS.Open:
    default:
      return chain.workerCount > 0 ? 'in_progress' : 'open';
  }
}

export function escrowStatusOf(chain) {
  switch (chain.status) {
    case CHAIN_STATUS.Completed:
      return 'released';
    case CHAIN_STATUS.Cancelled:
    case CHAIN_STATUS.Expired:
      return 'refunded';
    case CHAIN_STATUS.Open:
    default:
      return 'funded';
  }
}

/** Human message for a decoded custom error, for toasts. */
export function describeRevert(error) {
  const reverted =
    error?.walk?.((e) => e?.name === 'ContractFunctionRevertedError') ||
    error?.cause;
  const name = reverted?.data?.errorName || error?.cause?.data?.errorName || '';
  const messages = {
    ZeroReward: 'The reward must be greater than zero.',
    InvalidWinners: 'Pick at least one winner.',
    InvalidDeadlines: 'Deadlines are invalid — submissions must close after applications.',
    UnknownBounty: 'That bounty does not exist onchain.',
    NotCreator: 'Only the bounty creator can do that.',
    WrongStatus: 'The bounty is no longer open.',
    ApplicationsClosed: 'Applications have closed for this bounty.',
    AlreadyWorking: 'You are already working on this bounty.',
    CreatorCannotWork: 'The creator cannot work on their own bounty.',
    NotWorking: 'That address never started working on this bounty.',
    AlreadyWinner: 'That worker has already been paid.',
    MaxWinnersReached: 'All winner slots are filled.',
    ExpiryNotReached: 'This bounty cannot be expired yet.',
    WorkersPresent: 'Someone is already working — the escrow is locked.',
    NothingPaid: 'Accept at least one submission before closing.',
    SafeERC20FailedOperation: 'USDC transfer failed — check your balance and allowance.',
  };
  if (messages[name]) return messages[name];
  return error?.shortMessage || error?.message || 'Transaction failed.';
}
