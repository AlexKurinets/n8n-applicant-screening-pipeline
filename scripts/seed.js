#!/usr/bin/env node
'use strict';
// Loads the synthetic requisitions and the week of 160 applications into the
// portal. Skips if the portal already has data, unless run with --reset,
// which also clears the screening ledger so the stack starts from scratch.
const { Client } = require('pg');
const { REQUISITIONS, generateApplications } = require('./seed-data');
const { resumePdf, scannedResumePdf, documentPdf } = require('./pdf');

const slug = (s) => s.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function attachmentsFor(app, req) {
  const out = [];
  const base = slug(app.candidate.name);
  for (const kind of app.attachment_kinds) {
    if (kind === 'resume') {
      const content = app.scanned ? await scannedResumePdf(Number(app.id.slice(2))) : await resumePdf(app.resume_text);
      out.push({ kind, filename: `${base}-Resume.pdf`, content });
    } else if (kind === 'license') {
      out.push({ kind, filename: `${base}-License-Verification.pdf`, content: await documentPdf('License verification (synthetic)', [
        `Name: ${app.candidate.name}`, `License state: ${app.candidate.license_state}`,
        `Multistate: ${app.candidate.license_multistate ? 'yes' : 'no'}`, 'Status: active', 'Source: synthetic test data',
      ]) });
    } else {
      out.push({ kind, filename: `${base}-Certification.pdf`, content: await documentPdf('Certification card (synthetic)', [
        `Name: ${app.candidate.name}`, `Requisition: ${req.id}`, 'Status: active', 'Source: synthetic test data',
      ]) });
    }
  }
  return out;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const portal = new Client({ connectionString: process.env.PORTAL_DATABASE_URL });
  await portal.connect();

  const existing = (await portal.query('select count(*)::int as n from applications')).rows[0].n;
  if (existing && !reset) {
    console.log(`portal already has ${existing} applications; run with --reset to reload`);
    await portal.end();
    return;
  }

  if (reset) {
    await portal.query('truncate status_history, attachments, fault_log, sessions, applications, requisitions cascade');
    const ledger = new Client({ connectionString: process.env.SCREENING_DATABASE_URL });
    await ledger.connect();
    await ledger.query('truncate submittals, dead_letters, intake_events, runs restart identity cascade');
    await ledger.end();
    if (process.env.MAILPIT_INTERNAL_URL) {
      const res = await fetch(`${process.env.MAILPIT_INTERNAL_URL}/api/v1/messages`, { method: 'DELETE' }).catch(() => null);
      console.log(res && res.ok ? 'cleared the demo outbox (Mailpit)' : 'could not clear Mailpit; old emails remain');
    }
  }

  for (const r of REQUISITIONS) {
    await portal.query(`insert into requisitions (id, title, facility, city, state, boolean_screen, required_documents, criteria, recruiter_email, account_manager_email)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [r.id, r.title, r.facility, r.city, r.state, r.boolean_screen, r.required_documents,
      JSON.stringify(r.criteria.map(({ id, text, weight, must_have }) => ({ id, text, weight, must_have }))), r.recruiter, r.accountManager]);
  }

  const reqs = new Map(REQUISITIONS.map((r) => [r.id, r]));
  const apps = generateApplications();
  for (const app of apps) {
    await portal.query('insert into applications (id, requisition_id, candidate, received_at, fault) values ($1, $2, $3, $4, $5)',
      [app.id, app.requisition_id, app.candidate, app.received_at, app.fault]);
    for (const a of await attachmentsFor(app, reqs.get(app.requisition_id))) {
      await portal.query('insert into attachments (application_id, kind, filename, mime, content) values ($1, $2, $3, $4, $5)',
        [app.id, a.kind, a.filename, 'application/pdf', a.content]);
    }
  }
  await portal.query(`select setval('application_number', $1)`, [10000 + apps.length]);
  await portal.end();

  const faults = apps.filter((a) => a.fault).reduce((acc, a) => ({ ...acc, [a.fault]: (acc[a.fault] || 0) + 1 }), {});
  console.log(`seeded ${REQUISITIONS.length} requisitions and ${apps.length} applications (faults: ${JSON.stringify(faults)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
