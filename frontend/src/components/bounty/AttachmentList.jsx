import { db } from '@/api/db';

import React, { useState } from 'react';
import { FileText, Loader2, Paperclip } from 'lucide-react';

export default function AttachmentList({ attachments = [] }) {
  const [busy, setBusy] = useState(null);

  if (!attachments.length) return null;

  const open = async (attachment) => {
    setBusy(attachment.name);
    try {
      const { signed_url } = await db.integrations.Core.CreateFileSignedUrl({
        file_uri: attachment.file_uri,
      });
      window.open(signed_url, '_blank');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="flex flex-wrap gap-2" data-testid="attachments">
      {attachments.map((attachment) => (
        <li key={attachment.file_uri || attachment.name}>
          <button
            type="button"
            onClick={() => open(attachment)}
            className="inline-flex max-w-[16rem] items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium transition hover:border-primary/40 hover:text-primary"
          >
            {busy === attachment.name ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span className="truncate">{attachment.name}</span>
            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}