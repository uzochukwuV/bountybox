import { db } from '@/api/db';

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import moment from 'moment';
import { ArrowLeft, CalendarDays, Clock, Hash } from 'lucide-react';

import StatusPill from '@/components/StatusPill';
import SectionCard from '@/components/SectionCard';
import EmptyState from '@/components/EmptyState';
import InitialsAvatar from '@/components/InitialsAvatar';
import TxOverlay from '@/components/TxOverlay';
import EscrowPanel from '@/components/bounty/EscrowPanel';
import LifecycleTimeline from '@/components/bounty/LifecycleTimeline';
import SubmissionList from '@/components/bounty/SubmissionList';
import CommentThread from '@/components/bounty/CommentThread';
import AttachmentList from '@/components/bounty/AttachmentList';
import BountyActions from '@/components/bounty/BountyActions';
import WorkersPanel from '@/components/bounty/WorkersPanel';
import { approveWork, rejectSubmission } from '@/lib/bountyChain';
import { formatUSDC, shortAddress } from '@/lib/arc';
import { useIdentity } from '@/lib/useIdentity';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

function PersonRow({ role, name, wallet }) {
  if (!name) return null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <InitialsAvatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{name}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {wallet ? shortAddress(wallet) : role}
        </p>
      </div>
    </div>
  );
}

export default function BountyDetail() {
  const { id } = useParams();
  const identity = useIdentity();
  const { toast } = useToast();

  const [bounty, setBounty] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [events, setEvents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [releasing, setReleasing] = useState(false);

  const load = useCallback(async () => {
    try {
      const record = await db.entities.Bounty.get(id);
      const [subs, timeline, contributors] = await Promise.all([
        db.entities.Submission.filter({ bounty_id: id }, { sort: '-created_date', limit: 50 }),
        db.entities.BountyEvent.filter({ bounty_id: id }, { sort: '-logged_at', limit: 60 }),
        db.entities.BountyWorker.filter({ bounty_id: id }, { sort: 'started_at', limit: 100 }),
      ]);
      setBounty(record);
      setSubmissions(subs.items || []);
      setEvents(timeline.items || []);
      setWorkers(contributors.items || []);
      setMissing(false);
    } catch (error) {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async (submission) => {
    setBusyId(submission.id);
    setReleasing(true);
    try {
      const slotsTotal = bounty.winner_slots || 1;
      const result = await approveWork(bounty, submission, identity);
      toast({
        title: result.filled
          ? result.winners > 1
            ? 'Pot fully paid out'
            : 'USDC released'
          : 'Winner share released',
        description: result.filled
          ? `${result.winners} winner${result.winners > 1 ? 's' : ''} paid from the ${formatUSDC(
              bounty.reward_usdc
            )} USDC pot.`
          : `${formatUSDC(result.share)} USDC paid to ${submission.worker_name} — ${
              slotsTotal - result.winners
            } slot${slotsTotal - result.winners > 1 ? 's' : ''} still open.`,
      });
      await load();
    } finally {
      setReleasing(false);
      setBusyId('');
    }
  };

  const reject = async (submission) => {
    setBusyId(submission.id);
    try {
      await rejectSubmission(bounty, submission, identity);
      toast({ title: 'Changes requested', description: 'The bounty went back to the worker.' });
      await load();
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
        </div>
      </div>
    );
  }

  if (missing || !bounty) {
    return (
      <EmptyState
        title="Bounty not found"
        description="This bounty may have been removed, or the link is wrong."
        action={
          <Button asChild className="rounded-full">
            <Link to="/">Back to the board</Link>
          </Button>
        }
      />
    );
  }

  const isCreator = !!identity.email && bounty.creator_email === identity.email;
  const slots = bounty.winner_slots || 1;
  const winners = bounty.winners || [];
  const share = (bounty.reward_usdc || 0) / slots;

  return (
    <div className="space-y-6">
      <TxOverlay open={releasing} label="Releasing USDC from escrow…" />

      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All bounties
      </Link>

      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={bounty.status} />
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {bounty.category}
            </span>
            {(bounty.tags || []).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {bounty.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <InitialsAvatar name={bounty.creator_name} size="xs" />
              {bounty.creator_name}
            </span>
            {bounty.due_date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Due {moment(bounty.due_date).format('MMM D, YYYY')}
              </span>
            )}
            {bounty.submission_deadline && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Submissions close {moment(bounty.submission_deadline).format('MMM D')}
              </span>
            )}
            {bounty.onchain_id && (
              <span className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" />
                Bounty #{bounty.onchain_id}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-border bg-muted/40 px-5 py-4 lg:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Reward
          </p>
          <p className="font-display text-3xl font-semibold">{formatUSDC(bounty.reward_usdc)}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {slots > 1 ? `USDC pot · ${slots} winners` : 'USDC in escrow'}
          </p>
          {slots > 1 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {formatUSDC(share)} USDC each
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <SectionCard title="The work">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {bounty.description}
            </p>
            {bounty.attachments?.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Brief and assets
                </p>
                <AttachmentList attachments={bounty.attachments} />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Submissions"
            description={
              submissions.length === 0
                ? 'Work sent in by contributors'
                : `${submissions.length} submitted · ${slots} winner${slots > 1 ? 's' : ''}`
            }
          >
            <SubmissionList
              submissions={submissions}
              canReview={isCreator}
              busyId={busyId}
              onAccept={accept}
              onReject={reject}
              share={share}
            />
          </SectionCard>

          <SectionCard title="Discussion">
            <CommentThread bounty={bounty} identity={identity} onPosted={load} />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <BountyActions
            bounty={bounty}
            submissions={submissions}
            workers={workers}
            identity={identity}
            onChanged={load}
          />
          <EscrowPanel bounty={bounty} />
          <WorkersPanel workers={workers} />
          <SectionCard
            title="Winners"
            description={
              slots > 1
                ? `${winners.length} of ${slots} slots filled · ${formatUSDC(share)} USDC each`
                : undefined
            }
            bodyClassName="divide-y divide-border px-5 py-1"
          >
            {winners.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">
                No winner yet — the creator releases the pot after review.
              </p>
            ) : (
              winners.map((winner, index) => (
                <PersonRow
                  key={winner.submission_id || winner.wallet || index}
                  role={`${formatUSDC(winner.share_usdc)} USDC`}
                  name={winner.name}
                  wallet={winner.wallet}
                />
              ))
            )}
          </SectionCard>
          <LifecycleTimeline events={events} />
        </div>
      </div>
    </div>
  );
}