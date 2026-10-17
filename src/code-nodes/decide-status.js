'use strict';
// Code node "Decide status".
// One place maps every outcome to the portal status and the note recruiters
// read on the application. The workflow never rejects anyone outright: the
// lowest model band is "Low match", which still sits in a recruiter's queue.

function run(items, ctx) {
  const pre = ctx.node('Pre-filter');
  const scored = ctx.executed('Validate and score') ? ctx.node('Validate and score') : null;
  const { application, requisition, prefilter } = pre;

  let status;
  let reason = null;
  let note;

  switch (prefilter.outcome) {
    case 'incomplete':
      status = 'Incomplete';
      reason = 'MISSING_DOCUMENTS';
      note = `Missing required documents: ${prefilter.missing_documents.join(', ')}. Not screened yet.`;
      break;
    case 'unreadable':
      status = 'Manual review';
      reason = 'UNREADABLE_RESUME';
      note = 'The resume has no readable text (likely a scanned image), so it was not scored.';
      break;
    case 'screened_out':
      status = 'Screened out';
      reason = 'BOOLEAN_SCREEN';
      note = `Pre-filter for ${requisition.requisition_id} not met: ${prefilter.failed_clauses.join('; ')}.`;
      break;
    default:
      if (!scored || scored.refusal) {
        status = 'Manual review';
        reason = 'MODEL_DECLINED';
        note = 'The model declined to rate this resume, so a recruiter should screen it.';
      } else {
        const s = scored.screening;
        status = s.band;
        const gaps = s.must_have_gaps.length ? ` Must-have without evidence: ${s.must_have_gaps.join(', ')}.` : '';
        const flags = s.ungrounded ? ` ${s.ungrounded} quote(s) not found in the resume, rated 0.` : '';
        note = `Score ${s.score}/100 (${s.prompt_version}).${gaps}${flags}`;
      }
  }

  return [{
    json: {
      application_id: application.application_id,
      requisition_id: requisition.requisition_id,
      status,
      reason,
      note: `[screening] ${note}`,
      portal_status: application.portal_status,
      csrf_token: application.csrf_token,
      cookie: ctx.node('Normalize application').cookie,
      needs_submittal: status === 'Shortlisted',
    },
  }];
}

module.exports = { run };
