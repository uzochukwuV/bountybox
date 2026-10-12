import React from 'react';
import { ExternalLink } from 'lucide-react';
import { ARC_CHAIN } from '@/lib/arc';
import { cn } from '@/lib/utils';

export default function TxLink({ hash, label, className }) {
  if (!hash) return <span className="text-muted-foreground">—</span>;

  return (
    <a
      href={`${ARC_CHAIN.blockExplorers.default.url}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 font-mono text-xs text-primary transition hover:underline',
        className
      )}
    >
      {label || `${hash.slice(0, 10)}…${hash.slice(-6)}`}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}