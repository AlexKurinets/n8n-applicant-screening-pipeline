-- Run ledger for the screening workflows. n8n keeps its own tables in the
-- "n8n" database; this database holds what the dashboard and replays need.

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row per screening attempt. The partial unique index is the intake's
-- idempotency key: an application can have at most one live claim, so the
-- mailbox trigger and the sweep can both see it without double-processing.
create table if not exists runs (
  id bigserial primary key,
  application_id text not null,
  source text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  n8n_execution_id text,
  outcome text,
  reason text,
  note text,
  requisition_id text,
  score int,
  band text,
  status_written boolean,
  relogged boolean,
  content_hash text,
  resume_chars int,
  prefilter jsonb,
  screening jsonb,
  usage jsonb,
  submittal jsonb,
  error_code text,
  error_detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists runs_one_live_claim on runs (application_id) where status in ('processing', 'completed');
create index if not exists runs_started_at on runs (started_at desc);

-- Every trigger that reached the claim step, including the duplicates it skipped.
create table if not exists intake_events (
  id bigserial primary key,
  application_id text not null,
  source text not null,
  outcome text not null check (outcome in ('claimed', 'duplicate')),
  run_id bigint references runs (id),
  received_at timestamptz not null default now()
);

create table if not exists dead_letters (
  id bigserial primary key,
  application_id text,
  run_id bigint references runs (id),
  source text,
  error_code text not null,
  error_detail text,
  failed_node text,
  workflow text,
  retryable boolean not null default false,
  n8n_execution_id text,
  created_at timestamptz not null default now(),
  replay_requested_at timestamptz,
  replayed_at timestamptz,
  replay_outcome text
);
create index if not exists dead_letters_open on dead_letters (created_at desc) where replayed_at is null;

-- At most one submittal email per application, whatever replays happen.
create table if not exists submittals (
  application_id text primary key,
  run_id bigint references runs (id),
  document_name text,
  message_id text,
  reserved_at timestamptz not null default now(),
  sent_at timestamptz
);
