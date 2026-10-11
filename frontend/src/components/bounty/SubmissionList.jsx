import React from 'react';
import moment from 'moment';
import { Check, Loader2, X } from 'lucide-react';
import StatusPill from '@/components/StatusPill';
import InitialsAvatar from '@/components/InitialsAvatar';
import AttachmentList from '@/components/bounty/AttachmentList';
import TxLink from '@/components/TxLink';
import { Button } from '@/components/ui/button';
import { formatUSDC } from '@/lib/arc';

export default function SubmissionList({
  submissions,
  canReview,
  busyId,
  onAccept,
  onReject,
  share = 0,
}) {
  if (!submissions.length) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
        No work submitted yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="submission-list">
      {submissions.map((submission) => (
        <li key={submission.id} className="rounded-xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <InitialsAvatar name={submission.worker_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{submission.worker_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {moment(submission.created_date).fromNow()}
                </p>
              </div>
            </div>
            <StatusPill status={submission.status} kind="submission" />
          </div>

          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {submission.content}
          </p>

          {submission.attachments?.length > 0 && (
            <div className="mt-3">
              <AttachmentList attachments={submission.attachments} />
            </div>
          )}

          {submission.review_note && (
            <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
              {submission.review_note}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Reference
              <TxLink hash={submission.commit_hash} />
            </span>

            {canReview && submission.status === 'pending' && (
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === submission.id}
                  onClick={() => onReject(submission)}
                  className="h-8 gap-1.5 rounded-full text-xs"
                >
                  {busyId === submission.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Request changes
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === submission.id}
                  onClick={() => onAccept(submission)}
                  data-testid={`accept-${submission.id}`}
                  className="h-8 gap-1.5 rounded-full text-xs"
                >
                  {busyId === submission.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {`Accept & release ${formatUSDC(share)} USDC`}
                </Button>
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}