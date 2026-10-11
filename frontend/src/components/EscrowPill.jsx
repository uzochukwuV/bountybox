import React from 'react';
import { cn } from '@/lib/utils';

const ESCROW_META = {
  unfunded: { label: 'Not funded', pill: 'bg-tone-slate-soft text-tone-slate' },
  funded: { label: 'Funded', pill: 'bg-tone-amber-soft text-tone-amber' },
  released: { label: 'Released', pill: 'bg-tone-green-soft text-tone-green' },
  refunded: { label: 'Refunded', pill: 'bg-tone-red-soft text-tone-red' },
};

export default function EscrowPill({ status, className }) {
  const meta = ESCROW_META[status] || ESCROW_META.unfunded;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        meta.pill,
        className
      )}
    >
      {meta.label}
    </span>
  );
}