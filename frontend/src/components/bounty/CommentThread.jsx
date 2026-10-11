import { db } from '@/api/db';

import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { Loader2, Send } from 'lucide-react';

import { postComment } from '@/lib/bountyChain';
import InitialsAvatar from '@/components/InitialsAvatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function CommentThread({ bounty, identity, onPosted }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let active = true;
    db.entities.BountyComment.filter(
      { bounty_id: bounty.id },
      { sort: 'created_date', limit: 50 }
    )
      .then((page) => {
        if (active) setComments(page.items || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bounty.id]);

  const submit = async () => {
    setPosting(true);
    try {
      const comment = await postComment(bounty, identity, body.trim());
      setComments((previous) => [...previous, comment]);
      setBody('');
      onPosted();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading discussion…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No comments yet — ask the creator anything about the work.
        </p>
      ) : (
        <ul className="space-y-4" data-testid="comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <InitialsAvatar name={comment.author_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{comment.author_name}</span>
                  <span className="text-muted-foreground">{moment(comment.created_date).fromNow()}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment…"
          data-testid="comment-input"
          className="min-h-[4.5rem] text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={posting || body.trim().length < 2}
            data-testid="post-comment"
            className="gap-2 rounded-full"
          >
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}