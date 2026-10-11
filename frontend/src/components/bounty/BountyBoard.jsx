import React from 'react';
import BountyCard from '@/components/bounty/BountyCard';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { key: 'open', label: 'Open', statuses: ['open'], accent: 'bg-tone-blue' },
  { key: 'in_progress', label: 'In Progress', statuses: ['in_progress'], accent: 'bg-tone-amber' },
  { key: 'in_review', label: 'In Review', statuses: ['in_review'], accent: 'bg-tone-violet' },
  { key: 'paid', label: 'Paid', statuses: ['paid'], accent: 'bg-tone-green' },
  { key: 'closed', label: 'Closed', statuses: ['refunded', 'cancelled'], accent: 'bg-tone-slate' },
];

export default function BountyBoard({ bounties, focus = 'all' }) {
  const columns = COLUMNS.filter((column) => focus === 'all' || column.key === focus)
    .map((column) => ({
      ...column,
      items: bounties.filter((bounty) => column.statuses.includes(bounty.status)),
    }))
    .filter((column) => column.key !== 'closed' || column.items.length > 0);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" data-testid="bounty-board">
      {columns.map((column) => (
        <div
          key={column.key}
          className="flex w-[17.5rem] shrink-0 flex-col rounded-2xl border border-border bg-muted/40 p-3"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className={cn('h-2 w-2 rounded-full', column.accent)} />
              {column.label}
            </span>
            <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {column.items.length}
            </span>
          </div>

          <div className="flex flex-col gap-3" data-testid={`column-${column.key}`}>
            {column.items.map((bounty) => (
              <BountyCard key={bounty.id} bounty={bounty} compact />
            ))}
            {column.items.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                No bounties here
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}