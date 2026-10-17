'use strict';
// Code node "Normalize application".
// Turns the HTML node's raw selector output into an application.v1 record.
// A selector that returns nothing is a layout change, and it stops the run
// here with the names of the selectors that broke.
const { assertValid } = require('../lib/contract');
const { applicationV1 } = require('../lib/schemas');

const REQUIRED_FIELDS = [
  'application_id', 'requisition_id', 'received_at', 'portal_status', 'csrf_token',
  'name', 'email', 'phone', 'home_state', 'license_state', 'license_type', 'specialty', 'years', 'shift',
];

const asArray = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

function shiftValue(raw) {
  const s = String(raw).toLowerCase();
  if (s.includes('night')) return 'nights';
  if (s.includes('day')) return 'days';
  return 'any';
}

// Whitespace is collapsed here rather than by the HTML node's "clean up text"
// option, which joins wrapped lines without a space (see normalize-requisition).
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : Array.isArray(v) ? v.map(clean) : v);

function run(items, ctx) {
  const f = Object.fromEntries(Object.entries(items[0].json).map(([k, v]) => [k, clean(v)]));
  const requested = ctx.node('Start').application_id;
  const relogged = ctx.executed('Read new session');
  const cookie = ctx.node(relogged ? 'Read new session' : 'Read session').cookie;

  const missing = REQUIRED_FIELDS.filter((k) => isEmpty(f[k]));
  if (missing.length) {
    throw new Error(`[PORTAL_LAYOUT_CHANGED] selectors returned nothing for: ${missing.join(', ')}`);
  }
  if (f.application_id !== requested) {
    throw new Error(`[PORTAL_WRONG_RECORD] asked for ${requested}, the page shows ${f.application_id}`);
  }

  const urls = asArray(f.attachment_urls);
  const kinds = asArray(f.attachment_kinds);
  const names = asArray(f.attachment_names);
  const attachments = urls.map((url, i) => ({ kind: kinds[i] || 'other', url, filename: names[i] || `attachment-${i + 1}` }));

  const application = {
    schema_version: 'application.v1',
    application_id: f.application_id,
    requisition_id: f.requisition_id,
    received_at: f.received_at,
    portal_status: f.portal_status,
    csrf_token: f.csrf_token,
    candidate: {
      name: f.name,
      email: f.email,
      phone: f.phone,
      home_state: String(f.home_state).toUpperCase(),
      license_state: String(f.license_state).toUpperCase(),
      license_multistate: /multistate|compact/i.test(f.license_type),
      specialty: f.specialty,
      years_experience: Number(String(f.years).replace(/[^0-9.]/g, '')),
      shift_preference: shiftValue(f.shift),
    },
    attachments,
  };
  assertValid(applicationV1, application, 'application.v1', 'PORTAL_CONTRACT_VIOLATION');
  return [{ json: { application, cookie, relogged } }];
}

module.exports = { run };
