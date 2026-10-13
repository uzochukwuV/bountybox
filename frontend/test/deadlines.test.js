import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDeadlines, toUnixSeconds, validateDeadlines } from '../src/lib/deadlines.js';

// Fixed "now": 2026-01-10T00:00:00Z, so the fixtures are deterministic.
const NOW = Math.floor(Date.parse('2026-01-10T00:00:00Z') / 1000);

describe('toUnixSeconds', () => {
  it('maps a date to the end of that day, UTC', () => {
    assert.equal(toUnixSeconds('2026-01-15'), Math.floor(Date.parse('2026-01-15T23:59:59Z') / 1000));
  });

  it('returns null for missing or unparseable input', () => {
    assert.equal(toUnixSeconds(''), null);
    assert.equal(toUnixSeconds(undefined), null);
    assert.equal(toUnixSeconds('not-a-date'), null);
  });
});

describe('validateDeadlines', () => {
  it('accepts a due date in the future with submissions closing after it', () => {
    assert.equal(
      validateDeadlines({ due_date: '2026-02-01', submission_deadline: '2026-02-08' }, NOW),
      ''
    );
  });

  it('accepts the due date of today (end of day is still in the future)', () => {
    assert.equal(
      validateDeadlines({ due_date: '2026-01-10', submission_deadline: '2026-01-11' }, NOW),
      ''
    );
  });

  it('requires both dates', () => {
    assert.match(validateDeadlines({ due_date: '', submission_deadline: '' }, NOW), /Set a due date/);
    assert.match(validateDeadlines({ due_date: '2026-02-01' }, NOW), /Set a due date/);
  });

  it('rejects a due date in the past', () => {
    assert.match(
      validateDeadlines({ due_date: '2026-01-01', submission_deadline: '2026-01-05' }, NOW),
      /in the future/
    );
  });

  it('rejects submissions that close on or before the due date', () => {
    assert.match(
      validateDeadlines({ due_date: '2026-02-01', submission_deadline: '2026-02-01' }, NOW),
      /close after the due date/
    );
    assert.match(
      validateDeadlines({ due_date: '2026-02-01', submission_deadline: '2026-01-20' }, NOW),
      /close after the due date/
    );
  });
});

describe('resolveDeadlines', () => {
  it('converts a valid draft to unix seconds', () => {
    const { applicationDeadline, submissionDeadline } = resolveDeadlines(
      { due_date: '2026-02-01', submission_deadline: '2026-02-08' },
      NOW
    );
    assert.equal(applicationDeadline, Math.floor(Date.parse('2026-02-01T23:59:59Z') / 1000));
    assert.equal(submissionDeadline, Math.floor(Date.parse('2026-02-08T23:59:59Z') / 1000));
    assert.ok(submissionDeadline > applicationDeadline);
  });

  it('throws instead of clamping when the ordering is invalid', () => {
    assert.throws(
      () => resolveDeadlines({ due_date: '2026-02-08', submission_deadline: '2026-02-01' }, NOW),
      /close after the due date/
    );
  });
});
