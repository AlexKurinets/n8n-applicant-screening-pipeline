#!/usr/bin/env bash
# Runs every operator sequence the README documents, against a running stack
# (docker compose up -d --wait), and fails on the first surprise.
#   1. reset the data, run the sweep, wait, and check the seeded week (e2e suite)
#   2. a new application arrives by email and is screened through IMAP
#   3. the same notification arrives twice and the second is skipped
#   4. the model is down: the run dead-letters, then replays once it is back
set -euo pipefail
cd "$(dirname "$0")/.."

DASHBOARD="http://localhost:${DASHBOARD_PORT:-8090}"
N8N="http://localhost:${N8N_PORT:-5678}"
cli() { docker compose run --rm -T cli "$@"; }
sql() { docker compose exec -T postgres psql -U pipeline -d screening -At -c "$1"; }
step() { printf '\n== %s\n' "$*"; }
wait_for() { # wait_for <description> <sql returning a single value> <expected>
  for _ in $(seq 1 60); do
    [ "$(sql "$2")" = "$3" ] && { echo "ok: $1"; return 0; }
    sleep 2
  done
  echo "FAILED: $1 (last value: $(sql "$2"))"; exit 1
}

step "Reset the synthetic week and clear the outbox"
docker compose run --rm -T seed node scripts/seed.js --reset

step "Run the reconciliation sweep and wait for it to settle"
curl -fsS -X POST "$N8N/webhook/screening/sweep" -H 'content-type: application/json' -d '{}'
echo
cli wait --min 160

step "Check the seeded week against the offline prediction"
npm run --silent test:e2e

step "A second sweep and a repeat notification leave parked applications alone"
curl -fsS -X POST "$N8N/webhook/screening/sweep" -H 'content-type: application/json' -d '{}'
echo
sleep 8
cli wait --min 160
wait_for "still 160 runs" "select count(*) from runs" "160"
wait_for "still 2 dead letters" "select count(*) from dead_letters" "2"
cli duplicate-notification A-10025
wait_for "the repeat notification for A-10025 was parked"   "select count(*) from intake_events where application_id = 'A-10025' and outcome = 'parked'" "1"
wait_for "still 2 dead letters" "select count(*) from dead_letters" "2"

step "A new application arrives by email (IMAP fast path)"
cli new-application
wait_for "A-10161 shortlisted through the mailbox" \
  "select outcome || '/' || source from runs where application_id = 'A-10161' and status = 'completed'" "Shortlisted/imap"
wait_for "its Word submittal was sent" "select count(*) from submittals where application_id = 'A-10161' and sent_at is not null" "1"

step "The portal sends the same notification twice"
cli duplicate-notification A-10161
wait_for "the second notification was skipped" \
  "select count(*) from intake_events where application_id = 'A-10161' and outcome = 'duplicate'" "1"
wait_for "still one run for A-10161" "select count(*) from runs where application_id = 'A-10161'" "1"

step "The model API is down: dead letter, then replay"
cli llm-outage on
cli new-application
wait_for "A-10162 dead-lettered as LLM_UNAVAILABLE" \
  "select error_code || '/' || failed_node || '/' || retryable from dead_letters where application_id = 'A-10162'" \
  "LLM_UNAVAILABLE/Claude: rate criteria/true"
cli llm-outage off
DL=$(sql "select id from dead_letters where application_id = 'A-10162' and replayed_at is null")
curl -fsS -o /dev/null -X POST "$DASHBOARD/dead-letters/$DL/replay"
wait_for "the replay shortlisted A-10162" "select replay_outcome from dead_letters where id = $DL" "Shortlisted"
wait_for "the replay sent one submittal" "select count(*) from submittals where application_id = 'A-10162' and sent_at is not null" "1"

step "Final ledger"
cli summary
echo
echo "smoke: all documented sequences passed"
