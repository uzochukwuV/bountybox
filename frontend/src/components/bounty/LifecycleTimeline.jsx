import React from 'react';
import moment from 'moment';
import {
  Ban,
  CheckCheck,
  CircleDollarSign,
  FileCode2,
  Hammer,
  Lock,
  MessageSquare,
  Undo2,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import SectionCard from '@/components/SectionCard';
import TxLink from '@/components/TxLink';
import { cn } from '@/lib/utils';

const EVENTS = {
  created: { label: 'Bounty created', icon: FileCode2, tone: 'bg-tone-slate-soft text-tone-slate' },
  funded: { label: 'USDC locked in escrow', icon: Lock, tone: 'bg-tone-amber-soft text-tone-amber' },
  claimed: { label: 'Work started', icon: UserCheck, tone: 'bg-tone-blue-soft text-tone-blue' },
  started: { label: 'Work started', icon: Hammer, tone: 'bg-tone-blue-soft text-tone-blue' },
  submitted: { label: 'Work submitted', icon: Upload, tone: 'bg-tone-violet-soft text-tone-violet' },
  accepted: { label: 'Submission accepted', icon: CheckCheck, tone: 'bg-tone-green-soft text-tone-green' },
  rejected: { label: 'Changes requested', icon: XCircle, tone: 'bg-tone-red-soft text-tone-red' },
  paid: { label: 'USDC released', icon: CircleDollarSign, tone: 'bg-tone-green-soft text-tone-green' },
  refunded: { label: 'Escrow refunded', icon: Undo2, tone: 'bg-tone-red-soft text-tone-red' },
  cancelled: { label: 'Bounty cancelled', icon: Ban, tone: 'bg-tone-slate-soft text-tone-slate' },
  commented: { label: 'Comment posted', icon: MessageSquare, tone: 'bg-tone-slate-soft text-tone-slate' },
};

export default function LifecycleTimeline({ events }) {
  const ordered = [...events].sort(
    (a, b) => new Date(b.logged_at || b.created_date) - new Date(a.logged_at || a.created_date)
  );

  return (
    <SectionCard title="Lifecycle" description="Recorded by the escrow contract" bodyClassName="p-4">
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No lifecycle events yet.</p>
      ) : (
        <ol className="relative space-y-4 pl-1" data-testid="lifecycle-timeline">
          {ordered.map((event) => {
            const meta = EVENTS[event.event_type] || EVENTS.created;
            const stamp = event.logged_at || event.created_date;
            return (
              <li key={event.id} className="relative flex gap-3">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    meta.tone
                  )}
                >
                  <meta.icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-semibold">{meta.label}</p>
                  {event.detail && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {event.detail}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {event.actor_name && <span>{event.actor_name}</span>}
                    {stamp && <span>· {moment(stamp).fromNow()}</span>}
                    {event.block_number && <span>· block {event.block_number}</span>}
                  </p>
                  {event.tx_hash && <TxLink hash={event.tx_hash} className="mt-1 inline-flex" />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}