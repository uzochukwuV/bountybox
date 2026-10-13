// The seam between the UI and the BountyBoard escrow contract on Arc.
//
// Real transactions now: fundEscrowAndPublish approves USDC and calls
// createBounty; startWork/approveWork/withdrawEscrow/finalize/expire call the
// matching contract functions and wait for receipts. Content (titles, briefs,
// submissions, comments) still lives in Supabase.
//
// No indexer. The contract is the source of truth for money and lifecycle, so
// reads go through lib/chain.js (`getBounty`, `getWorkers`, `getWinners`) and
// `hydrateBounty` merges that authoritative state onto the DB content row. The
// mirrored columns in Postgres are a display cache, refreshed on every action.

import { keccak256, toHex } from 'viem';

import { db } from '@/api/db';
import { formatUSDC, formatUSDCUnits, parseUSDC } from '@/lib/arc';
import { resolveDeadlines } from '@/lib/deadlines';
import {
  CHAIN_STATUS,
  appStatusOf,
  escrowStatusOf,
  ensureUsdcAllowance,
  getReviewPeriod,
  readBounty,
  readUsdcBalance,
  writeApproveWork,
  writeCancelBounty,
  writeCreateBounty,
  writeExpireBounty,
  writeFinalizeBounty,
  writeStartWorking,
} from '@/lib/chain';

const now = () => new Date().toISOString();
const round = (value) => Math.round(value * 100) / 100;

/** The pot divided evenly across the winner slots. */
export function potShare(bounty) {
  const slots = bounty?.winner_slots || 1;
  return round((bounty?.reward_usdc || 0) / Math.max(1, slots));
}

/* -------------------------------------------------------------------------- */
/* Hashes                                                                     */
/* -------------------------------------------------------------------------- */

// The onchain contentHash is an opaque commitment to the offchain brief. The
// chain never reads it; the app recomputes it to detect content drift.
export function contentHashOf(draft) {
  const payload = JSON.stringify({
    title: draft.title,
    description: draft.description,
    category: draft.category,
    complexity: draft.complexity,
    tags: draft.tags || [],
    winner_slots: draft.winner_slots,
  });
  return keccak256(toHex(payload));
}

// The submissionRef anchored in BountyWinnerPaid when the creator accepts work.
export function submissionRefOf(submission) {
  const payload = JSON.stringify({
    content: submission.content,
    attachments: submission.attachments || [],
  });
  return keccak256(toHex(payload));
}

/* -------------------------------------------------------------------------- */
/* Deadlines                                                                  */
/* -------------------------------------------------------------------------- */

// Conversion and ordering live in lib/deadlines.js so the form and the write
// path enforce the contract's rule (submissionDeadline > applicationDeadline)
// with the same code.

function perWinnerBaseUnits(totalBaseUnits, slots) {
  const per = totalBaseUnits / BigInt(slots);
  if (per * BigInt(slots) !== totalBaseUnits) {
    throw new Error(
      `Reward must split evenly across ${slots} winners — use an amount divisible by ${slots}.`
    );
  }
  return per;
}

/* -------------------------------------------------------------------------- */
/* Hydration (chain -> app row)                                               */
/* -------------------------------------------------------------------------- */

/** True when a DB row carries a chain id we can hydrate from. */
export function hasChainId(bounty) {
  return bounty?.onchain_id !== null && bounty?.onchain_id !== undefined;
}

/** Returns the bounty's onchain id or throws if the row predates the escrow. */
function requireOnchainId(bounty) {
  if (!hasChainId(bounty)) {
    throw new Error('This bounty has no escrow contract id yet — it predates onchain escrow.');
  }
  return bounty.onchain_id;
}

/**
 * Merge authoritative onchain state onto a DB content row. The result keeps the
 * row's content fields and overwrites the money/lifecycle fields from the chain,
 * so components keep reading the same shape.
 */
export async function hydrateBounty(row, { submissions = [] } = {}) {
  if (!hasChainId(row)) return row;

  let chain;
  try {
    chain = await readBounty(row.onchain_id);
  } catch {
    // Chain unreachable: fall back to the cached columns rather than blanking.
    return row;
  }

  const nameFor = (wallet) => {
    const match = submissions.find(
      (item) => (item.worker_wallet || '').toLowerCase() === wallet.toLowerCase()
    );
    return match?.worker_name || row.creator_name || 'Contributor';
  };

  const winners = chain.winners.map((wallet) => {
    const match = submissions.find(
      (item) => (item.worker_wallet || '').toLowerCase() === wallet.toLowerCase()
    );
    return {
      wallet,
      name: nameFor(wallet),
      share_usdc: Number(formatUSDCUnits(chain.rewardPerWinner)),
      submission_id: match?.id || null,
    };
  });

  const pot = Number(formatUSDCUnits(chain.rewardPerWinner * BigInt(chain.maxWinners)));

  let reviewPeriod = null;
  try {
    reviewPeriod = await getReviewPeriod();
  } catch {
    reviewPeriod = null;
  }

  return {
    ...row,
    status: appStatusOf(chain),
    escrow_status: escrowStatusOf(chain),
    reward_usdc: pot,
    winner_slots: chain.maxWinners,
    winner_count: chain.winnerCount,
    worker_wallets: chain.workers,
    winners,
    chain_status: chain.status,
    application_deadline: chain.applicationDeadline,
    submission_deadline_ts: chain.submissionDeadline,
    remaining_usdc: Number(
      formatUSDCUnits(chain.rewardPerWinner * BigInt(chain.maxWinners - chain.winnerCount))
    ),
    is_open: chain.status === CHAIN_STATUS.Open,
    review_period: reviewPeriod,
  };
}

/* -------------------------------------------------------------------------- */
/* Events (DB cache of the lifecycle feed)                                    */
/* -------------------------------------------------------------------------- */

function baseEvent(bounty_id, event_type, { actor_name, actor_wallet, detail, tx_hash, onchain = true }) {
  return {
    bounty_id,
    event_type,
    actor_name: actor_name || null,
    actor_wallet: actor_wallet || null,
    detail: detail || null,
    tx_hash: tx_hash || null,
    block_number: null,
    onchain,
    logged_at: now(),
  };
}

async function logEvent(bounty_id, event_type, payload) {
  return db.entities.BountyEvent.create(baseEvent(bounty_id, event_type, payload));
}

/* -------------------------------------------------------------------------- */
/* Write path                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fund the escrow and publish the bounty.
 *
 * Approves USDC if the allowance is short, then calls createBounty and stores the
 * content plus the onchain id / tx hash. Returns the DB bounty (its uuid id is
 * the app's content key; onchain_id is the chain key).
 */
export async function fundEscrowAndPublish({ draft, identity }) {
  if (!identity?.walletAddress) throw new Error('Connect a wallet before funding escrow.');

  const slots = Number(draft.winner_slots) || 1;
  const totalBaseUnits = parseUSDC(draft.reward_usdc);
  const rewardPerWinner = perWinnerBaseUnits(totalBaseUnits, slots);
  const escrow = rewardPerWinner * BigInt(slots);

  const balance = await readUsdcBalance(identity.walletAddress);
  if (balance < escrow) {
    throw new Error(
      `Not enough USDC: need ${formatUSDCUnits(escrow)}, have ${formatUSDCUnits(balance)}.`
    );
  }

  const { applicationDeadline, submissionDeadline } = resolveDeadlines(draft);
  const contentHash = contentHashOf({ ...draft, winner_slots: slots });

  await ensureUsdcAllowance(escrow, identity.walletAddress);

  const { hash, id: onchainId } = await writeCreateBounty({
    rewardPerWinner,
    maxWinners: slots,
    applicationDeadline,
    submissionDeadline,
    contentHash,
  });

  const bounty = await db.entities.Bounty.create({
    ...draft,
    title: draft.title,
    reward_usdc: Number(formatUSDCUnits(escrow)),
    winner_slots: slots,
    status: 'open',
    escrow_status: 'funded',
    onchain_id: onchainId,
    creator_id: identity.id || null,
    creator_name: identity.name,
    creator_email: identity.email,
    creator_wallet: (identity.walletAddress || '').toLowerCase(),
    worker_wallets: [],
    winners: [],
    escrow_tx_hash: hash,
    escrow_funded_at: now(),
    submission_count: 0,
    comment_count: 0,
  });

  await db.entities.BountyEvent.bulkCreate([
    baseEvent(bounty.id, 'created', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail: `Bounty #${onchainId} created on the escrow contract`,
      tx_hash: hash,
    }),
    baseEvent(bounty.id, 'funded', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail:
        slots > 1
          ? `${formatUSDCUnits(escrow)} USDC locked — split across ${slots} winners`
          : `${formatUSDCUnits(escrow)} USDC locked in escrow`,
      tx_hash: hash,
    }),
  ]);

  return bounty;
}

// startWorking(id) — anyone but the creator, before the application deadline.
export async function startWork(bounty, identity) {
  const { hash } = await writeStartWorking(requireOnchainId(bounty));

  const wallets = bounty.worker_wallets || [];
  await db.entities.BountyWorker.create({
    bounty_id: bounty.id,
    bounty_title: bounty.title,
    worker_id: identity.id || null,
    worker_name: identity.name,
    worker_email: identity.email,
    worker_wallet: (identity.walletAddress || '').toLowerCase(),
    status: 'working',
    started_at: now(),
  });

  await db.entities.Bounty.update(bounty.id, {
    worker_wallets: [...wallets, identity.walletAddress],
    ...(bounty.status === 'open' ? { status: 'in_progress' } : {}),
  });

  await logEvent(bounty.id, 'started', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: 'startWorking() recorded — escrow is now locked until the creator accepts work',
    tx_hash: hash,
  });

  return hash;
}

// submitWork records the offchain work and its reference hash. The contract has
// no submit function; the hash is anchored when the creator accepts (approveWork).
export async function submitWork(bounty, identity, { content, attachments = [] }) {
  const submissionRef = submissionRefOf({ content, attachments });

  await db.entities.Submission.create({
    bounty_id: bounty.id,
    bounty_title: bounty.title,
    worker_id: identity.id || null,
    worker_name: identity.name,
    worker_email: identity.email,
    worker_wallet: (identity.walletAddress || '').toLowerCase(),
    content,
    attachments,
    commit_hash: submissionRef,
    status: 'pending',
  });

  await db.entities.Bounty.update(bounty.id, {
    submission_count: (bounty.submission_count || 0) + 1,
  });

  await logEvent(bounty.id, 'submitted', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: 'Submission recorded — its reference hash is anchored when the creator accepts',
    onchain: false,
  });

  return submissionRef;
}

/**
 * approveWork(id, worker, submissionRef) — the creator accepts one submission and
 * its share of the pot is released. Repeatable up to maxWinners.
 */
export async function approveWork(bounty, submission, identity) {
  const worker = submission.worker_wallet;
  if (!worker) throw new Error('Submission has no worker wallet to pay.');

  const submissionRef = submission.commit_hash || submissionRefOf(submission);
  const { hash } = await writeApproveWork(requireOnchainId(bounty), worker, submissionRef);

  // Re-read the chain so the DB cache matches what actually happened.
  const chain = await readBounty(requireOnchainId(bounty));
  const filled = chain.status !== CHAIN_STATUS.Open;
  const share = Number(formatUSDCUnits(chain.rewardPerWinner));

  await db.entities.Submission.update(submission.id, {
    status: 'accepted',
    review_note: `Accepted — ${formatUSDC(share)} USDC share released`,
  });

  if (filled) {
    const pending = await db.entities.Submission.filter(
      { bounty_id: bounty.id, status: 'pending' },
      { limit: 100 }
    );
    const others = (pending.items || []).filter((item) => item.id !== submission.id);
    if (others.length) {
      await db.entities.Submission.bulkUpdate(
        others.map((item) => ({
          id: item.id,
          status: 'rejected',
          review_note: 'Bounty closed — all winner slots were filled',
        }))
      );
    }
  }

  const allSubs = await db.entities.Submission.filter({ bounty_id: bounty.id }, { limit: 200 });
  const winnerRows = chain.winners.map((wallet) => {
    const match = (allSubs.items || []).find(
      (item) => (item.worker_wallet || '').toLowerCase() === wallet.toLowerCase()
    );
    return {
      wallet,
      name: match?.worker_name || submission.worker_name,
      submission_id: match?.id || null,
      share_usdc: share,
      tx_hash: hash,
      paid_at: now(),
    };
  });

  await db.entities.Bounty.update(bounty.id, {
    winners: winnerRows,
    status: filled ? 'paid' : 'in_review',
    escrow_status: filled ? 'released' : 'funded',
    ...(filled ? { payout_tx_hash: hash, payout_at: now() } : {}),
  });

  const contributors = await db.entities.BountyWorker.filter({ bounty_id: bounty.id }, { limit: 100 });
  const rows = (contributors.items || [])
    .map((workerRow) => {
      if ((workerRow.worker_wallet || '').toLowerCase() === worker.toLowerCase()) {
        return { id: workerRow.id, status: 'won', share_usdc: share };
      }
      return filled ? { id: workerRow.id, status: 'not_selected' } : null;
    })
    .filter(Boolean);
  if (rows.length) await db.entities.BountyWorker.bulkUpdate(rows);

  const events = [
    baseEvent(bounty.id, 'accepted', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail: `approveWork() — ${submission.worker_name} accepted for ${formatUSDC(share)} USDC`,
      tx_hash: hash,
    }),
  ];
  if (filled) {
    events.push(
      baseEvent(bounty.id, 'paid', {
        actor_name: identity.name,
        actor_wallet: identity.walletAddress,
        detail: `Escrow closed — ${chain.winnerCount} winner${chain.winnerCount > 1 ? 's' : ''} paid`,
        tx_hash: hash,
      })
    );
  }
  await db.entities.BountyEvent.bulkCreate(events);

  return { tx_hash: hash, share, filled, winners: chain.winnerCount };
}

/** finalizeBounty(id) — close early and refund the unspent pool. Creator-only. */
export async function finalizeBounty(bounty, identity) {
  const { hash } = await writeFinalizeBounty(requireOnchainId(bounty));

  await db.entities.Bounty.update(bounty.id, {
    status: 'paid',
    escrow_status: 'released',
    payout_tx_hash: hash,
    payout_at: now(),
  });

  await logEvent(bounty.id, 'paid', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: 'finalizeBounty() — bounty closed, unspent escrow refunded to the creator',
    tx_hash: hash,
  });

  return hash;
}

/** expireBounty(id) — permissionless refund of unspent escrow. */
export async function expireBounty(bounty, identity) {
  const { hash } = await writeExpireBounty(requireOnchainId(bounty));

  await db.entities.Bounty.update(bounty.id, {
    status: 'refunded',
    escrow_status: 'refunded',
    refund_tx_hash: hash,
  });

  await logEvent(bounty.id, 'refunded', {
    actor_name: identity?.name || null,
    actor_wallet: identity?.walletAddress || null,
    detail: 'expireBounty() — unspent escrow refunded to the creator',
    tx_hash: hash,
  });

  return hash;
}

/** cancelBounty(id) — withdraw the whole pool, only while nobody is working. */
export async function withdrawEscrow(bounty, identity) {
  const { hash } = await writeCancelBounty(requireOnchainId(bounty));

  await db.entities.Bounty.update(bounty.id, {
    status: 'refunded',
    escrow_status: 'refunded',
    refund_tx_hash: hash,
  });

  await logEvent(bounty.id, 'refunded', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: `cancelBounty() — ${formatUSDC(bounty.reward_usdc)} USDC returned before anyone started`,
    tx_hash: hash,
  });

  return hash;
}

// Requesting changes is offchain: the creator simply asks the worker to rework,
// and the onchain state is untouched.
export async function rejectSubmission(bounty, submission, identity) {
  await db.entities.Submission.update(submission.id, {
    status: 'rejected',
    review_note: 'Changes requested — you can submit again',
  });

  await db.entities.Bounty.update(bounty.id, { status: 'in_progress' });

  await logEvent(bounty.id, 'rejected', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: `Changes requested on ${submission.worker_name}'s submission`,
    onchain: false,
  });
}

export async function postComment(bounty, identity, body) {
  const comment = await db.entities.BountyComment.create({
    bounty_id: bounty.id,
    author_id: identity.id || null,
    author_name: identity.name,
    author_email: identity.email,
    body,
  });

  await db.entities.Bounty.update(bounty.id, {
    comment_count: (bounty.comment_count || 0) + 1,
  });

  await logEvent(bounty.id, 'commented', {
    actor_name: identity.name,
    detail: body.slice(0, 90),
    onchain: false,
  });

  return comment;
}
