import { db } from '@/api/db';

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';

import PageHeader from '@/components/PageHeader';
import SectionCard from '@/components/SectionCard';
import ConnectWalletButton from '@/components/ConnectWalletButton';
import TxOverlay from '@/components/TxOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIdentity } from '@/lib/useIdentity';
import { FAUCET_URL, formatUSDC } from '@/lib/arc';
import { fundEscrowAndPublish } from '@/lib/bountyChain';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = [
  'Design',
  'Engineering',
  'Content',
  'Research',
  'Data',
  'Ops',
  'Community',
  'Security',
];

const SIZES = [
  { value: 'quick', label: 'Quick win — under an hour' },
  { value: 'standard', label: 'Standard — about a day' },
  { value: 'deep', label: 'Deep work — multi-day' },
];

const WINNERS = [1, 2, 3, 4, 5].map((count) => ({
  value: String(count),
  label: count === 1 ? 'Single winner' : `${count} winners split the pot`,
}));

const EMPTY = {
  title: '',
  description: '',
  category: 'Engineering',
  complexity: 'standard',
  winner_slots: '1',
  tags: '',
  reward_usdc: '',
  due_date: '',
  submission_deadline: '',
};

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[14rem] text-right text-xs font-medium">{value || '—'}</span>
    </div>
  );
}

export default function NewBounty() {
  const navigate = useNavigate();
  const identity = useIdentity();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [publishing, setPublishing] = useState(false);

  const set = (patch) => setForm((previous) => ({ ...previous, ...patch }));
  const reward = Number(form.reward_usdc) || 0;
  const slots = Number(form.winner_slots) || 1;

  const errors = {
    title: form.title.trim().length < 8 ? 'Give the bounty a clear title (at least 8 characters).' : '',
    description:
      form.description.trim().length < 30
        ? 'Describe the deliverable in at least 30 characters.'
        : '',
    reward: reward <= 0 ? 'Set a USDC reward above 0.' : '',
  };
  const stepOneValid = !errors.title && !errors.description && !errors.reward;

  const balance = identity.balance;
  const shortfall = Math.max(0, reward - balance);
  const canFund = identity.connected && reward > 0 && shortfall === 0;

  const publish = async () => {
    setPublishing(true);
    try {
      const attachments = [];
      for (const file of files) {
        const { file_uri } = await db.integrations.Core.UploadPrivateFile({ file });
        attachments.push({ name: file.name, file_uri });
      }

      const bounty = await fundEscrowAndPublish({
        draft: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          complexity: form.complexity,
          tags: form.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          reward_usdc: reward,
          winner_slots: slots,
          ...(form.due_date ? { due_date: form.due_date } : {}),
          ...(form.submission_deadline ? { submission_deadline: form.submission_deadline } : {}),
          attachments,
        },
        identity,
      });

      toast({
        title: 'Bounty is live on Arc',
        description: `${formatUSDC(reward)} USDC locked in escrow.`,
      });
      navigate(`/bounty/${bounty.id}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <TxOverlay open={publishing} label="Funding escrow on Arc…" />

      <button
        type="button"
        onClick={() => (step === 2 ? setStep(1) : navigate('/'))}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {step === 2 ? 'Back to details' : 'All bounties'}
      </button>

      <PageHeader
        title="Post a bounty"
        subtitle="Describe the work, lock the reward in escrow, then let contributors claim it."
      />

      <div className="flex items-center gap-3">
        {[1, 2].map((index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className={
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ' +
                (step >= index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
              }
            >
              {index}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {index === 1 ? 'Details' : 'Fund escrow'}
            </span>
            {index === 1 && <span className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {step === 1 ? (
            <SectionCard title="Bounty details" description="Everything here stays offchain">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) => set({ title: event.target.value })}
                    placeholder="e.g. Audit our escrow contract for reentrancy"
                    data-testid="bounty-title"
                  />
                  {form.title.length > 0 && errors.title && (
                    <p className="text-[11px] text-destructive">{errors.title}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Scope and deliverable</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(event) => set({ description: event.target.value })}
                    placeholder="What exactly should be delivered, in what format, and how will it be judged?"
                    data-testid="bounty-description"
                    className="min-h-[8rem] text-sm"
                  />
                  {form.description.length > 0 && errors.description && (
                    <p className="text-[11px] text-destructive">{errors.description}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(next) => set({ category: next })}>
                      <SelectTrigger data-testid="bounty-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Work size</Label>
                    <Select value={form.complexity} onValueChange={(next) => set({ complexity: next })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIZES.map((size) => (
                          <SelectItem key={size.value} value={size.value}>
                            {size.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    value={form.tags}
                    onChange={(event) => set({ tags: event.target.value })}
                    placeholder="Comma separated, e.g. solidity, audit"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reward">Reward (USDC)</Label>
                    <Input
                      id="reward"
                      type="number"
                      min="1"
                      value={form.reward_usdc}
                      onChange={(event) => set({ reward_usdc: event.target.value })}
                      placeholder="250"
                      data-testid="bounty-reward"
                    />
                    {slots > 1 && reward > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {formatUSDC(reward / slots)} USDC per winner
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Winners</Label>
                    <Select
                      value={form.winner_slots}
                      onValueChange={(next) => set({ winner_slots: next })}
                    >
                      <SelectTrigger data-testid="bounty-winners">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WINNERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="due">Due date</Label>
                    <Input
                      id="due"
                      type="date"
                      value={form.due_date}
                      onChange={(event) => set({ due_date: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deadline">Submissions close</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={form.submission_deadline}
                      onChange={(event) => set({ submission_deadline: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="brief">Brief and assets</Label>
                  <input
                    id="brief"
                    type="file"
                    multiple
                    onChange={(event) => setFiles(Array.from(event.target.files || []))}
                    className="block w-full cursor-pointer rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                  />
                  {files.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {files.length} file{files.length > 1 ? 's' : ''} will be attached to the brief
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!stepOneValid}
                    data-testid="continue-to-fund"
                    className="rounded-full"
                  >
                    Continue to escrow
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              title="Fund the escrow"
              description="The reward is locked in the Arc escrow contract until you accept submissions"
            >
              <div className="space-y-5">
                <div className="divide-y divide-border rounded-xl border border-border px-4">
                  <SummaryRow label="Title" value={form.title} />
                  <SummaryRow label="Category" value={form.category} />
                  <SummaryRow
                    label="Work size"
                    value={SIZES.find((size) => size.value === form.complexity)?.label}
                  />
                  <SummaryRow label="Reward locked" value={`${formatUSDC(reward)} USDC`} />
                  <SummaryRow
                    label="Winners"
                    value={
                      slots === 1
                        ? 'Single winner'
                        : `${slots} winners · ${formatUSDC(reward / slots)} USDC each`
                    }
                  />
                  <SummaryRow label="Network fee" value="Sponsored by Arc (demo)" />
                </div>

                {!identity.connected ? (
                  <div className="space-y-3 rounded-xl bg-muted/60 p-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Connect a wallet to fund the escrow and publish this bounty.
                    </p>
                    <ConnectWalletButton className="w-full justify-center" />
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl bg-muted/60 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Wallet balance</span>
                      <span className="font-medium">{formatUSDC(balance)} USDC</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">After funding</span>
                      <span className="font-medium">{formatUSDC(balance - reward)} USDC</span>
                    </div>
                    {shortfall > 0 && (
                      <div className="space-y-2 border-t border-border pt-3">
                        <p className="text-[11px] text-tone-red">
                          You need {formatUSDC(shortfall)} more USDC to fund this bounty.
                        </p>
                        <a
                          href={FAUCET_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium transition hover:border-primary/40 hover:text-primary"
                        >
                          Get test USDC from the faucet
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={publish}
                  disabled={!canFund || publishing}
                  data-testid="fund-escrow"
                  className="w-full gap-2 rounded-full"
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {publishing
                    ? 'Funding escrow…'
                    : `Fund ${formatUSDC(reward)} USDC & publish`}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Simulated on Arc Testnet — no real funds move.
                </p>
              </div>
            </SectionCard>
          )}
        </div>

        <SectionCard title="How escrow works" description="Small contract, clear rules">
          <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1. You fund.</span> The USDC reward is
              locked in the escrow contract when the bounty is published.
            </li>
            <li>
              <span className="font-semibold text-foreground">2. A contributor claims.</span> Their
              wallet is assigned as the payout address.
            </li>
            <li>
              <span className="font-semibold text-foreground">3. They submit.</span> The submission
              reference hash is recorded onchain; the work itself stays offchain.
            </li>
            <li>
              <span className="font-semibold text-foreground">4. You accept.</span> Each accepted
              submission releases its share of the pot to that worker’s address — with several
              winners the pot splits evenly until every slot is filled.
            </li>
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}