import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { BarChart3, LayoutGrid, Plus, X } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { ARC_CHAIN, formatUSDC, shortAddress } from '@/lib/arc';
import { useIdentity } from '@/lib/useIdentity';
import InitialsAvatar from '@/components/InitialsAvatar';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import { cn } from '@/lib/utils';

const DISCOVER = [
  { to: '/', label: 'Bounties', icon: LayoutGrid, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
];

function NavItem({ to, label, icon: Icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }) {
  const identity = useIdentity();
  const { logout } = usePrivy();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        data-testid="sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 transition-transform duration-300 lg:sticky lg:top-14 lg:z-10 lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:shrink-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between lg:hidden">
          <span className="font-heading text-sm font-semibold">Menu</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-3 rounded-xl px-2 py-2 lg:mt-0">
          <InitialsAvatar name={identity.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{identity.name}</p>
            <p className="truncate text-xs text-muted-foreground">{identity.email || 'Signed in'}</p>
          </div>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-1">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Discover
          </p>
          {DISCOVER.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onClose} />
          ))}

          <p className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Create
          </p>
          <Link
            to="/new"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <Plus className="h-4 w-4" />
            Post a bounty
          </Link>
        </nav>

        <div className="mt-4 rounded-xl border border-sidebar-border bg-card/70 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-tone-violet" />
              {ARC_CHAIN.name}
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              Demo
            </span>
          </div>

          {identity.connected ? (
            <>
              <p className="mt-2.5 font-display text-lg font-semibold">
                {formatUSDC(identity.balance)} <span className="text-xs font-medium text-muted-foreground">USDC</span>
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {shortAddress(identity.walletAddress)}
              </p>
              <button
                type="button"
                onClick={() => logout()}
                className="mt-2.5 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Connect a wallet to fund escrow and get paid.
              </p>
              <ConnectWalletButton className="mt-3 w-full justify-center" />
            </>
          )}
        </div>
      </aside>
    </>
  );
}