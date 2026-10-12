import React from 'react';
import moment from 'moment';
import { Copy, ShieldCheck } from 'lucide-react';
import SectionCard from '@/components/SectionCard';
import EscrowPill from '@/components/EscrowPill';
import TxLink from '@/components/TxLink';
import { ARC_CHAIN, ESCROW_ADDRESS, formatUSDC, shortAddress } from '@/lib/arc';
import { useToast } from '@/components/ui/use-toast';

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium">{children}</span>
    </div>
  );
}

export default function EscrowPanel({ bounty }) {
  const { toast } = useToast();

  const slots = bounty.winner_slots || 1;
  const winners = bounty.winners || [];
  const share = (bounty.reward_usdc || 0) / slots;
  const paidOut = winners.reduce((total, winner) => total + (winner.share_usdc || 0), 0);
  const remaining = Math.max(0, (bounty.reward_usdc || 0) - paidOut);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(bounty.contract_address || ESCROW_ADDRESS);
    toast({ title: 'Contract address copied' });
  };

  return (
    <SectionCard
      title="Escrow"
      description="Held by the Arc escrow contract"
      bodyClassName="divide-y divide-border px-5 py-1"
    >
      <Row label="Reward">
        <span className="font-display text-sm font-semibold">
          {formatUSDC(bounty.reward_usdc)} USDC
        </span>
      </Row>
      {slots > 1 && (
        <Row label="Split">
          {slots} winners · {formatUSDC(share)} USDC each
        </Row>
      )}
      <Row label="Escrow status">
        <EscrowPill status={bounty.escrow_status} />
      </Row>
      <Row label="Network">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-tone-violet" />
          {ARC_CHAIN.name}
        </span>
      </Row>
      <Row label="Contract">
        <button
          type="button"
          onClick={copyAddress}
          className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
          title="Copy contract address"
        >
          {shortAddress(bounty.contract_address || ESCROW_ADDRESS)}
          <Copy className="h-3 w-3" />
        </button>
      </Row>
      {bounty.onchain_id && <Row label="Bounty ID">#{bounty.onchain_id}</Row>}
      <Row label="Workers started">
        <span data-testid="workers-started">{(bounty.worker_wallets || []).length}</span>
      </Row>
      <Row label="Withdrawable">
        {bounty.escrow_status === 'funded' && (bounty.worker_wallets || []).length === 0
          ? 'Yes — no one has started'
          : 'No — locked'}
      </Row>
      {winners.length > 0 && (
        <Row label="Winners paid">
          <span data-testid="winners-paid">
            {winners.length} of {slots} · {formatUSDC(paidOut)} USDC
          </span>
        </Row>
      )}
      {remaining > 0 && winners.length > 0 && slots > winners.length && (
        <Row label="Left in escrow">{formatUSDC(remaining)} USDC</Row>
      )}
      {winners.length > 0 && (
        <Row label="Winners">
          <span className="flex flex-col items-end gap-1">
            {winners.map((winner) => (
              <span key={winner.submission_id || winner.wallet} className="font-mono text-[11px]">
                {shortAddress(winner.wallet)} · {formatUSDC(winner.share_usdc)} USDC
              </span>
            ))}
          </span>
        </Row>
      )}
      <Row label="Funded tx">
        <span className="flex flex-col items-end gap-1">
          <TxLink hash={bounty.escrow_tx_hash} />
          {bounty.escrow_funded_at && (
            <span className="text-[11px] text-muted-foreground">
              {moment(bounty.escrow_funded_at).format('MMM D, YYYY · HH:mm')}
            </span>
          )}
        </span>
      </Row>
      {bounty.payout_tx_hash && (
        <Row label="Payout tx">
          <span className="flex flex-col items-end gap-1">
            <TxLink hash={bounty.payout_tx_hash} />
            {bounty.payout_at && (
              <span className="text-[11px] text-muted-foreground">
                {moment(bounty.payout_at).format('MMM D, YYYY · HH:mm')}
              </span>
            )}
          </span>
        </Row>
      )}
      {bounty.refund_tx_hash && (
        <Row label="Refund tx">
          <TxLink hash={bounty.refund_tx_hash} />
        </Row>
      )}
    </SectionCard>
  );
}