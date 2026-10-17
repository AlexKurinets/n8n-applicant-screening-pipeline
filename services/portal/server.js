'use strict';
// Applicant portal stand-in: session-cookie login, CSRF-protected status form,
// paginated lists, attachments, a public apply endpoint that emails the intake
// mailbox, and per-application faults that mimic what the real portal did.
const crypto = require('node:crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const views = require('./views');

const pool = new Pool({ connectionString: process.env.PORTAL_DATABASE_URL });
const SESSION_MINUTES = Number(process.env.PORTAL_SESSION_MINUTES || 30);
const PAGE_SIZE = Number(process.env.PORTAL_PAGE_SIZE || 25);
const ADMIN_KEY = process.env.PORTAL_ADMIN_KEY || 'local-admin-key';
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'greenmail',
  port: Number(process.env.SMTP_PORT || 3025),
  secure: false,
  ignoreTLS: true,
});
const INTAKE_MAILBOX = process.env.INTAKE_MAILBOX || 'intake@agency.example.com';

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '25mb' }));

const q = (text, params) => pool.query(text, params);

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  const candidate = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return hash && crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

async function loadSession(req, res, next) {
  const sid = readCookie(req, 'PORTALSESSID');
  if (sid) {
    const { rows } = await q(
      `update sessions s set expires_at = now() + make_interval(mins => $2)
       from users u where s.id = $1 and s.expires_at > now() and u.username = s.username
       returning s.id, s.csrf, u.username, u.display_name`, [sid, SESSION_MINUTES]);
    if (rows[0]) req.session = rows[0];
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.session) return res.redirect(302, '/login');
  return next();
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/healthz', wrap(async (req, res) => {
  await q('select 1');
  res.json({ ok: true });
}));

app.use(wrap(loadSession));

app.get('/login', (req, res) => res.send(views.loginPage()));

app.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await q('select username, password_hash from users where username = $1', [username]);
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) {
    return res.status(200).send(views.loginPage('Unknown username or password.'));
  }
  const sid = crypto.randomBytes(24).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  await q(`insert into sessions (id, username, csrf, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [sid, username, csrf, SESSION_MINUTES]);
  res.set('Set-Cookie', `PORTALSESSID=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  return res.redirect(303, '/applications');
}));

app.post('/logout', wrap(async (req, res) => {
  if (req.session) await q('delete from sessions where id = $1', [req.session.id]);
  res.set('Set-Cookie', 'PORTALSESSID=; Path=/; Max-Age=0');
  res.redirect(303, '/login');
}));

// Public careers-site endpoint: creates an application and emails the intake
// mailbox, exactly as the real portal notified the agency.
app.post('/apply', wrap(async (req, res) => {
  const { requisition_id: reqId, candidate, attachments = [], received_at: receivedAt } = req.body || {};
  const r = await q('select id, title from requisitions where id = $1', [reqId]);
  if (!r.rows[0] || !candidate || !candidate.name) return res.status(400).json({ error: 'requisition_id and candidate are required' });
  const { rows } = await q("select 'A-' || nextval('application_number') as id");
  const id = rows[0].id;
  await q('insert into applications (id, requisition_id, candidate, received_at) values ($1, $2, $3, coalesce($4::timestamptz, now()))',
    [id, reqId, candidate, receivedAt || null]);
  for (const a of attachments) {
    await q('insert into attachments (application_id, kind, filename, mime, content) values ($1, $2, $3, $4, $5)',
      [id, a.kind, a.filename, a.mime || 'application/pdf', Buffer.from(a.content_base64, 'base64')]);
  }
  await notify(id);
  res.status(201).json({ application_id: id });
}));

async function notify(id) {
  const { rows } = await q(
    `select a.id, a.candidate->>'name' as name, r.id as req_id, r.title from applications a join requisitions r on r.id = a.requisition_id where a.id = $1`, [id]);
  const a = rows[0];
  await mailer.sendMail({
    from: 'Applicant Portal <no-reply@portal.example.com>',
    to: INTAKE_MAILBOX,
    subject: `New application ${a.id} for ${a.req_id} ${a.title}`,
    text: `${a.name} applied for ${a.req_id} (${a.title}).\nOpen the application: /applications/${a.id}\n`,
  });
}

// Re-sends a notification, the way the real portal occasionally did twice.
app.post('/admin/notify/:id', wrap(async (req, res) => {
  if (req.get('x-portal-admin-key') !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  await notify(req.params.id);
  res.json({ sent: true });
}));

app.use(requireLogin);

app.get('/', (req, res) => res.redirect(302, '/applications'));

app.get('/applications', wrap(async (req, res) => {
  const status = req.query.status || null;
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(200, Math.max(1, Number(req.query.page_size || PAGE_SIZE)));
  const where = status ? 'where a.status = $1' : '';
  const params = status ? [status] : [];
  const total = (await q(`select count(*)::int as n from applications a ${where}`, params)).rows[0].n;
  const { rows } = await q(
    `select a.id, a.requisition_id, a.status, a.candidate, a.received_at, r.title
     from applications a join requisitions r on r.id = a.requisition_id ${where}
     order by a.received_at, a.id limit ${size + 1} offset ${(page - 1) * size}`, params);
  res.send(views.listPage({ user: req.session, rows: rows.slice(0, size), status, page, hasNext: rows.length > size, total }));
}));

app.get('/applications/:id', wrap(async (req, res) => {
  const { rows } = await q('select * from applications where id = $1', [req.params.id]);
  const a = rows[0];
  if (!a) return res.status(404).send(views.errorPage(req.session, 404, 'No such application.'));

  if (a.fault === 'transient_503' || a.fault === 'session_expiry') {
    const fired = await q('select 1 from fault_log where application_id = $1 and fault = $2', [a.id, a.fault]);
    if (!fired.rows.length) {
      await q('insert into fault_log (application_id, fault) values ($1, $2)', [a.id, a.fault]);
      if (a.fault === 'transient_503') return res.status(503).send(views.errorPage(req.session, 503, 'Service temporarily unavailable.'));
      await q('delete from sessions where id = $1', [req.session.id]);
      return res.redirect(302, '/login');
    }
  }

  const req2 = (await q('select * from requisitions where id = $1', [a.requisition_id])).rows[0];
  const attachments = (await q('select id, kind, filename from attachments where application_id = $1 order by id', [a.id])).rows;
  const history = (await q('select * from status_history where application_id = $1 order by at desc, id desc', [a.id])).rows;
  res.send(views.detailPage({ user: req.session, app: a, req: req2, attachments, history, csrf: req.session.csrf, variant: a.fault }));
}));

app.post('/applications/:id/status', wrap(async (req, res) => {
  const { _csrf: csrf, status, note } = req.body || {};
  if (!csrf || csrf !== req.session.csrf) return res.status(403).send(views.errorPage(req.session, 403, 'Form expired. Reload the page and try again.'));
  if (!views.STATUS_OPTIONS.includes(status)) return res.status(400).send(views.errorPage(req.session, 400, `Unknown status "${status}".`));
  const updated = await q('update applications set status = $2, updated_at = now() where id = $1 returning id', [req.params.id, status]);
  if (!updated.rows.length) return res.status(404).send(views.errorPage(req.session, 404, 'No such application.'));
  await q('insert into status_history (application_id, status, note, actor) values ($1, $2, $3, $4)',
    [req.params.id, status, note || null, req.session.display_name]);
  return res.redirect(303, `/applications/${req.params.id}`);
}));

app.get('/attachments/:id', wrap(async (req, res) => {
  const { rows } = await q('select filename, mime, content from attachments where id = $1', [Number(req.params.id) || 0]);
  if (!rows[0]) return res.status(404).send(views.errorPage(req.session, 404, 'No such attachment.'));
  res.set('Content-Type', rows[0].mime);
  res.set('Content-Disposition', `attachment; filename="${rows[0].filename}"`);
  return res.send(rows[0].content);
}));

app.get('/requisitions', wrap(async (req, res) => {
  const { rows } = await q(`select r.*, count(a.id)::int as total, count(a.id) filter (where a.status = 'New')::int as new_count
    from requisitions r left join applications a on a.requisition_id = r.id group by r.id order by r.id`);
  res.send(views.requisitionList({ user: req.session, rows }));
}));

app.get('/requisitions/:id', wrap(async (req, res) => {
  const { rows } = await q('select * from requisitions where id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).send(views.errorPage(req.session, 404, 'No such requisition.'));
  return res.send(views.requisitionPage({ user: req.session, req: rows[0] }));
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(views.errorPage(req.session, 500, 'Unexpected error.'));
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`portal listening on ${port}`));
