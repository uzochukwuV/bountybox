import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Check, Copy, Wallet } from 'lucide-react';
import { shortAddress } from '@/lib/arc';
import { useWallet } from '@/lib/useWallet';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for contexts without the async clipboard API.
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

export default function ConnectWalletButton({ className }) {
  const { login } = usePrivy();
  const { address, connected } = useWallet();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (connected) {
    const copyAddress = async () => {
      try {
        await copyText(address);
        setCopied(true);
        toast({ title: 'Address copied', description: address });
        setTimeout(() => setCopied(false), 1500);
      } catch {
        toast({ title: 'Could not copy', description: 'Copy the address manually.', variant: 'destructive' });
      }
    };

    return (
      <span className={cn('inline-flex h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium', className)}>
        <Link
          to="/dashboard"
          data-testid="wallet-chip"
          className="flex items-center gap-2 transition hover:text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-tone-green" />
          <span className="font-mono">{shortAddress(address)}</span>
        </Link>
        <button
          type="button"
          onClick={copyAddress}
          aria-label="Copy wallet address"
          title="Copy wallet address"
          data-testid="copy-address"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="connect-wallet"
      onClick={login}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70',
        className
      )}
    >
      <Wallet className="h-3.5 w-3.5" />
      Connect wallet
    </button>
  );
}