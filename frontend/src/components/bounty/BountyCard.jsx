import React from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { CalendarDays, MessageSquare, Users } from 'lucide-react';
import StatusPill from '@/components/StatusPill';
import InitialsAvatar from '@/components/InitialsAvatar';
import { formatUSDC } from '@/lib/arc';
import { cn } from '@/lib/utils';

const COMPLEXITY = { quick: 'Quick win', standard: 'Standard', deep: 'Deep work' };

export default function BountyCard({ bounty, compact = false, className }) {
  return (
    <Link
      to={`/bounty/${bounty.id}`}
      data-testid="bounty-card"
      className={cn(
        'group flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-sm font-semibold leading-snug">{bounty.title}</h3>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 font-display text-xs font-semibold text-accent-foreground">
          {formatUSDC(bounty.reward_usdc)} USDC
        </span>
      </div>

      {!compact && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {bounty.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusPill status={bounty.status} />
        {bounty.winner_slots > 1 && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Split · {bounty.winner_slots} winners
          </span>
        )}
        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {bounty.category}
        </span>
        {!compact && (
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {COMPLEXITY[bounty.complexity] || 'Standard'}
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <InitialsAvatar name={bounty.creator_name} size="xs" />
          <span className="truncate">{bounty.creator_name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {bounty.due_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {moment(bounty.due_date).format('MMM D')}
            </span>
          )}
          {bounty.submission_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {bounty.submission_count}
            </span>
          )}
          {bounty.comment_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {bounty.comment_count}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}