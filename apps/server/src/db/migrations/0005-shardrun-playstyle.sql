-- Shardrun playstyles (ADR-0020). A character keeps one run in progress per playstyle, so an experimental deck run and a
-- spellbook run can both be underway. Every run saved before this was a spellbook run.
ALTER TABLE shardrun_runs ADD COLUMN playstyle TEXT NOT NULL DEFAULT 'spellbook';

CREATE INDEX shardrun_runs_by_profile_and_playstyle ON shardrun_runs (profile_id, playstyle, created_at);
