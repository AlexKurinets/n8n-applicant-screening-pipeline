#!/usr/bin/env node
'use strict';
// Operator commands for the demo stack. Runs inside the Compose network:
//   docker compose run --rm cli <command>
//
//   sweep                         run the reconciliation sweep now
//   new-application               submit the demo application through the public apply form
//   duplicate-notification <id>   make the portal email the intake mailbox again for <id>
//   llm-outage on|off             make the model endpoint answer 529 Overloaded, or stop
//   wait [--min N]                wait until no run is in progress and at least N runs exist
//   summary                       print the ledger totals
const { Client } = require('pg');
const { demoApplication } = require('./seed-data');
const { resumePdf, documentPdf } = require('./pdf');

const PORTAL = process.env.PORTAL_INTERNAL_URL || 'http://portal:8080';
const N8N = process.env.N8N_INTERNAL_URL || 'http://n8n:5678';
const FAKE_LLM = process.env.FAKE_LLM_INTERNAL_URL || 'http://fake-llm:8060';
const ADMIN_KEY = process.env.PORTAL_ADMIN_KEY || 'local-admin-key';

async function post(url, body, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} answered ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function ledger(fn) {
  const client = new Client({ connectionString: process.env.SCREENING_DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function summary() {
  return ledger(async (db) => {
    const runs = (await db.query(`select status, coalesce(outcome, error_code) as outcome, count(*)::int as n from runs group by 1, 2 order by 1, 2`)).rows;
    const dead = (await db.query('select count(*)::int as n from dead_letters where replayed_at is null')).rows[0].n;
    const dup = (await db.query("select count(*)::int as n from intake_events where outcome = 'duplicate'")).rows[0].n;
    return { runs, open_dead_letters: dead, duplicates_skipped: dup };
  });
}

const commands = {
  async sweep() {
    console.log(await post(`${N8N}/webhook/screening/sweep`, {}));
  },
  async 'new-application'() {
    const demo = demoApplication();
    const resume = await resumePdf(demo.resume_text);
    const license = await documentPdf('License verification (synthetic)', [`Name: ${demo.candidate.name}`, 'License state: NM', 'Multistate: yes', 'Status: active']);
    const res = await post(`${PORTAL}/apply`, {
      requisition_id: demo.requisition_id,
      candidate: demo.candidate,
      attachments: [
        { kind: 'resume', filename: 'Siobhan-Ortega-Dunmore-Resume.pdf', content_base64: resume.toString('base64') },
        { kind: 'license', filename: 'Siobhan-Ortega-Dunmore-License-Verification.pdf', content_base64: license.toString('base64') },
      ],
    });
    console.log(`submitted ${res.application_id}; the portal emailed the intake mailbox`);
  },
  async 'duplicate-notification'(id) {
    if (!/^A-\d{5}$/.test(id || '')) throw new Error('usage: duplicate-notification A-10001');
    await post(`${PORTAL}/admin/notify/${id}`, {}, { 'x-portal-admin-key': ADMIN_KEY });
    console.log(`portal re-sent the notification for ${id}`);
  },
  async 'llm-outage'(mode) {
    if (!['on', 'off'].includes(mode)) throw new Error('usage: llm-outage on|off');
    console.log(await post(`${FAKE_LLM}/admin/outage`, { on: mode === 'on' }));
  },
  async wait(...args) {
    const min = Number(args[args.indexOf('--min') + 1]) || 0;
    const timeout = Date.now() + Number(process.env.WAIT_SECONDS || 600) * 1000;
    let stable = 0;
    for (;;) {
      const { total, busy } = await ledger(async (db) => (await db.query(
        "select count(*)::int as total, count(*) filter (where status = 'processing')::int as busy from runs")).rows[0]);
      stable = busy === 0 && total >= min ? stable + 1 : 0;
      if (stable >= 3) return console.log(`ledger settled: ${total} runs, none in progress`);
      if (Date.now() > timeout) throw new Error(`timed out with ${total} runs, ${busy} in progress`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  },
  async summary() {
    console.log(JSON.stringify(await summary(), null, 2));
  },
};

const [name, ...args] = process.argv.slice(2);
if (!commands[name]) {
  console.error(`unknown command "${name || ''}". Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
commands[name](...args).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
