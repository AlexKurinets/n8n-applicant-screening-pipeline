-- A trigger for an application whose dead letter is still open is recorded
-- as "parked" and screens nothing; only a replay may screen it again.
alter table intake_events drop constraint if exists intake_events_outcome_check;
alter table intake_events add constraint intake_events_outcome_check check (outcome in ('claimed', 'duplicate', 'parked'));
