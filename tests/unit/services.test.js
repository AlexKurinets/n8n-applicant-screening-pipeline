'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { extractText, renderDocx, submittalView, sniff } = require('../../services/docsvc/documents');
const { respond, rateCriteria } = require('../../services/fake-llm/model');
const { resumePdf, scannedResumePdf } = require('../../scripts/pdf');
const { settingsFromEnv } = require('../../scripts/migrate');
const views = require('../../services/portal/views');

const payload = {
  schema_version: 'submittal.v1',
  application_id: 'A-10001',
  requisition: { id: 'REQ-104', title: 'Respiratory Therapist, ICU Coverage', facility: 'Ash & Willow Regional Hospital' },
  candidate: { name: "Siobhán O'Connell", specialty: 'Respiratory Therapy', years_experience: 4, license: 'NV', shift_preference: 'nights' },
  score: 89,
  criteria: [
    { text: 'Arterial blood gas sampling and analysis', rating_label: 'Strong', evidence: 'Performed arterial blood gas sampling & analysis on every shift.' },
    { text: 'Neonatal or pediatric respiratory care experience', rating_label: 'No evidence', evidence: '' },
  ],
  summary: 'Relevant experience includes ABG <and> ventilator work.',
  generated_at: '2026-09-15T10:00:00.000Z',
};

test('docsvc: renders the submittal with escaped special characters and one row per criterion', async () => {
  const buffer = renderDocx('submittal-profile', submittalView(payload));
  const xml = new PizZip(buffer).file('word/document.xml').asText();
  assert.ok(xml.includes('Ash &amp; Willow Regional Hospital'));
  assert.ok(xml.includes('ABG &lt;and&gt; ventilator work'));
  assert.ok(!/\{[#/]?[a-z_]+\}/.test(xml), 'no unfilled template tags');
  const text = (await extractText(buffer)).text;
  assert.match(text, /Siobhán O'Connell/);
  assert.match(text, /Arterial blood gas sampling and analysis\s+Strong/);
  assert.match(text, /Neonatal or pediatric respiratory care experience\s+No evidence/);
});

test('docsvc: extraction sniffs the format and finds no text in a scanned resume', async () => {
  const pdf = await resumePdf('Maya Okonkwo\nSUMMARY\nRegistered nurse (RN) with 4 years in ICU settings.');
  assert.equal(sniff(pdf), 'pdf');
  const out = await extractText(pdf);
  assert.match(out.text, /Registered nurse \(RN\) with 4 years in ICU settings\./);
  assert.equal(out.pages, 1);
  const scanned = await extractText(await scannedResumePdf(3));
  assert.equal(scanned.chars, 0);
  assert.equal(sniff(Buffer.from('plain text')), 'text');
});

test('docsvc: an unknown template is a 400, not a crash', () => {
  assert.throws(() => renderDocx('nope', {}), (e) => e.status === 400);
});

test('fake model: answers in the Messages API shape, deterministically', () => {
  const body = {
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    messages: [{ role: 'user', content: '<requisition id="REQ-101">\nTitle: x\nCriteria:\nc1 (must have): Current BLS and ACLS certifications\nc2: Prior travel or agency nursing assignments\n</requisition>\n<resume>\n- BLS and ACLS certifications are current and renewed on schedule.\n- Open to travel.\n</resume>' }],
  };
  const a = respond(body);
  assert.deepEqual(a, respond(body));
  assert.equal(a.type, 'message');
  assert.equal(a.stop_reason, 'end_turn');
  const parsed = JSON.parse(a.content[0].text);
  assert.equal(parsed.criteria[0].rating, 3);
  assert.equal(parsed.criteria[0].evidence, 'BLS and ACLS certifications are current and renewed on schedule.');
  assert.equal(parsed.criteria[1].rating, 1);
});

test('fake model: some weak matches come back paraphrased, so grounding has something to catch', () => {
  const crit = [{ id: 'c1', text: 'Prior travel or agency nursing assignments' }];
  const quotes = ['Open to travel.', 'Willing to travel.', 'Happy to travel.', 'Available to travel.']
    .map((s) => rateCriteria(crit, `- ${s}`)[0].evidence);
  assert.ok(quotes.some((q) => q.startsWith('Has ')), 'at least one paraphrase');
  assert.ok(quotes.some((q) => !q.startsWith('Has ')), 'at least one verbatim');
});

test('migrate: environment settings default to the offline stack and Claude Opus 5.5', () => {
  const { refresh, keep } = settingsFromEnv({});
  assert.equal(refresh.llm_base_url, 'http://fake-llm:8060');
  assert.equal(refresh.model, 'claude-opus-5-5');
  assert.deepEqual(keep.thresholds, { shortlist: 75, review: 50 });
  assert.equal(settingsFromEnv({ LLM_BASE_URL: 'https://api.anthropic.com' }).refresh.llm_base_url, 'https://api.anthropic.com');
});

test('portal views: the selectors the workflow depends on are on the page', () => {
  const app = {
    id: 'A-10001', status: 'New', received_at: '2026-09-14T13:00:00Z',
    candidate: { name: 'Maya', email: 'm@example.com', phone: '555-0101', home_state: 'TX', license_state: 'TX', license_multistate: false, specialty: 'ICU', years_experience: 3, shift_preference: 'Nights' },
  };
  const req = { id: 'REQ-101', title: 'ICU RN' };
  const html = views.detailPage({ user: { display_name: 'x' }, app, req, attachments: [{ id: 1, kind: 'resume', filename: 'r.pdf' }], history: [], csrf: 'c'.repeat(32) });
  for (const sel of ['data-page="application-detail"', 'id="application-id"', 'class="field-license-state"', 'name="_csrf"', 'class="attachment" data-kind="resume"', 'class="received" datetime=']) {
    assert.ok(html.includes(sel), sel);
  }
  const v2 = views.detailPage({ user: { display_name: 'x' }, app, req, attachments: [], history: [], csrf: 'c', variant: 'layout_v2' });
  assert.ok(!v2.includes('field-license-state') && v2.includes('lic-state'), 'layout_v2 renames the license fields');
});
