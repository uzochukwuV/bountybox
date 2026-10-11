import React from 'react';
import BountyCard from '@/components/bounty/BountyCard';

export default function BountyGrid({ bounties }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="bounty-grid">
      {bounties.map((bounty) => (
        <BountyCard key={bounty.id} bounty={bounty} />
      ))}
    </div>
  );
}