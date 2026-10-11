import { db } from '@/api/db';

// Mock escrow contract calls on Arc.
// The contract only ever knows addresses and state: who has started working,
// how many winner slots the pot splits into, and which shares have been paid.
// Everything else (titles, briefs, submissions, comments) stays offchain.

import { ESCROW_ADDRESS, randomBlock, randomTxHash, wait } from '@/lib/arc';

const CONFIRM_MS = 1100;
const now = () => new Date().toISOString();
const round = (value) => Math.round(value * 100) / 100;

export function potShare(bounty) {
  const slots = bounty?.winner_slots || 1;
  return round((bounty?.reward_usdc || 0) / Math.max(1, slots));
}

function baseEvent(bounty_id, event_type, { actor_name, actor_wallet, detail, tx_hash, onchain = true }) {
  return {
    bounty_id,
    event_type,
    actor_name: actor_name || null,
    actor_wallet: actor_wallet || null,
    detail: detail || null,
    tx_hash: tx_hash || null,
    block_number: onchain ? randomBlock() : null,
    onchain,
    logged_at: now(),
  };
}

async function logEvent(bounty_id, event_type, payload) {
  return db.entities.BountyEvent.create(baseEvent(bounty_id, event_type, payload));
}

export async function fundEscrowAndPublish({ draft, identity }) {
  await wait(CONFIRM_MS);

  const escrow_tx_hash = randomTxHash();
  const onchain_id = 1000 + Math.floor(Math.random() * 8999);

  const bounty = await db.entities.Bounty.create({
    ...draft,
    status: 'open',
    escrow_status: 'funded',
    contract_address: ESCROW_ADDRESS,
    onchain_id,
    creator_id: identity.id || null,
    creator_name: identity.name,
    creator_email: identity.email,
    creator_wallet: identity.walletAddress,
    worker_wallets: [],
    winners: [],
    escrow_tx_hash,
    escrow_funded_at: now(),
    submission_count: 0,
    comment_count: 0,
  });

  await db.entities.BountyEvent.bulkCreate([
    baseEvent(bounty.id, 'created', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail: `Bounty #${onchain_id} created on the escrow contract`,
      tx_hash: randomTxHash(),
    }),
    baseEvent(bounty.id, 'funded', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail:
        bounty.winner_slots > 1
          ? `${bounty.reward_usdc} USDC locked in escrow — split between ${bounty.winner_slots} winners`
          : `${bounty.reward_usdc} USDC locked in escrow — withdrawable until someone starts`,
      tx_hash: escrow_tx_hash,
    }),
  ]);

  return bounty;
}

// startWork(bountyId) — anyone can signal they started; the contract stores the address.
export async function startWork(bounty, identity) {
  await wait(CONFIRM_MS);
  const tx_hash = randomTxHash();
  const wallets = bounty.worker_wallets || [];

  await db.entities.BountyWorker.create({
    bounty_id: bounty.id,
    bounty_title: bounty.title,
    worker_id: identity.id || null,
    worker_name: identity.name,
    worker_email: identity.email,
    worker_wallet: identity.walletAddress,
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
    detail: 'startWork() recorded — escrow is now locked until a submission is accepted',
    tx_hash,
  });

  return tx_hash;
}

export async function submitWork(bounty, identity, { content, attachments = [] }) {
  await wait(CONFIRM_MS);
  const commit_hash = randomTxHash();

  await db.entities.Submission.create({
    bounty_id: bounty.id,
    bounty_title: bounty.title,
    worker_id: identity.id || null,
    worker_name: identity.name,
    worker_email: identity.email,
    worker_wallet: identity.walletAddress,
    content,
    attachments,
    commit_hash,
    status: 'pending',
  });

  await db.entities.Bounty.update(bounty.id, {
    status: 'in_review',
    submission_count: (bounty.submission_count || 0) + 1,
  });

  await logEvent(bounty.id, 'submitted', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: 'Submission reference hash recorded onchain',
    tx_hash: commit_hash,
  });

  return commit_hash;
}

// approveWork(bountyId, workerAddress) — creator accepts one submission and its
// share of the pot is released. With several winner slots the pot keeps splitting
// until every slot is filled, then the escrow closes.
export async function approveWork(bounty, submission, identity) {
  await wait(CONFIRM_MS);
  const tx_hash = randomTxHash();
  const slots = bounty.winner_slots || 1;
  const share = potShare(bounty);
  const winners = [
    ...(bounty.winners || []),
    {
      name: submission.worker_name,
      email: submission.worker_email,
      wallet: submission.worker_wallet,
      submission_id: submission.id,
      share_usdc: share,
      tx_hash,
      paid_at: now(),
    },
  ];
  const filled = winners.length >= slots;

  await db.entities.Submission.update(submission.id, {
    status: 'accepted',
    review_note: `Accepted — ${share} USDC share released`,
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

  await db.entities.Bounty.update(bounty.id, {
    winners,
    status: filled ? 'paid' : 'in_review',
    escrow_status: filled ? 'released' : 'funded',
    ...(filled ? { payout_tx_hash: tx_hash, payout_at: now() } : {}),
  });

  const contributors = await db.entities.BountyWorker.filter(
    { bounty_id: bounty.id },
    { limit: 100 }
  );
  const rows = (contributors.items || [])
    .map((worker) => {
      if (worker.worker_email === submission.worker_email) {
        return { id: worker.id, status: 'won', share_usdc: share };
      }
      return filled ? { id: worker.id, status: 'not_selected' } : null;
    })
    .filter(Boolean);
  if (rows.length) await db.entities.BountyWorker.bulkUpdate(rows);

  const events = [
    baseEvent(bounty.id, 'accepted', {
      actor_name: identity.name,
      actor_wallet: identity.walletAddress,
      detail: `approveWork() — ${submission.worker_name} accepted for ${share} USDC${slots > 1 ? ` (winner ${winners.length} of ${slots})` : ''}`,
      tx_hash,
    }),
  ];
  if (filled) {
    events.push(
      baseEvent(bounty.id, 'paid', {
        actor_name: identity.name,
        actor_wallet: identity.walletAddress,
        detail:
          slots > 1
            ? `Escrow closed — ${bounty.reward_usdc} USDC released across ${winners.length} winners`
            : `${bounty.reward_usdc} USDC released to ${submission.worker_wallet || 'worker wallet'}`,
        tx_hash,
      })
    );
  }
  await db.entities.BountyEvent.bulkCreate(events);

  return { tx_hash, share, filled, winners: winners.length };
}

export async function rejectSubmission(bounty, submission, identity) {
  await wait(CONFIRM_MS);

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

// withdraw() — only while no one has started working.
export async function withdrawEscrow(bounty, identity) {
  await wait(CONFIRM_MS);
  const refund_tx_hash = randomTxHash();

  await db.entities.Bounty.update(bounty.id, {
    status: 'refunded',
    escrow_status: 'refunded',
    refund_tx_hash,
  });

  await logEvent(bounty.id, 'refunded', {
    actor_name: identity.name,
    actor_wallet: identity.walletAddress,
    detail: `withdraw() — ${bounty.reward_usdc} USDC returned to the creator before anyone started`,
    tx_hash: refund_tx_hash,
  });

  return refund_tx_hash;
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