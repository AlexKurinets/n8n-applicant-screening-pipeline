#!/usr/bin/env node
'use strict';
// Applies the ledger and portal schemas, writes runtime settings and creates
// the portal's two accounts. Safe to run on every start.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}

// Settings the workflows read at the start of every run. Environment-specific
// values are refreshed on each start; tunables keep any edits made in the DB.
function settingsFromEnv(env) {
  return {
    refresh: {
      portal_base_url: env.PORTAL_INTERNAL_URL || 'http://portal:8080',
      docsvc_base_url: env.DOCSVC_INTERNAL_URL || 'http://docsvc:8070',
      llm_base_url: env.LLM_BASE_URL || 'http://fake-llm:8060',
      model: env.LLM_MODEL || 'claude-opus-5-5',
    },
    keep: {
      effort: 'medium',
      max_tokens: 16000,
      thresholds: { shortlist: 75, review: 50 },
      min_resume_chars: 200,
      notify_from: 'screening@agency.example.com',
      ops_email: 'ops@agency.example.com',
    },
  };
}

async function applySql(url, files) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) await client.query(fs.readFileSync(file, 'utf8'));
  } finally {
    await client.end();
  }
}

async function main() {
  const root = path.join(__dirname, '..');
  const ledgerDir = path.join(root, 'db', 'screening');
  const ledgerFiles = fs.readdirSync(ledgerDir).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(ledgerDir, f));
  await applySql(process.env.SCREENING_DATABASE_URL, ledgerFiles);
  await applySql(process.env.PORTAL_DATABASE_URL, [path.join(root, 'services', 'portal', 'schema.sql')]);

  const ledger = new Client({ connectionString: process.env.SCREENING_DATABASE_URL });
  await ledger.connect();
  const { refresh, keep } = settingsFromEnv(process.env);
  for (const [key, value] of Object.entries(refresh)) {
    await ledger.query(`insert into settings (key, value) values ($1, $2::jsonb)
      on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);
  }
  for (const [key, value] of Object.entries(keep)) {
    await ledger.query('insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do nothing', [key, JSON.stringify(value)]);
  }
  await ledger.end();

  const portal = new Client({ connectionString: process.env.PORTAL_DATABASE_URL });
  await portal.connect();
  const accounts = [
    ['screening-bot', 'Screening workflow', process.env.PORTAL_BOT_PASSWORD || 'local-demo-only'],
    ['recruiter', 'Dana Whitlock (recruiter)', process.env.PORTAL_RECRUITER_PASSWORD || 'local-demo-only'],
  ];
  for (const [username, display, password] of accounts) {
    await portal.query(`insert into users (username, display_name, password_hash) values ($1, $2, $3)
      on conflict (username) do update set display_name = excluded.display_name, password_hash = excluded.password_hash`,
    [username, display, hashPassword(password)]);
  }
  await portal.end();
  console.log(`migrated: ledger (${ledgerFiles.length} file(s)), portal schema, ${Object.keys(refresh).length + Object.keys(keep).length} settings, 2 portal accounts`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { settingsFromEnv };
