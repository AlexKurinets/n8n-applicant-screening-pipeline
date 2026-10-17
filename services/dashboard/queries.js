'use strict';
// Every figure on the dashboard comes from these queries over the run ledger
// the workflows write. Nothing is cached or hard-coded.

const OUTCOME_ORDER = ['Shortlisted', 'Recruiter review', 'Low match', 'Screened out', 'Incomplete', 'Manual review'];

async function summary(db) {
  const totals = (await db.query(`
    with latest as (
      select distinct on (application_id) * from runs order by application_id, id desc
    )
    select
      count(*)::int as applications,
      count(*) filter (where status = 'completed')::int as completed,
      count(*) filter (where status = 'processing')::int as in_progress,
      count(*) filter (where outcome = 'Screened out')::int as screened_out,
      count(*) filter (where score is not null)::int as scored,
      count(*) filter (where outcome = 'Shortlisted')::int as shortlisted,
      count(*) filter (where outcome in ('Manual review', 'Incomplete'))::int as needs_person,
      count(*) filter (where relogged)::int as relogged,
      count(*) filter (where (screening->>'ungrounded')::int > 0)::int as with_ungrounded,
      percentile_cont(0.5) within group (order by extract(epoch from finished_at - started_at))
        filter (where status = 'completed') as median_seconds
    from latest`)).rows[0];
  const extra = (await db.query(`
    select
      (select count(*)::int from submittals where sent_at is not null) as submittals_sent,
      (select count(*)::int from dead_letters where replayed_at is null) as open_dead_letters,
      (select count(*)::int from dead_letters) as dead_letters_total,
      (select count(*)::int from intake_events where outcome = 'duplicate') as duplicates_skipped,
      (select count(*)::int from runs) as runs_total`)).rows[0];
  return { ...totals, ...extra, median_seconds: totals.median_seconds === null ? null : Number(totals.median_seconds) };
}

async function outcomes(db) {
  const { rows } = await db.query(`
    with latest as (select distinct on (application_id) * from runs order by application_id, id desc)
    select coalesce(outcome, case when status = 'failed' then 'Dead letter' else 'In progress' end) as outcome, count(*)::int as n
    from latest group by 1`);
  const order = [...OUTCOME_ORDER, 'Dead letter', 'In progress'];
  return rows.sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome));
}

async function scoreHistogram(db) {
  const { rows } = await db.query(`
    select least(score / 5, 19) as bin, count(*)::int as n from runs
    where status = 'completed' and score is not null group by 1 order by 1`);
  // 5-point bins, so the 50 and 75 thresholds fall on bin edges.
  const bins = Array.from({ length: 20 }, (_, i) => ({ from: i * 5, to: i * 5 + 4 + (i === 19 ? 1 : 0), n: 0 }));
  for (const r of rows) bins[r.bin].n = r.n;
  return bins;
}

async function failedClauses(db) {
  const { rows } = await db.query(`
    select clause, count(*)::int as n from runs, jsonb_array_elements_text(prefilter->'failed_clauses') as clause
    where outcome = 'Screened out' group by 1 order by 2 desc, 1 limit 8`);
  return rows;
}

async function requisitions(db) {
  const { rows } = await db.query(`
    with latest as (select distinct on (application_id) * from runs order by application_id, id desc)
    select requisition_id,
      count(*)::int as screened,
      count(*) filter (where outcome = 'Screened out')::int as screened_out,
      count(*) filter (where score is not null)::int as scored,
      count(*) filter (where outcome = 'Shortlisted')::int as shortlisted,
      round(avg(score))::int as avg_score
    from latest where requisition_id is not null group by 1 order by 1`);
  return rows;
}

async function runs(db, { outcome, requisition, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (outcome) { params.push(outcome); where.push(`coalesce(outcome, case when status = 'failed' then 'Dead letter' end) = $${params.length}`); }
  if (requisition) { params.push(requisition); where.push(`requisition_id = $${params.length}`); }
  params.push(limit, offset);
  const { rows } = await db.query(`
    select id, application_id, source, status, outcome, reason, requisition_id, score, band, relogged, status_written, error_code,
      (screening->>'ungrounded')::int as ungrounded, submittal, started_at, finished_at,
      extract(epoch from finished_at - started_at) as seconds
    from runs ${where.length ? `where ${where.join(' and ')}` : ''}
    order by id desc limit $${params.length - 1} offset $${params.length}`, params);
  return rows;
}

async function run(db, id) {
  const { rows } = await db.query(`select *, extract(epoch from finished_at - started_at) as seconds from runs where id = $1`, [id]);
  if (!rows[0]) return null;
  const events = (await db.query('select * from intake_events where application_id = $1 order by id', [rows[0].application_id])).rows;
  const dead = (await db.query('select * from dead_letters where application_id = $1 order by id', [rows[0].application_id])).rows;
  const others = (await db.query('select id, status, outcome, error_code, started_at from runs where application_id = $1 and id <> $2 order by id', [rows[0].application_id, id])).rows;
  return { ...rows[0], events, dead_letters: dead, other_runs: others };
}

async function deadLetters(db) {
  const { rows } = await db.query(`
    select d.*, r.requisition_id from dead_letters d left join runs r on r.id = d.run_id
    order by (d.replayed_at is null) desc, d.id desc limit 100`);
  return rows;
}

module.exports = { summary, outcomes, scoreHistogram, failedClauses, requisitions, runs, run, deadLetters, OUTCOME_ORDER };
