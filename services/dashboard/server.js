'use strict';
// Screening dashboard: reads the run ledger, links each run to its portal
// record and its n8n execution, and replays dead letters through n8n.
const express = require('express');
const { Pool } = require('pg');
const q = require('./queries');
const views = require('./views');

const db = new Pool({ connectionString: process.env.SCREENING_DATABASE_URL });
const N8N_INTERNAL = process.env.N8N_INTERNAL_URL || 'http://n8n:5678';
const DOCSVC_INTERNAL = process.env.DOCSVC_INTERNAL_URL || 'http://docsvc:8070';
const links = {
  n8n: process.env.N8N_PUBLIC_URL || 'http://localhost:5678',
  portal: process.env.PORTAL_PUBLIC_URL || 'http://localhost:8085',
  mail: process.env.MAILPIT_PUBLIC_URL || 'http://localhost:8025',
};

const app = express();
app.disable('x-powered-by');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function settings() {
  const { rows } = await db.query('select jsonb_object_agg(key, value) as s from settings');
  return rows[0].s || {};
}

app.get('/healthz', wrap(async (req, res) => {
  await db.query('select 1');
  res.json({ ok: true });
}));

app.get('/', wrap(async (req, res) => {
  const [s, outcomes, bins, clauses, reqs, recent, cfg] = await Promise.all([
    q.summary(db), q.outcomes(db), q.scoreHistogram(db), q.failedClauses(db), q.requisitions(db), q.runs(db, { limit: 12 }), settings(),
  ]);
  res.send(views.overviewPage({ s, outcomes, bins, clauses, reqs, recent, settings: cfg, links }));
}));

app.get('/runs', wrap(async (req, res) => {
  const outcome = req.query.outcome || null;
  const requisition = req.query.requisition || null;
  const rows = await q.runs(db, { outcome, requisition, limit: 200 });
  res.send(views.runsPage({ rows, outcome, requisition, outcomes: [...q.OUTCOME_ORDER, 'Dead letter'], links }));
}));

app.get('/runs/:id', wrap(async (req, res) => {
  const r = await q.run(db, Number(req.params.id) || 0);
  if (!r) return res.status(404).send(views.layout({ title: 'Not found', active: 'Runs', body: '<p>No such run.</p>', links }));
  return res.send(views.runPage({ r, links }));
}));

// A stable link by application, whatever its run number turned out to be.
app.get('/applications/:id', wrap(async (req, res) => {
  const { rows } = await db.query('select id from runs where application_id = $1 order by id desc limit 1', [req.params.id]);
  if (!rows[0]) return res.status(404).send(views.layout({ title: 'Not found', active: 'Runs', body: '<p>No run for that application yet.</p>', links }));
  return res.redirect(302, `/runs/${rows[0].id}`);
}));

app.get('/dead-letters', wrap(async (req, res) => {
  res.send(views.deadLettersPage({ rows: await q.deadLetters(db), flash: req.query.flash, links }));
}));

app.post('/dead-letters/:id/replay', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  let flash;
  try {
    const r = await fetch(`${N8N_INTERNAL}/webhook/screening/replay`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dead_letter_id: id }),
    });
    const body = await r.json().catch(() => ({}));
    flash = body.replayed
      ? `Dead letter #${id} replayed: ${body.application_id} → ${body.outcome}.`
      : `Dead letter #${id} did not go through: ${body.error_code || body.error || `n8n answered ${r.status}`}. A new dead letter records why.`;
  } catch (e) {
    flash = `Could not reach n8n: ${e.message}`;
  }
  res.redirect(303, `/dead-letters?flash=${encodeURIComponent(flash)}`);
}));

app.get('/documents/:name', wrap(async (req, res) => {
  const r = await fetch(`${DOCSVC_INTERNAL}/documents/${encodeURIComponent(req.params.name)}`);
  if (!r.ok) return res.status(r.status).send('Document not found');
  res.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
  res.set('Content-Disposition', r.headers.get('content-disposition') || 'attachment');
  return res.send(Buffer.from(await r.arrayBuffer()));
}));

// The same figures as JSON, for the e2e tests and anyone scripting against it.
app.get('/api/summary', wrap(async (req, res) => {
  const [s, outcomes, bins, reqs] = await Promise.all([q.summary(db), q.outcomes(db), q.scoreHistogram(db), q.requisitions(db)]);
  res.json({ summary: s, outcomes, score_histogram: bins, requisitions: reqs });
}));
app.get('/api/runs', wrap(async (req, res) => res.json(await q.runs(db, { limit: Number(req.query.limit) || 500 }))));
app.get('/api/dead-letters', wrap(async (req, res) => res.json(await q.deadLetters(db))));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Unexpected error');
});

const port = Number(process.env.PORT || 8090);
app.listen(port, () => console.log(`dashboard listening on ${port}`));
