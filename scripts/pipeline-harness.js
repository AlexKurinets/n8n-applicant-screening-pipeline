'use strict';
// Runs the screening Code nodes in workflow order without n8n: same modules,
// same order, with the portal pages, the extraction service and the model
// replaced by in-memory equivalents. The unit tests use it to pin the
// decision logic, and expected-outcomes.js uses it to predict what the live
// stack will produce for the seeded applications.
const prefilter = require('../src/code-nodes/boolean-prefilter');
const buildRequest = require('../src/code-nodes/build-scoring-request');
const validateAndScore = require('../src/code-nodes/validate-and-score');
const decideStatus = require('../src/code-nodes/decide-status');
const textGuard = require('../src/code-nodes/text-guard');
const fakeModel = require('../services/fake-llm/model');

const DEFAULT_SETTINGS = {
  model: 'claude-opus-5-5',
  effort: 'medium',
  max_tokens: 16000,
  thresholds: { shortlist: 75, review: 50 },
  min_resume_chars: 200,
  notify_from: 'screening@agency.example.com',
  ops_email: 'ops@agency.example.com',
};

function makeCtx(outputs) {
  return {
    node: (name) => {
      if (!(name in outputs)) throw new Error(`node "${name}" has not run`);
      return outputs[name];
    },
    executed: (name) => name in outputs,
    executionId: 'offline',
  };
}

function toApplicationV1(app, req) {
  return {
    schema_version: 'application.v1',
    application_id: app.id,
    requisition_id: req.id,
    received_at: app.received_at,
    portal_status: 'New',
    csrf_token: 'offline-csrf-token-0000',
    candidate: {
      name: app.candidate.name,
      email: app.candidate.email,
      phone: app.candidate.phone,
      home_state: app.candidate.home_state,
      license_state: app.candidate.license_state,
      license_multistate: app.candidate.license_multistate,
      specialty: app.candidate.specialty,
      years_experience: app.candidate.years_experience,
      shift_preference: String(app.candidate.shift_preference).toLowerCase(),
    },
    attachments: app.attachment_kinds.map((kind, i) => ({ kind, url: `/attachments/${i + 1}`, filename: `${kind}.pdf` })),
  };
}

function toRequisitionV1(req) {
  return {
    schema_version: 'requisition.v1',
    requisition_id: req.id,
    title: req.title,
    facility: req.facility,
    boolean_screen: req.boolean_screen,
    required_documents: req.required_documents,
    criteria: req.criteria.map(({ id, text, weight, must_have }) => ({ id, text, weight, must_have })),
    recruiter_email: req.recruiter,
    account_manager_email: req.accountManager,
  };
}

// `extractedText` is what the extraction service would return for the resume
// (empty for a scanned PDF, null when there is no resume at all).
function screenOffline({ application, requisition, extractedText, settings = DEFAULT_SETTINGS, model = fakeModel.respond }) {
  const outputs = { 'Load settings': { settings } };
  const kinds = new Set(application.attachments.map((a) => a.kind));
  const resume = application.attachments.find((a) => a.kind === 'resume');
  outputs['Normalize application'] = { application, cookie: 'PORTALSESSID=offline', relogged: false };
  outputs['Normalize requisition'] = {
    application,
    requisition,
    cookie: 'PORTALSESSID=offline',
    relogged: false,
    missing_documents: requisition.required_documents.filter((d) => !kinds.has(d)),
    resume_url: resume ? resume.url : null,
  };
  if (resume) {
    outputs['Check resume text'] = textGuard.run([{ json: { text: extractedText || '', pages: 1, format: 'pdf' } }], makeCtx(outputs))[0].json;
  }
  outputs['Pre-filter'] = prefilter.run([], makeCtx(outputs))[0].json;

  let modelResponse = null;
  if (outputs['Pre-filter'].prefilter.outcome === 'score') {
    outputs['Build scoring request'] = buildRequest.run([{ json: outputs['Pre-filter'] }], makeCtx(outputs))[0].json;
    modelResponse = model(outputs['Build scoring request'].request);
    outputs['Validate and score'] = validateAndScore.run([{ json: modelResponse }], makeCtx(outputs))[0].json;
  }
  outputs['Decide status'] = decideStatus.run([], makeCtx(outputs))[0].json;
  return { outputs, decision: outputs['Decide status'], modelResponse };
}

module.exports = { DEFAULT_SETTINGS, makeCtx, toApplicationV1, toRequisitionV1, screenOffline };
