'use strict';
// Code node "Summarize run".
// Collects what happened on this run into one JSON document for the ledger.
// "Complete run" stores it with a single parameter, which keeps the SQL short
// and avoids positional-parameter mistakes when a field is null.

function run(items, ctx) {
  const claim = ctx.node('Claim run');
  const pre = ctx.node('Pre-filter');
  const decision = ctx.node('Decide status');
  const scored = ctx.executed('Validate and score') ? ctx.node('Validate and score') : null;
  const sentNow = ctx.executed('Record submittal');

  let submittal = null;
  if (decision.needs_submittal) {
    submittal = sentNow
      ? { document_name: ctx.node('Build submittal').document_name, message_id: ctx.node('Record submittal').message_id, sent: true }
      : { sent: false, note: 'already sent on an earlier run' };
  }

  const summary = {
    outcome: decision.status,
    reason: decision.reason,
    note: decision.note,
    requisition_id: decision.requisition_id,
    score: scored && scored.screening ? scored.screening.score : null,
    band: scored && scored.screening ? scored.screening.band : null,
    status_written: ctx.executed('Confirm status write'),
    portal_status_before: decision.portal_status,
    relogged: ctx.node('Normalize application').relogged,
    content_hash: pre.content_hash,
    resume_chars: pre.resume_chars,
    prefilter: pre.prefilter,
    screening: scored ? scored.screening : null,
    usage: scored ? scored.usage : null,
    submittal,
  };
  return [{ json: { run_id: claim.run_id, summary } }];
}

module.exports = { run };
