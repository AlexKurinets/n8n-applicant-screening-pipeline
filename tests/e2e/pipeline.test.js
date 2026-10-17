'use strict';
// End-to-end checks against the running Compose stack, after scripts/smoke.sh
// has reset the data and let the sweep screen the seeded week. Every live
// result is compared with the offline prediction, application by application.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { expectedOutcomes } = require('../../scripts/expected-outcomes');
const { extractText } = require('../../services/docsvc/documents');

const port = (name, fallback) => Number(process.env[name] || fallback);
const PG = (db) => `postgresql://pipeline:${process.env.POSTGRES_PASSWORD || 'pipeline'}@localhost:${port('POSTGRES_PORT', 5452)}/${db}`;
const DASHBOARD = `http://localhost:${port('DASHBOARD_PORT', 8090)}`;
const MAILPIT = `http://localhost:${port('MAILPIT_PORT', 8025)}`;

async function query(db, sql, params) {
  const client = new Client({ connectionString: PG(db) });
  await client.connect();
  try { return (await client.query(sql, params)).rows; } finally { await client.end(); }
}

let expected;
let latest;
test.before(async () => {
  expected = await expectedOutcomes();
  const rows = await query('screening', `select distinct on (application_id) * from runs
    where application_id between 'A-10001' and 'A-10160' order by application_id, id desc`);
  latest = new Map(rows.map((r) => [r.application_id, r]));
});

test('every seeded application was screened exactly as predicted', () => {
  assert.equal(latest.size, 160);
  const mismatches = expected.filter((e) => {
    const r = latest.get(e.application_id);
    if (e.outcome === 'dead letter') return r.status !== 'failed' || r.error_code !== e.error_code;
    return r.status !== 'completed' || r.outcome !== e.outcome || (r.score ?? null) !== (e.score ?? null);
  });
  assert.deepEqual(mismatches.map((m) => m.application_id), []);
});

test('the portal shows the status the workflow decided, and dead letters stay New', async () => {
  const portal = new Map((await query('portal', "select id, status from applications where id between 'A-10001' and 'A-10160'")).map((r) => [r.id, r.status]));
  for (const e of expected) {
    assert.equal(portal.get(e.application_id), e.outcome === 'dead letter' ? 'New' : e.outcome, e.application_id);
  }
  const notes = await query('portal', "select count(*)::int as n from status_history where actor = 'Screening workflow' and note like '[screening]%'");
  assert.equal(notes[0].n, expected.filter((e) => e.outcome !== 'dead letter').length);
});

test('injected portal faults were absorbed: six expired sessions and six 503s, all completed', async () => {
  const fired = await query('portal', 'select fault, count(*)::int as n from fault_log group by 1 order by 1');
  assert.deepEqual(fired, [{ fault: 'session_expiry', n: 6 }, { fault: 'transient_503', n: 6 }]);
  const faulted = expected.filter((e) => e.fault === 'session_expiry' || e.fault === 'transient_503');
  for (const e of faulted) assert.equal(latest.get(e.application_id).status, 'completed', e.application_id);
  assert.equal([...latest.values()].filter((r) => r.relogged).length, 6);
});

test('each shortlisted application got one submittal email with a Word attachment', async () => {
  const shortlisted = expected.filter((e) => e.outcome === 'Shortlisted').map((e) => e.application_id).sort();
  const res = await (await fetch(`${MAILPIT}/api/v1/messages?limit=1000`)).json();
  const seeded = new Set(expected.map((e) => e.application_id));
  const submittals = res.messages.filter((m) => m.Subject.startsWith('Submittal A-') && seeded.has((m.Subject.match(/A-\d{5}/) || [])[0]));
  const sent = await query('screening', "select application_id from submittals where sent_at is not null and application_id between 'A-10001' and 'A-10160' order by 1");
  assert.deepEqual(sent.map((r) => r.application_id), shortlisted);
  assert.equal(submittals.length, shortlisted.length);
  assert.ok(submittals.every((m) => m.Attachments === 1));

  const one = await (await fetch(`${MAILPIT}/api/v1/message/${submittals[0].ID}`)).json();
  const part = one.Attachments[0];
  assert.match(part.FileName, /^Submittal-A-\d{5}-REQ-\d{3}\.docx$/);
  const file = Buffer.from(await (await fetch(`${MAILPIT}/api/v1/message/${submittals[0].ID}/part/${part.PartID}`)).arrayBuffer());
  const text = (await extractText(file)).text;
  assert.match(text, /Candidate Submittal Profile/);
  assert.match(text, /Screening score\s+\d+ \/ 100/);
});

test('each dead letter raised one ops alert', async () => {
  const res = await (await fetch(`${MAILPIT}/api/v1/messages?limit=1000`)).json();
  const alerts = res.messages.filter((m) => m.Subject.startsWith('[screening] PORTAL_LAYOUT_CHANGED'));
  assert.equal(alerts.length, 2);
  assert.ok(alerts.every((m) => m.To[0].Address === 'ops@agency.example.com'));
});

test('dashboard figures come from the same ledger', async () => {
  const { summary, outcomes } = await (await fetch(`${DASHBOARD}/api/summary`)).json();
  assert.equal(summary.applications, 160);
  assert.equal(summary.screened_out, 64);
  assert.equal(summary.scored, 82);
  assert.equal(summary.shortlisted, 34);
  assert.equal(summary.submittals_sent, 34);
  assert.equal(summary.open_dead_letters, 2);
  assert.equal(summary.relogged, 6);
  const byOutcome = Object.fromEntries(outcomes.map((o) => [o.outcome, o.n]));
  assert.deepEqual(byOutcome, { Shortlisted: 34, 'Recruiter review': 30, 'Low match': 18, 'Screened out': 64, Incomplete: 8, 'Manual review': 4, 'Dead letter': 2 });
});

test('dashboard pages render (smoke)', async () => {
  const page = async (path) => {
    const res = await fetch(`${DASHBOARD}${path}`);
    assert.equal(res.status, 200, path);
    return res.text();
  };
  const overview = await page('/');
  assert.match(overview, /Screened out by Boolean pre-filter/);
  assert.match(overview, />64</);
  assert.match(overview, /40% of applications, no model call/);
  const [shortlisted] = await query('screening', "select id, submittal->>'document_name' as doc from runs where outcome = 'Shortlisted' order by id limit 1");
  const detail = await page(`/runs/${shortlisted.id}`);
  assert.match(detail, /Model ratings/);
  assert.match(detail, /Grounded/);
  assert.match(await page('/runs?outcome=Screened%20out'), /Screened out/);
  assert.match(await page('/applications/A-10125'), /Run #\d+/, 'stable link by application id');
  assert.match(await page('/dead-letters'), /PORTAL_LAYOUT_CHANGED/);
  const doc = await fetch(`${DASHBOARD}/documents/${encodeURIComponent(shortlisted.doc)}`);
  assert.equal(doc.status, 200);
  assert.equal(Buffer.from(await doc.arrayBuffer()).subarray(0, 2).toString(), 'PK');
});
