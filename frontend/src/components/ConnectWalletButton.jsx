import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Wallet } from 'lucide-react';
import { connectWallet, shortAddress } from '@/lib/arc';
import { useWallet } from '@/lib/useWallet';
import { cn } from '@/lib/utils';

export default function ConnectWalletButton({ className }) {
  const { wallet, connected } = useWallet();
  const [busy, setBusy] = useState(false);

  if (connected) {
    return (
      <Link
        to="/dashboard"
        data-testid="wallet-chip"
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-medium transition hover:border-primary/40 hover:text-primary',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-tone-green" />
        <span className="font-mono">{shortAddress(wallet.address)}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid="connect-wallet"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await connectWallet();
        setBusy(false);
      }}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70',
        className
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
      {busy ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}