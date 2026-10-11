import { db } from '@/api/db';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import BoardToolbar from '@/components/bounty/BoardToolbar';
import BountyBoard from '@/components/bounty/BountyBoard';
import BountyGrid from '@/components/bounty/BountyGrid';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { formatUSDC } from '@/lib/arc';

const LAYOUT_KEY = 'bb.layout';
const DEFAULTS = {
  search: '',
  category: 'all',
  status: 'all',
  sort: '-created_date',
  complexity: 'all',
};

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="w-[17.5rem] shrink-0 space-y-3 rounded-2xl border border-border bg-muted/40 p-3">
          <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
          {[0, 1, 2].map((card) => (
            <div key={card} className="h-28 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [filters, setFilters] = useState(DEFAULTS);
  const [layout, setLayout] = useState(() => localStorage.getItem(LAYOUT_KEY) || 'board');
  const [bounties, setBounties] = useState([]);
  const [count, setCount] = useState(0);
  const [escrowed, setEscrowed] = useState(0);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const next = {};
    if (filters.status === 'closed') next.status = { $in: ['refunded', 'cancelled'] };
    else if (filters.status !== 'all') next.status = filters.status;
    if (filters.category !== 'all') next.category = filters.category;
    if (filters.complexity !== 'all') next.complexity = filters.complexity;

    const term = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '');
    if (term) next.title = { $regex: term, $options: 'i' };

    return next;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    const [page, total, escrow] = await Promise.all([
      db.entities.Bounty.filter(query, { sort: filters.sort, limit: 100 }),
      db.entities.Bounty.count(query),
      db.entities.Bounty.aggregate({
        query: { status: { $in: ['open', 'in_progress', 'in_review'] } },
        sum: ['reward_usdc'],
      }),
    ]);
    setBounties(page.items || []);
    setCount(total);
    setEscrowed(escrow?.rows?.[0]?.sum_reward_usdc || 0);
    setLoading(false);
  }, [query, filters.sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULTS);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bounties"
        subtitle={`${count} matching · ${formatUSDC(escrowed)} USDC locked in escrow`}
        actions={
          <Button asChild className="gap-2 rounded-full">
            <Link to="/new">
              <Plus className="h-4 w-4" />
              New bounty
            </Link>
          </Button>
        }
      />

      <BoardToolbar
        value={filters}
        onChange={setFilters}
        layout={layout}
        onLayoutChange={setLayout}
        count={count}
        dirty={dirty}
        onReset={() => setFilters(DEFAULTS)}
      />

      {loading ? (
        <BoardSkeleton />
      ) : bounties.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No bounties match those filters"
          description="Try a different category, clear your search, or post the work you need done."
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setFilters(DEFAULTS)}>
                Reset filters
              </Button>
              <Button asChild className="rounded-full">
                <Link to="/new">Post a bounty</Link>
              </Button>
            </div>
          }
        />
      ) : layout === 'board' ? (
        <BountyBoard bounties={bounties} focus={filters.status} />
      ) : (
        <BountyGrid bounties={bounties} />
      )}
    </div>
  );
}