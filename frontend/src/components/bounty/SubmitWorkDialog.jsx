import { db } from '@/api/db';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { submitWork } from '@/lib/bountyChain';
import { useToast } from '@/components/ui/use-toast';

export default function SubmitWorkDialog({ bounty, identity, open, onOpenChange, onDone }) {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const attachments = [];
      for (const file of files) {
        const { file_uri } = await db.integrations.Core.UploadPrivateFile({ file });
        attachments.push({ name: file.name, file_uri });
      }

      await submitWork(bounty, identity, { content, attachments });

      setContent('');
      setFiles([]);
      onOpenChange(false);
      toast({
        title: 'Submission recorded onchain',
        description: 'The creator has been notified to review your work.',
      });
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Submit your work</DialogTitle>
          <DialogDescription>
            Your submission hash is recorded onchain. Attachments stay offchain, private to the creator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Describe what you delivered, where the work lives, and anything the reviewer should know…"
            data-testid="submission-content"
            className="min-h-[8rem] text-sm"
          />

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="submission-files">
              Attachments
            </label>
            <input
              id="submission-files"
              type="file"
              multiple
              data-testid="submission-files"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="mt-1.5 block w-full cursor-pointer rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
            />
            {files.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {files.length} file{files.length > 1 ? 's' : ''} ready to upload
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || content.trim().length < 10}
            data-testid="submit-work"
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Recording onchain…' : 'Submit work'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}