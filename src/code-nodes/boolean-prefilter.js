'use strict';
// Code node "Pre-filter".
// Deterministic gates before any model call, in this order:
//   1. required documents present        -> otherwise Incomplete
//   2. resume has readable text          -> otherwise Manual review
//   3. the requisition's Boolean screen  -> otherwise Screened out
// Each outcome records why, so a recruiter can see the failed clause.
const { parse, evaluate } = require('../lib/boolean-query');
const { assertValid } = require('../lib/contract');
const { prefilterV1 } = require('../lib/schemas');

function profileFields(application) {
  const c = application.candidate;
  return {
    license: [c.license_state, ...(c.license_multistate ? ['compact'] : [])],
    state: c.home_state,
    years: c.years_experience,
    shift: c.shift_preference,
    specialty: c.specialty,
    doc: application.attachments.map((a) => a.kind),
  };
}

function run(items, ctx) {
  const base = ctx.node('Normalize requisition');
  const textInfo = ctx.executed('Check resume text') ? ctx.node('Check resume text') : null;
  const { application, requisition } = base;

  const prefilter = { outcome: 'score', boolean_passed: null, failed_clauses: [], matched_terms: [], missing_documents: base.missing_documents };

  if (base.missing_documents.length) {
    prefilter.outcome = 'incomplete';
  } else if (!textInfo || !textInfo.readable) {
    prefilter.outcome = 'unreadable';
  } else {
    const ast = parse(requisition.boolean_screen);
    const profileText = [application.candidate.specialty, textInfo.resume_text].join('\n');
    const result = evaluate(ast, { text: profileText, fields: profileFields(application) });
    prefilter.boolean_passed = result.passed;
    prefilter.failed_clauses = result.failed;
    prefilter.matched_terms = result.matched;
    prefilter.outcome = result.passed ? 'score' : 'screened_out';
  }
  assertValid(prefilterV1, prefilter, 'prefilter.v1');

  return [{
    json: {
      application,
      requisition,
      prefilter,
      resume_text: textInfo ? textInfo.resume_text : '',
      resume_chars: textInfo ? textInfo.chars : 0,
      content_hash: textInfo ? textInfo.content_hash : null,
    },
  }];
}

module.exports = { run, profileFields };
