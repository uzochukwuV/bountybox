import { db } from '@/api/db';

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { Coins, FileStack, Lock, Target, Wallet } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import SectionCard from '@/components/SectionCard';
import StatCard from '@/components/StatCard';
import StatusPill from '@/components/StatusPill';
import EmptyState from '@/components/EmptyState';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import { Button } from '@/components/ui/button';
import { useIdentity } from '@/lib/useIdentity';
import { ARC_CHAIN, FAUCET_URL, formatUSDC, shortAddress } from '@/lib/arc';
import { usePrivy } from '@privy-io/react-auth';

export default function Dashboard() {
  const identity = useIdentity();
  const { logout } = usePrivy();
  const [posted, setPosted] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({ posted: 0, active: 0, locked: 0, earned: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!identity.email) return;
    setLoading(true);

    const [postedPage, submissionsPage, postedCount, activeCount, lockedAgg, earnedAgg] =
      await Promise.all([
        db.entities.Bounty.filter(
          { creator_email: identity.email },
          { sort: '-created_date', limit: 20 }
        ),
        db.entities.Submission.filter(
          { worker_email: identity.email },
          { sort: '-created_date', limit: 20 }
        ),
        db.entities.Bounty.count({ creator_email: identity.email }),
        db.entities.BountyWorker.count({
          worker_email: identity.email,
          status: 'working',
        }),
        db.entities.Bounty.aggregate({
          query: { creator_email: identity.email, escrow_status: 'funded' },
          sum: ['reward_usdc'],
        }),
        db.entities.BountyWorker.aggregate({
          query: { worker_email: identity.email, status: 'won' },
          sum: ['share_usdc'],
        }),
      ]);

    setPosted(postedPage.items || []);
    setSubmissions(submissionsPage.items || []);
    setStats({
      posted: postedCount,
      active: activeCount,
      locked: lockedAgg?.rows?.[0]?.sum_reward_usdc || 0,
      earned: earnedAgg?.rows?.[0]?.sum_share_usdc || 0,
    });
    setLoading(false);
  }, [identity.email]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Your escrow, your hunts, and what is waiting on you"
        actions={
          <Button asChild className="rounded-full">
            <Link to="/new">Post a bounty</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Posted" value={stats.posted} hint="Bounties you funded" icon={FileStack} />
        <StatCard
          label="In escrow"
          value={`${formatUSDC(stats.locked)}`}
          hint="USDC locked for open work"
          icon={Lock}
        />
        <StatCard label="Active hunts" value={stats.active} hint="Bounties you started" icon={Target} />
        <StatCard
          label="Earned"
          value={`${formatUSDC(stats.earned)}`}
          hint="Winner shares released"
          icon={Coins}
        />
      </div>

      <SectionCard
        title="Wallet"
        description={identity.connected ? 'Connected to the demo wallet session' : 'Not connected yet'}
        bodyClassName="space-y-4 p-5"
      >
        {identity.connected ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-3xl font-semibold">
                  {formatUSDC(identity.balance)}{' '}
                  <span className="text-sm font-medium text-muted-foreground">USDC</span>
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {identity.walletAddress}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {ARC_CHAIN.name} · chain {ARC_CHAIN.chainId}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-full border border-border px-3 text-xs font-medium transition hover:border-primary/40 hover:text-primary"
                >
                  Get test USDC
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout()}
                  className="rounded-full text-muted-foreground"
                >
                  Sign out
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connect a wallet to fund bounties, claim work, and receive payouts. The session is
              simulated with a test balance.
            </p>
            <ConnectWalletButton />
          </>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Bounties I posted"
          description={identity.email ? `Funded by ${identity.email}` : undefined}
          bodyClassName="p-0"
        >
          {loading ? (
            <div className="space-y-2 p-5">
              <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
              <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
            </div>
          ) : posted.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Wallet}
                title="No bounties yet"
                description="Post your first bounty and the USDC reward is locked in escrow until you accept the work."
                action={
                  <Button asChild className="rounded-full">
                    <Link to="/new">Post a bounty</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border" data-testid="posted-list">
              {posted.map((bounty) => (
                <li key={bounty.id}>
                  <Link
                    to={`/bounty/${bounty.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{bounty.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {formatUSDC(bounty.reward_usdc)} USDC · {moment(bounty.created_date).fromNow()}
                      </span>
                    </span>
                    <StatusPill status={bounty.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Work I submitted" bodyClassName="p-0">
          {loading ? (
            <div className="space-y-2 p-5">
              <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
              <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Target}
                title="Nothing submitted yet"
                description="Claim a bounty from the board, submit your work, and your payout lands here once the creator accepts."
                action={
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to="/">Browse bounties</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border" data-testid="submissions-list">
              {submissions.map((submission) => (
                <li key={submission.id}>
                  <Link
                    to={`/bounty/${submission.bounty_id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {submission.bounty_title}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                        {shortAddress(submission.commit_hash)}
                      </span>
                    </span>
                    <StatusPill status={submission.status} kind="submission" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}