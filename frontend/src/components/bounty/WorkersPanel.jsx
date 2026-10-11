import React from 'react';
import moment from 'moment';
import { Award, Hammer } from 'lucide-react';
import SectionCard from '@/components/SectionCard';
import InitialsAvatar from '@/components/InitialsAvatar';
import { formatUSDC, shortAddress } from '@/lib/arc';
import { cn } from '@/lib/utils';

const STATUS = {
  working: { label: 'Working', pill: 'bg-tone-blue-soft text-tone-blue' },
  won: { label: 'Winner', pill: 'bg-tone-green-soft text-tone-green' },
  not_selected: { label: 'Not selected', pill: 'bg-tone-slate-soft text-tone-slate' },
};

export default function WorkersPanel({ workers = [] }) {
  const working = workers.filter((worker) => worker.status === 'working').length;

  return (
    <SectionCard
      title="Contributors"
      description={
        workers.length === 0
          ? 'No one has started working yet'
          : `${working} working · ${workers.length} started`
      }
      bodyClassName="px-5 py-1"
    >
      {workers.length === 0 ? (
        <div className="flex items-start gap-2.5 py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Hammer className="h-3.5 w-3.5" />
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Be the first to start working. Until someone does, the creator can withdraw the reward.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border" data-testid="workers-list">
          {workers.map((worker) => {
            const meta = STATUS[worker.status] || STATUS.working;
            return (
              <li key={worker.id} className="flex items-center gap-3 py-2.5">
                <InitialsAvatar name={worker.worker_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                    {worker.worker_name}
                    {worker.status === 'won' && <Award className="h-3 w-3 text-tone-green" />}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {shortAddress(worker.worker_wallet)}
                    {worker.status === 'won' && worker.share_usdc
                      ? ` · ${formatUSDC(worker.share_usdc)} USDC`
                      : worker.started_at
                        ? ` · ${moment(worker.started_at).fromNow()}`
                        : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
                    meta.pill
                  )}
                >
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}