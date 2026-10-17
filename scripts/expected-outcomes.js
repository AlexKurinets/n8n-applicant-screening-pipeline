#!/usr/bin/env node
'use strict';
// Predicts what the live stack should produce for the seeded applications,
// using the same Code node modules and the offline stand-in model. The e2e
// test compares the n8n run ledger against this, application by application.
//
//   node scripts/expected-outcomes.js          summary table
//   node scripts/expected-outcomes.js --json   one line per application
const { REQUISITIONS, generateApplications } = require('./seed-data');
const { screenOffline, toApplicationV1, toRequisitionV1 } = require('./pipeline-harness');
const { resumePdf } = require('./pdf');
const { extractText } = require('../services/docsvc/documents');

// The live stack scores the text extracted from the resume PDF, so this does
// the same round trip instead of using the seed's source text directly.
async function expectedOutcomes() {
  const reqs = new Map(REQUISITIONS.map((r) => [r.id, r]));
  const rows = [];
  for (const app of generateApplications()) {
    rows.push(await expectedFor(app, reqs));
  }
  return rows;
}

async function expectedFor(app, reqs) {
  if (app.fault === 'layout_v2') {
    return { application_id: app.id, requisition_id: app.requisition_id, kind: app.kind, outcome: 'dead letter', error_code: 'PORTAL_LAYOUT_CHANGED', score: null };
  }
  const req = reqs.get(app.requisition_id);
  const extracted = app.scanned ? '' : (await extractText(await resumePdf(app.resume_text))).text;
  const { decision, outputs } = screenOffline({
    application: toApplicationV1(app, req),
    requisition: toRequisitionV1(req),
    extractedText: extracted,
  });
  const scored = outputs['Validate and score'];
  return {
    application_id: app.id,
    requisition_id: app.requisition_id,
    kind: app.kind,
    outcome: decision.status,
    reason: decision.reason,
    score: scored && scored.screening ? scored.screening.score : null,
    ungrounded: scored && scored.screening ? scored.screening.ungrounded : 0,
    fault: app.fault,
  };
}

function summarize(rows) {
  const count = (pred) => rows.filter(pred).length;
  const outcomes = {};
  for (const r of rows) outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
  return {
    applications: rows.length,
    outcomes,
    screened_out_share: count((r) => r.outcome === 'Screened out') / rows.length,
    scored: count((r) => r.score !== null),
    with_ungrounded_quote: count((r) => r.ungrounded > 0),
    faults: {
      transient_503: count((r) => r.fault === 'transient_503'),
      session_expiry: count((r) => r.fault === 'session_expiry'),
    },
  };
}

if (require.main === module) {
  expectedOutcomes().then((rows) => {
    if (process.argv.includes('--json')) rows.forEach((r) => console.log(JSON.stringify(r)));
    else console.log(JSON.stringify(summarize(rows), null, 2));
  });
}

module.exports = { expectedOutcomes, summarize };
