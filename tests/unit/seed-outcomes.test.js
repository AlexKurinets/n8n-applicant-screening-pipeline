'use strict';
// Pins the synthetic week the README and dashboard describe. If the seed, the
// pre-filter, the stand-in model or the scoring changes, these numbers move
// and this test says so. The e2e suite checks the live stack against the same
// expectations, application by application.
const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedOutcomes, summarize } = require('../../scripts/expected-outcomes');
const { generateApplications, REQUISITIONS } = require('../../scripts/seed-data');

test('the seed is deterministic', () => {
  assert.deepEqual(generateApplications(), generateApplications());
  assert.equal(generateApplications().length, 160);
  assert.equal(REQUISITIONS.length, 6);
});

test('synthetic data stays synthetic: example.com emails and 555-01xx phone numbers', () => {
  for (const a of generateApplications()) {
    assert.match(a.candidate.email, /@example\.com$/);
    assert.match(a.candidate.phone, /^555-01\d\d$/);
  }
});

test('the seeded week produces the documented outcome mix', async () => {
  const s = summarize(await expectedOutcomes());
  assert.deepEqual(s.outcomes, {
    'Screened out': 64,
    Shortlisted: 34,
    'Recruiter review': 30,
    'Low match': 18,
    Incomplete: 8,
    'Manual review': 4,
    'dead letter': 2,
  });
  assert.equal(s.screened_out_share, 0.4);
  assert.equal(s.scored, 82);
  assert.equal(s.with_ungrounded_quote, 19);
  assert.deepEqual(s.faults, { transient_503: 6, session_expiry: 6 });
});
