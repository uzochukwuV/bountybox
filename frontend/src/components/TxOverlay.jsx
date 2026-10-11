import React from 'react';
import { Loader2 } from 'lucide-react';

export default function TxOverlay({
  open,
  label = 'Confirming on Arc…',
  sublabel = 'Simulated transaction — no real funds move.',
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm"
      data-testid="tx-overlay"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </span>
        <p className="mt-4 font-heading text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}