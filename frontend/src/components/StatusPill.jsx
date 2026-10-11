import React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  blue: { pill: 'bg-tone-blue-soft text-tone-blue', dot: 'bg-tone-blue' },
  amber: { pill: 'bg-tone-amber-soft text-tone-amber', dot: 'bg-tone-amber' },
  violet: { pill: 'bg-tone-violet-soft text-tone-violet', dot: 'bg-tone-violet' },
  green: { pill: 'bg-tone-green-soft text-tone-green', dot: 'bg-tone-green' },
  red: { pill: 'bg-tone-red-soft text-tone-red', dot: 'bg-tone-red' },
  slate: { pill: 'bg-tone-slate-soft text-tone-slate', dot: 'bg-tone-slate' },
};

export const STATUS_META = {
  open: { label: 'Open', tone: 'blue' },
  in_progress: { label: 'In Progress', tone: 'amber' },
  in_review: { label: 'In Review', tone: 'violet' },
  paid: { label: 'Paid', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All bounties' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'paid', label: 'Paid' },
  { value: 'closed', label: 'Closed' },
];

const SUBMISSION_META = {
  pending: { label: 'Pending review', tone: 'amber' },
  accepted: { label: 'Winner — paid', tone: 'green' },
  rejected: { label: 'Changes requested', tone: 'red' },
};

export default function StatusPill({ status, kind = 'bounty', showDot = true, className }) {
  const meta = (kind === 'submission' ? SUBMISSION_META : STATUS_META)[status] ||
    STATUS_META.open;
  const tone = TONES[meta.tone] || TONES.slate;

  return (
    <span
      data-testid={`pill-${status}`}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        tone.pill,
        className
      )}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {meta.label}
    </span>
  );
}