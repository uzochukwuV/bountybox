import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import ConnectWalletButton from '@/components/ConnectWalletButton';

export default function Topbar({ onToggleNav }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <button
        type="button"
        onClick={onToggleNav}
        aria-label="Open menu"
        data-testid="nav-toggle"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <Link to="/" className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground">
          B
        </span>
        <span className="font-display text-sm font-semibold tracking-tight sm:text-base">
          Bounty Box
        </span>
      </Link>

      <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-tone-violet" />
        Arc Testnet
      </span>

      <div className="ml-auto flex items-center gap-2">
        <ConnectWalletButton />
        <Link
          to="/new"
          data-testid="new-bounty"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New bounty
        </Link>
      </div>
    </header>
  );
}