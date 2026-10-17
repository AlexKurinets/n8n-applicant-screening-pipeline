'use strict';
// Code node "Normalize requisition".
// Builds requisition.v1 from the requisition page and works out which required
// documents the application is missing.
const { assertValid } = require('../lib/contract');
const { requisitionV1 } = require('../lib/schemas');

const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

// The HTML node converts text with html-to-text, which wraps at 80 columns.
// Its "clean up text" option then deletes the line breaks without a space,
// gluing "AND years>=1" into "ANDyears>=1". That option is off on the node,
// and whitespace is collapsed here instead.
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : Array.isArray(v) ? v.map(clean) : v);

function run(items, ctx) {
  const f = Object.fromEntries(Object.entries(items[0].json).map(([k, v]) => [k, clean(v)]));
  const { application, cookie, relogged } = ctx.node('Normalize application');

  const ids = asArray(f.criteria_ids);
  const texts = asArray(f.criteria_texts);
  const weights = asArray(f.criteria_weights);
  const must = asArray(f.criteria_must);

  const requisition = {
    schema_version: 'requisition.v1',
    requisition_id: f.requisition_id,
    title: f.title,
    facility: f.facility,
    boolean_screen: f.boolean_screen,
    required_documents: String(f.required_documents || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    criteria: ids.map((id, i) => ({
      id,
      text: texts[i],
      weight: Number(weights[i]),
      must_have: String(must[i]) === 'true',
    })),
    recruiter_email: f.recruiter_email,
    account_manager_email: f.account_manager_email,
  };
  assertValid(requisitionV1, requisition, 'requisition.v1', 'PORTAL_CONTRACT_VIOLATION');

  if (requisition.requisition_id !== application.requisition_id) {
    throw new Error(`[PORTAL_WRONG_RECORD] application points at ${application.requisition_id}, page shows ${requisition.requisition_id}`);
  }

  const kinds = new Set(application.attachments.map((a) => a.kind));
  const missing_documents = requisition.required_documents.filter((d) => !kinds.has(d));
  const resume = application.attachments.find((a) => a.kind === 'resume');

  return [{
    json: {
      application,
      requisition,
      cookie,
      relogged,
      missing_documents,
      resume_url: resume ? resume.url : null,
    },
  }];
}

module.exports = { run };
