-- The applicant portal stand-in. In production this was a hosted applicant
-- tracking system with no write API; here it is a small server-rendered app
-- with the same behaviour the workflow has to cope with.

create table if not exists users (
  username text primary key,
  display_name text not null,
  password_hash text not null
);

create table if not exists sessions (
  id text primary key,
  username text not null references users (username),
  csrf text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists requisitions (
  id text primary key,
  title text not null,
  facility text not null,
  city text not null,
  state text not null,
  boolean_screen text not null,
  required_documents text[] not null,
  criteria jsonb not null,
  recruiter_email text not null,
  account_manager_email text not null
);

create table if not exists applications (
  id text primary key,
  requisition_id text not null references requisitions (id),
  status text not null default 'New',
  candidate jsonb not null,
  received_at timestamptz not null,
  fault text,
  updated_at timestamptz not null default now()
);
create index if not exists applications_status on applications (status, received_at);

create table if not exists attachments (
  id serial primary key,
  application_id text not null references applications (id),
  kind text not null,
  filename text not null,
  mime text not null,
  content bytea not null
);

create table if not exists status_history (
  id serial primary key,
  application_id text not null references applications (id),
  status text not null,
  note text,
  actor text not null,
  at timestamptz not null default now()
);

-- Faults that fire once per application are recorded here when they fire.
create table if not exists fault_log (
  id serial primary key,
  application_id text not null,
  fault text not null,
  at timestamptz not null default now()
);

create sequence if not exists application_number start 10001;
