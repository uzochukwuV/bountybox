import React from 'react';

export default function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}