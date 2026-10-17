'use strict';
// Code node "Build submittal".
// The Word submittal goes to the requisition's recruiter, with the account
// manager copied. The payload is checked against submittal.v1 before the
// render service sees it, so a template never receives a missing field.
const { assertValid } = require('../lib/contract');
const { submittalV1 } = require('../lib/schemas');
const { RATING_LABELS } = require('../lib/scoring');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function run(items, ctx) {
  const { application, requisition } = ctx.node('Pre-filter');
  const { screening } = ctx.node('Validate and score');
  const settings = ctx.node('Load settings').settings;
  const c = application.candidate;

  const payload = {
    schema_version: 'submittal.v1',
    application_id: application.application_id,
    requisition: { id: requisition.requisition_id, title: requisition.title, facility: requisition.facility },
    candidate: {
      name: c.name,
      specialty: c.specialty,
      years_experience: c.years_experience,
      license: `${c.license_state}${c.license_multistate ? ' (multistate)' : ''}`,
      shift_preference: c.shift_preference,
    },
    score: screening.score,
    criteria: screening.criteria.map((k) => ({
      text: k.text,
      rating_label: RATING_LABELS[k.rating],
      evidence: k.rating > 0 ? k.evidence : '',
    })),
    summary: screening.summary,
    generated_at: new Date().toISOString(),
  };
  assertValid(submittalV1, payload, 'submittal.v1');

  const documentName = `Submittal-${application.application_id}-${requisition.requisition_id}.docx`;
  const subject = `Submittal ${application.application_id}: ${c.name} for ${requisition.title} (${requisition.requisition_id}), score ${screening.score}`;
  const html = [
    `<p>${escapeHtml(c.name)} was shortlisted for <b>${escapeHtml(requisition.title)}</b> at ${escapeHtml(requisition.facility)}.</p>`,
    `<p>Score ${screening.score}/100. ${escapeHtml(screening.summary)}</p>`,
    `<p>The submittal profile is attached. Application ${application.application_id} in the portal has the full record.</p>`,
  ].join('\n');

  return [{
    json: {
      payload,
      document_name: documentName,
      email: { from: settings.notify_from, to: requisition.recruiter_email, cc: requisition.account_manager_email, subject, html },
    },
  }];
}

module.exports = { run };
