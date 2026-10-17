'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCtx, DEFAULT_SETTINGS, toApplicationV1, toRequisitionV1, screenOffline } = require('../../scripts/pipeline-harness');
const { REQUISITIONS, generateApplications } = require('../../scripts/seed-data');

const node = (name) => require(`../../src/code-nodes/${name}`);
const item = (json) => [{ json }];
const REQ = REQUISITIONS[0];

test('portal-session: a 303 with PORTALSESSID is a login; anything else throws', () => {
  const ok = node('portal-session').run(item({ statusCode: 303, headers: { 'set-cookie': ['PORTALSESSID=abc123; Path=/; HttpOnly'] } }));
  assert.equal(ok[0].json.cookie, 'PORTALSESSID=abc123');
  assert.throws(() => node('portal-session').run(item({ statusCode: 200, headers: {} })), /\[PORTAL_LOGIN_FAILED\]/);
});

test('session-guard: the login page is an expired session, not an empty application', () => {
  const guard = node('session-guard');
  const login = '<html><body data-page="login"><form></form></body></html>';
  assert.equal(guard.run(item({ data: login }), makeCtx({}))[0].json.state, 'expired');
  assert.throws(() => guard.run(item({ data: login }), makeCtx({}), { strict: true }), /\[SESSION_EXPIRED\]/);
  assert.throws(() => guard.run(item({ data: '<body data-page="error">' }), makeCtx({})), /\[PORTAL_LAYOUT_CHANGED\]/);
  const ok = guard.run(item({ data: '<body class="x" data-page="application-detail">ok</body>' }), makeCtx({}));
  assert.equal(ok[0].json.state, 'ok');
});

function extracted(overrides = {}) {
  return {
    application_id: 'A-10001', requisition_id: 'REQ-101', received_at: '2026-09-14T13:00:00.000Z', portal_status: 'New',
    csrf_token: '0123456789abcdef0123', name: 'Maya Okonkwo', email: 'maya@example.com', phone: '555-0101',
    home_state: 'TX', license_state: 'TX', license_type: 'Multistate (NLC)', specialty: 'ICU', years: '4', shift: 'Nights',
    attachment_urls: ['/attachments/1', '/attachments/2'], attachment_kinds: ['resume', 'license'], attachment_names: ['a.pdf', 'b.pdf'],
    ...overrides,
  };
}
const sessionCtx = (extra = {}) => makeCtx({ Start: { application_id: 'A-10001' }, 'Read session': { cookie: 'PORTALSESSID=1' }, ...extra });

test('normalize-application: builds application.v1 from selector output', () => {
  const out = node('normalize-application').run(item(extracted()), sessionCtx())[0].json;
  assert.equal(out.application.candidate.license_multistate, true);
  assert.equal(out.application.candidate.shift_preference, 'nights');
  assert.equal(out.application.candidate.years_experience, 4);
  assert.deepEqual(out.application.attachments.map((a) => a.kind), ['resume', 'license']);
  assert.equal(out.cookie, 'PORTALSESSID=1');
});

test('normalize-application: empty selectors are a layout change, named in the error', () => {
  const layoutV2 = extracted({ license_state: '', license_type: '' });
  assert.throws(() => node('normalize-application').run(item(layoutV2), sessionCtx()),
    /\[PORTAL_LAYOUT_CHANGED\] selectors returned nothing for: license_state, license_type/);
});

test('normalize-application: a page for a different application is refused', () => {
  assert.throws(() => node('normalize-application').run(item(extracted({ application_id: 'A-10002' })), sessionCtx()), /\[PORTAL_WRONG_RECORD\]/);
});

test('normalize-application: uses the new cookie after a re-login', () => {
  const ctx = sessionCtx({ 'Read new session': { cookie: 'PORTALSESSID=2' } });
  const out = node('normalize-application').run(item(extracted()), ctx)[0].json;
  assert.equal(out.cookie, 'PORTALSESSID=2');
  assert.equal(out.relogged, true);
});

test('normalize-requisition: rejoins words the HTML node wrapped across lines', () => {
  const application = toApplicationV1({ id: 'A-10001', received_at: '2026-09-14T13:00:00.000Z', candidate: generateApplications()[0].candidate, attachment_kinds: ['resume'] }, REQ);
  const wrapped = {
    requisition_id: 'REQ-101', title: REQ.title, facility: REQ.facility,
    boolean_screen: '("registered nurse" OR RN) AND (ICU OR "intensive care" OR "critical care") AND\n(license:TX OR license:compact) AND years>=2 AND NOT "new grad"',
    required_documents: 'resume, license', recruiter_email: REQ.recruiter, account_manager_email: REQ.accountManager,
    criteria_ids: REQ.criteria.map((c) => c.id), criteria_weights: REQ.criteria.map((c) => String(c.weight)),
    criteria_must: REQ.criteria.map((c) => String(c.must_have)), criteria_texts: REQ.criteria.map((c) => c.text.replace(' of ', ' of\n')),
  };
  const ctx = makeCtx({ 'Normalize application': { application, cookie: 'c', relogged: false } });
  const out = node('normalize-requisition').run(item(wrapped), ctx)[0].json;
  assert.match(out.requisition.boolean_screen, /AND \(license:TX/);
  assert.ok(!out.requisition.criteria.some((c) => c.text.includes('\n')));
  assert.deepEqual(out.missing_documents, ['license']);
  assert.equal(out.resume_url, '/attachments/1');
});

test('text-guard: a scanned resume is unreadable; a real one is hashed', () => {
  const ctx = makeCtx({ 'Load settings': { settings: DEFAULT_SETTINGS } });
  assert.equal(node('text-guard').run(item({ text: '  \n ' }), ctx)[0].json.readable, false);
  const ok = node('text-guard').run(item({ text: 'x'.repeat(250), pages: 1 }), ctx)[0].json;
  assert.equal(ok.readable, true);
  assert.equal(ok.content_hash.length, 64);
});

function screen(app, opts = {}) {
  const req = REQUISITIONS.find((r) => r.id === app.requisition_id);
  return screenOffline({ application: toApplicationV1(app, req), requisition: toRequisitionV1(req), extractedText: app.scanned ? '' : app.resume_text, ...opts });
}
const apps = generateApplications();

test('pre-filter order: missing documents, then unreadable text, then the Boolean screen', () => {
  assert.equal(screen(apps.find((a) => a.kind === 'incomplete')).decision.status, 'Incomplete');
  assert.equal(screen(apps.find((a) => a.kind === 'scanned')).decision.status, 'Manual review');
  const out = screen(apps.find((a) => a.kind === 'bool_license'));
  assert.equal(out.decision.status, 'Screened out');
  assert.equal(out.outputs['Build scoring request'], undefined, 'no model call for a screened-out application');
});

test('build-scoring-request: masks the resume and sends the schema as structured output', () => {
  const out = screen(apps.find((a) => a.kind === 'strong'));
  const { request, model_text: masked } = out.outputs['Build scoring request'];
  assert.equal(request.model, 'claude-opus-5-5');
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.equal(request.output_config.effort, 'medium');
  assert.equal(request.fallbacks, 'default');
  assert.ok(!masked.includes('@example.com'));
  assert.ok(!request.messages[0].content.includes(apps.find((a) => a.kind === 'strong').candidate.email));
});

function scoreWith(reply) {
  const app = apps.find((a) => a.kind === 'strong');
  return screen(app, { model: () => reply });
}
const reply = (obj, extra = {}) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], ...extra });

test('validate-and-score: a refusal routes to Manual review instead of guessing', () => {
  const out = scoreWith(reply('', { stop_reason: 'refusal' }));
  assert.equal(out.decision.status, 'Manual review');
  assert.equal(out.decision.reason, 'MODEL_DECLINED');
});

test('validate-and-score: truncated, non-JSON and mismatched replies are contract violations', () => {
  assert.throws(() => scoreWith(reply('{"criteria": [', { stop_reason: 'max_tokens' })), /\[MODEL_TRUNCATED\]/);
  assert.throws(() => scoreWith(reply('not json')), /\[MODEL_CONTRACT_VIOLATION\] reply is not JSON/);
  const missing = { criteria: [{ id: 'c1', rating: 3, evidence: '' }], summary: 'A summary that is long enough.', concerns: [] };
  assert.throws(() => scoreWith(reply(missing)), /criteria mismatch/);
  const dup = { ...missing, criteria: [...missing.criteria, ...missing.criteria] };
  assert.throws(() => scoreWith(reply(dup)), /rated twice/);
  const outOfRange = { ...missing, criteria: ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id, rating: 4, evidence: '' })) };
  assert.throws(() => scoreWith(reply(outOfRange)), /\[MODEL_CONTRACT_VIOLATION\] model_output\.v1/);
});

test('validate-and-score: an invented quote earns nothing, and the code does the arithmetic', () => {
  const app = apps.find((a) => a.kind === 'strong');
  const lines = app.resume_text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const criteria = [
    { id: 'c1', rating: 3, evidence: lines[0] },
    { id: 'c2', rating: 3, evidence: 'Holds every certification the unit could want.' },
    { id: 'c3', rating: 0, evidence: '' },
    { id: 'c4', rating: 0, evidence: '' },
  ];
  const out = scoreWith(reply({ criteria, summary: 'A summary that is long enough.', concerns: [] }));
  const s = out.outputs['Validate and score'].screening;
  assert.equal(s.criteria[1].grounded, false);
  assert.equal(s.criteria[1].rating, 0);
  assert.equal(s.ungrounded, 1);
  assert.equal(s.score, Math.round((100 * 9) / 27));
  assert.deepEqual(s.must_have_gaps, ['c2']);
  assert.equal(out.decision.status, 'Low match');
  assert.match(out.decision.note, /1 quote\(s\) not found in the resume/);
});

test('decide-status: every outcome writes a note recruiters can read', () => {
  for (const kind of ['strong', 'mid', 'weak', 'bool_specialty', 'incomplete', 'scanned']) {
    const d = screen(apps.find((a) => a.kind === kind)).decision;
    assert.match(d.note, /^\[screening\] /, kind);
    assert.equal(d.needs_submittal, d.status === 'Shortlisted');
  }
});

test('raise-step-error: tags the failed step and keeps the cause', () => {
  const raise = node('raise-step-error');
  assert.throws(() => raise.run(item({ error: { message: 'The service failed to process your request', description: 'Overloaded', httpCode: '529' } }), { prevNode: 'Claude: rate criteria' }),
    /^Error: \[LLM_UNAVAILABLE\] \(node: Claude: rate criteria\) HTTP 529 after retries: The service failed to process your request \| Overloaded/);
  assert.throws(() => raise.run(item({ error: 'Request failed with status code 400' }), { prevNode: 'Claude: rate criteria' }), /\[LLM_REQUEST_REJECTED\]/);
  assert.throws(() => raise.run(item({ error: '503 - Service temporarily unavailable' }), { prevNode: 'Fetch application page' }), /\[PORTAL_UNAVAILABLE\] .* HTTP 503/);
});

test('classify-error and describe-failure: tagged codes win, node names are recovered, replayability is decided', () => {
  const { classify } = node('classify-error');
  assert.equal(classify('[PORTAL_LAYOUT_CHANGED] selectors returned nothing'), 'PORTAL_LAYOUT_CHANGED');
  assert.equal(classify('connect ECONNREFUSED 172.18.0.5:8080'), 'NETWORK');
  assert.equal(classify('something odd'), 'UNEXPECTED');
  const described = node('describe-failure').run(
    item({ application_id: 'A-10001', source: 'sweep', error: '[LLM_UNAVAILABLE] (node: Claude: rate criteria) after retries: Overloaded' }),
    { executionId: '7', node: () => { throw new Error('not needed'); } }, { workflow: 'Intake' })[0].json;
  assert.equal(described.failed_node, 'Claude: rate criteria');
  assert.equal(described.application_id, 'A-10001');
  const ctx = makeCtx({ 'Load settings': { settings: DEFAULT_SETTINGS }, Start: { ...described } });
  const classified = node('classify-error').run([], ctx)[0].json;
  assert.equal(classified.error_code, 'LLM_UNAVAILABLE');
  assert.equal(classified.retryable, true);
  assert.equal(classified.alert.to, 'ops@agency.example.com');
});

test('parse-notification: only portal mail with an application id is intake', () => {
  const out = node('parse-notification').run([
    { json: { subject: 'New application A-10161 for REQ-101 ICU', from: 'Applicant Portal <no-reply@portal.example.com>' } },
    { json: { subject: 'New application A-10162 for REQ-101', from: 'someone@example.com' } },
    { json: { subject: 'Out of office', from: 'no-reply@portal.example.com' } },
  ]);
  assert.deepEqual(out.map((o) => o.json.ignored), [false, true, true]);
  assert.equal(out[0].json.application_id, 'A-10161');
});

test('collect-new-ids: flattens pages and refuses a page without the list marker', () => {
  const out = node('collect-new-ids').run([
    { json: { page_marker: 'application-list', ids: ['A-10002', 'A-10001'] } },
    { json: { page_marker: 'application-list', ids: ['A-10002', 'A-10003', 'junk'] } },
  ]);
  assert.deepEqual(out[0].json.ids, ['A-10001', 'A-10002', 'A-10003']);
  assert.throws(() => node('collect-new-ids').run([{ json: { page_marker: 'login', ids: [] } }]), /\[PORTAL_LAYOUT_CHANGED\]/);
});

test('build-submittal and summarize-run: shortlisted runs produce a valid submittal and a complete ledger summary', () => {
  const out = screen(apps.find((a) => a.kind === 'strong'));
  assert.equal(out.decision.status, 'Shortlisted');
  const ctx = makeCtx({ ...out.outputs });
  const sub = node('build-submittal').run([], ctx)[0].json;
  assert.equal(sub.payload.schema_version, 'submittal.v1');
  assert.match(sub.document_name, /^Submittal-A-\d{5}-REQ-\d{3}\.docx$/);
  assert.equal(sub.email.cc, toRequisitionV1(REQUISITIONS.find((r) => r.id === apps.find((a) => a.kind === 'strong').requisition_id)).account_manager_email);
  const summary = node('summarize-run').run([], makeCtx({
    ...out.outputs, 'Claim run': { run_id: 42 }, 'Confirm status write': {}, 'Build submittal': sub, 'Record submittal': { message_id: '<m@x>' },
  }))[0].json;
  assert.equal(summary.run_id, 42);
  assert.equal(summary.summary.status_written, true);
  assert.deepEqual(summary.summary.submittal, { document_name: sub.document_name, message_id: '<m@x>', sent: true });
});
