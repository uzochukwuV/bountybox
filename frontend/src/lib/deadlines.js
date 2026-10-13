// Deadline handling shared by the bounty form and the escrow write path.
//
// createBounty requires `applicationDeadline >= block.timestamp` and
// `submissionDeadline > applicationDeadline`; anything else reverts with
// InvalidDeadlines. The UI collects plain dates ("YYYY-MM-DD"), so both layers
// convert with the same rule (end of that day, UTC) and enforce the same
// ordering before a transaction is built.

/** A date input becomes the end of that day, UTC. Returns null if unparseable. */
export function toUnixSeconds(dateString) {
  if (!dateString) return null;
  const end = Date.parse(`${dateString}T23:59:59Z`);
  return Number.isFinite(end) ? Math.floor(end / 1000) : null;
}

/**
 * Returns a human message when the dates are missing or would fail the
 * contract's ordering check, or '' when they are usable.
 */
export function validateDeadlines(
  { due_date, submission_deadline },
  nowSec = Math.floor(Date.now() / 1000)
) {
  const application = toUnixSeconds(due_date);
  const submission = toUnixSeconds(submission_deadline);
  if (application === null || submission === null) {
    return 'Set a due date and a submissions-close date.';
  }
  if (application <= nowSec) return 'The due date must be in the future.';
  if (submission <= application) return 'Submissions must close after the due date.';
  return '';
}

/**
 * Converts the draft's dates to the unix seconds createBounty expects. Throws on
 * invalid dates so a caller that skipped the form cannot send a reverting tx.
 */
export function resolveDeadlines(draft, nowSec) {
  const problem = validateDeadlines(draft, nowSec);
  if (problem) throw new Error(problem);
  return {
    applicationDeadline: toUnixSeconds(draft.due_date),
    submissionDeadline: toUnixSeconds(draft.submission_deadline),
  };
}
