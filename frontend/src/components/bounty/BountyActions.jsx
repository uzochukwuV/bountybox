import React, { useState } from 'react';
import { Hammer, Loader2, Send, Undo2 } from 'lucide-react';
import SectionCard from '@/components/SectionCard';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import SubmitWorkDialog from '@/components/bounty/SubmitWorkDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { startWork, withdrawEscrow } from '@/lib/bountyChain';
import { formatUSDC } from '@/lib/arc';
import { useToast } from '@/components/ui/use-toast';

export default function BountyActions({ bounty, submissions, workers = [], identity, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);

  const started = (bounty.worker_wallets || []).length;
  const slots = bounty.winner_slots || 1;
  const winners = bounty.winners || [];
  const share = (bounty.reward_usdc || 0) / slots;
  const remaining = Math.max(
    0,
    (bounty.reward_usdc || 0) - winners.reduce((total, winner) => total + (winner.share_usdc || 0), 0)
  );
  const isCreator = !!identity.email && bounty.creator_email === identity.email;
  const isWorker = workers.some((worker) => worker.worker_email === identity.email);
  const pending = submissions.filter((submission) => submission.status === 'pending');

  const openForWork = bounty.status === 'open' || bounty.status === 'in_progress';
  const canStart = !isCreator && !isWorker && openForWork;
  const canSubmit =
    !isCreator &&
    isWorker &&
    ['open', 'in_progress', 'in_review'].includes(bounty.status);
  const canWithdraw = isCreator && bounty.escrow_status === 'funded' && started === 0;

  const start = async () => {
    setBusy('start');
    try {
      await startWork(bounty, identity);
      toast({
        title: 'You are on this bounty',
        description: 'Your address is on the escrow contract — submit your work when ready.',
      });
      onChanged();
    } finally {
      setBusy('');
    }
  };

  const withdraw = async () => {
    setBusy('withdraw');
    try {
      await withdrawEscrow(bounty, identity);
      toast({
        title: 'Reward withdrawn',
        description: `${formatUSDC(bounty.reward_usdc)} USDC is back in your wallet.`,
      });
      onChanged();
    } finally {
      setBusy('');
    }
  };

  let notice = '';
  if (!canStart && !canSubmit && !canWithdraw) {
    if (bounty.status === 'paid') {
      notice =
        winners.length > 1
          ? `${winners.length} winners paid — ${formatUSDC(bounty.reward_usdc)} USDC released from escrow.`
          : `${winners[0]?.name || 'A contributor'} won this bounty — ${formatUSDC(
              bounty.reward_usdc
            )} USDC was released from escrow.`;
    } else if (bounty.status === 'refunded') {
      notice = 'The creator withdrew the escrow before anyone started working.';
    } else if (isCreator && pending.length === 0) {
      notice = 'No submissions to review yet. Accept any contributor’s submission to release the reward.';
    } else if (isWorker) {
      notice = 'Your submission is in review — you are paid if the creator accepts it.';
    } else if (bounty.status === 'in_review') {
      notice =
        'Work is in review. The creator accepts one submission and releases the whole reward to that worker.';
    }
  }

  return (
    <SectionCard title="Your move" description="Actions run on the Arc escrow contract">
      {!identity.connected ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Connect a wallet to start working, submit, or withdraw escrow.
          </p>
          <ConnectWalletButton className="w-full justify-center" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {canSubmit && (
            <Button
              onClick={() => setSubmitOpen(true)}
              data-testid="open-submit"
              className="w-full gap-2 rounded-full"
            >
              <Send className="h-4 w-4" />
              Submit work
            </Button>
          )}

          {canStart && (
            <Button
              variant={canSubmit ? 'outline' : 'default'}
              onClick={start}
              disabled={!!busy}
              data-testid="start-working"
              className="w-full gap-2 rounded-full"
            >
              {busy === 'start' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Hammer className="h-4 w-4" />
              )}
              {busy === 'start' ? 'Confirming…' : 'Start working'}
            </Button>
          )}

          {isCreator && pending.length > 0 && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {pending.length} submission{pending.length > 1 ? 's' : ''} awaiting review — accept the
              one{pending.length > 1 ? 's' : ''} you want to pay
              {slots > 1 ? ` (${formatUSDC(share)} USDC per winner)` : ''}.
            </p>
          )}

          {isCreator && slots > 1 && winners.length > 0 && winners.length < slots && (
            <p
              className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
              data-testid="pot-progress"
            >
              {winners.length} of {slots} winner slots filled — {formatUSDC(remaining)} USDC is still
              in escrow for the remaining slot{slots - winners.length > 1 ? 's' : ''}.
            </p>
          )}

          {canWithdraw && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  data-testid="withdraw-escrow"
                  className="w-full gap-2 rounded-full"
                >
                  {busy === 'withdraw' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                  Withdraw reward
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-heading">
                    Withdraw {formatUSDC(bounty.reward_usdc)} USDC?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    No one has started working on this bounty, so the escrow is still yours to
                    withdraw. This closes the bounty and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it open</AlertDialogCancel>
                  <AlertDialogAction onClick={withdraw}>Confirm withdrawal</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {notice && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {notice}
            </p>
          )}

          {(canWithdraw || (isCreator && started > 0)) && (
            <p className="rounded-lg bg-accent/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {canWithdraw
                ? 'Withdrawable until the first contributor starts working.'
                : `${started} contributor${started > 1 ? 's' : ''} started, so the escrow is locked until you accept a submission.`}
            </p>
          )}

          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            Simulated on Arc Testnet — no real funds move.
          </p>
        </div>
      )}

      <SubmitWorkDialog
        bounty={bounty}
        identity={identity}
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onDone={onChanged}
      />
    </SectionCard>
  );
}