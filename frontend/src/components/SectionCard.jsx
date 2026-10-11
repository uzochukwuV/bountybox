import React from 'react';
import { cn } from '@/lib/utils';

export default function SectionCard({ title, description, action, children, className, bodyClassName }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}