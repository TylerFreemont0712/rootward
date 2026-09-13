# ADR-0009: Derive the learner model from run events, and credit other-language fights through shared concepts

- **Status:** accepted
- **Date:** 2026-09-14
- **Related:** PROMPT.md sections 7.4, 9.2-9.4, 10, and 14.3-14.4; ideas/pedagogy/assessment-and-difficulty.md;
  ideas/solutions/persistence-and-event-sourcing.md; ADR-0006 (persistence), ADR-0007 (planner), ADR-0008 (run flow)

## Context
M1 needs a learner model: mastery 0-5 earned by evidence, a rating per concept for choosing challenges, Commits applied
to concept nodes, weak spots, and a semver Version, all changed only through evidence (PROMPT.md section 14.3). It
feeds the planner, hint prices, the Debrief, and the Chronicle. Two questions were open. Where does the model live?
The spec lists a `learner_nodes` table, and the persistence notes describe projections updated after each run. And how
does a JavaScript play of a Python-tagged challenge count? That second question was the roadmap's "concepts per
language" item. FSRS review cards need Rest rooms, which do not exist yet.

## Options considered
Where the model lives:
1. **Projection tables** (`learner_nodes`) updated after each fight. Fast to read, but every fight then makes two
   writes that must stay consistent, and a rule change needs a rebuild script.
2. **An evidence table** written after each fight, with the model folded from it. Evidence would snapshot content at
   the time, but it adds a second write path with the same consistency problem.
3. **Fold on demand from run events.** Nothing new to write or keep consistent, and a rule change applies to the whole
   history at once. The cost grows with history.

Credit for a fight played in another language:
- **(a)** Credit the tagged nodes whatever the language. JavaScript progress would show up as Python mastery.
- **(b)** Credit the shared concept only. Language-specific progress would be lost once `js.*` nodes exist.
- **(c)** Credit the play language's counterpart node (same topic and concept) when one exists, otherwise the shared
  concept.

## Decision
Option 3 with credit rule (c).
- **Evidence** (`packages/core/src/learner/evidence.ts`) is read from each run's events: a fight record when a fight
  ends (won, retreated, out of Focus, or a Kernel Panic mid-fight) and a dungeon record when an expedition ends.
  `EncounterStarted` now snapshots the challenge's concept tags, so later content edits do not rewrite history; events
  stored before that field existed read as tagging no concept.
- **Time** comes from the event store's append timestamps, so `packages/core` still never reads a clock.
- **Rules** (`applyEvidence` in `packages/core/src/learner/model.ts`):
  - Mastery: an unaided win reaches 3 (Unaided), a win with hints reaches 2 (Assisted), and a retreat, running out of
    Focus, or a Kernel Panic reaches 1 (Seen). Two unaided wins at least `retained_min_days_between_passes` apart reach
    4 (Retained). Mastery never drops. Level 5 (Mastered) needs a Teach-back, which waits for the AI layer.
  - Rating: Elo against the challenge's rating with `rating.actual_score` (unaided 1, assisted 0.6, any loss 0),
    clamped by `max_change_per_attempt`.
  - Commits: each credited concept receives a won fight's Commits; a boss splits them (`boss_split_across_concepts`).
  - Weak spots: the categories of hidden tests still failing when a lost fight ended, if the player cast at least once.
  - Version: a new Maintainer is 1.0.0. Each won fight adds a patch and each completed expedition a minor (resetting
    the patch). Major versions need realm bosses, which do not exist yet.
- **Server:** `LearnerService` (`apps/server/src/learner.ts`) refolds every run from `EventStore.loadAll` whenever it
  is asked. It serves the planner's snapshot (mastery, rating, and challenges played within `recency_exclusion_days`),
  hint prices (mastery of the challenge's primary concept as the play language sees it), `GET /api/learner` for the
  Chronicle, and `GET /api/runs/:runId/debrief` (the model before a run's first evidence and after its last).

## Consequences
- No new tables or migrations, nothing to keep consistent with the event log, and a changed rule rebuilds all history.
- Every snapshot loads and parses every stored event. That is fine for one player for a long time; when it is not,
  cache the model keyed by the newest event.
- Deviations to revisit:
  - A retreat counts as Seen (1), not Assisted (2), so that retreating cannot inflate mastery. The spec's table lists
    "using hints or Retreat" under Assisted.
  - The assessment notes say a retreat changes no rating, but `balance.yaml` scores it 0, and that score is what makes
    the next plan easier after a loss. The balance file wins.
  - FSRS cards, due reviews, and Bit Rot wait for Rest rooms, so snapshots have no due cards and nothing rots yet.
- JavaScript plays credit shared concept nodes today, because no `js.*` nodes exist. Once a JavaScript track exists,
  the same rule credits its nodes without any change to content.
