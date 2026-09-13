# Assessment, evidence, and difficulty modeling

## Evidence-centered design
- Decide what mastery *means* per node before writing content (see mastery levels in PROMPT.md 9.2).
- Each challenge declares which nodes it is evidence for and how strong that evidence is (`difficulty`, `tier`).
- Record every attempt as raw evidence (code, results, hints, time). Derive mastery; never edit it directly.

## Difficulty and ability models (choose one to start; keep the interface swappable)
| Model | Idea | Pros | Cons |
|---|---|---|---|
| **Elo per node** (recommended first) | Player rating per node vs challenge rating; expected P(success) = 1/(1+10^((Rc-Rp)/400)); update by K*(actual-expected). | Simple, explainable, works with a population of one. | Challenge ratings can only be calibrated by the author (no crowd). |
| Glicko-2 | Elo + rating deviation (uncertainty). | Handles cold start and long gaps better. | More code. |
| IRT (Rasch/1PL) | Same shape as Elo with a logistic model; item difficulty parameters. | Standard in assessment. | Needs data to fit; equivalent to Elo for us. |
| Bayesian Knowledge Tracing | P(known) per node with learn/guess/slip parameters. | Models learning transitions explicitly. | Parameters are guesses without data. |
| Bandits over difficulty buckets | Thompson sampling to pick the bucket that maximizes learning proxy. | Adapts without a model. | Harder to explain to the player. |

Practical rules for Elo v1: K = 32 for tier 0-1 nodes, 24 above; a pass with hints counts as 0.6, Retreat as 0, unaided pass as 1, crit as 1 (plus small bonus to rating?). Challenge rating = 1000 + 100*(difficulty-5) initially. Do not update challenge ratings from one player until there is a reason. Clamp rating moves per attempt to avoid whiplash.

## Target success rate
Aim for 0.7-0.8 P(success) on frontier encounters; 0.85-0.95 on review encounters; 0.5-0.6 on optional Elites. Track the realized rate over the last 20 encounters and nudge the target if the user reports boredom or frustration (a settings slider maps to +/- 0.1).

## Cold start
Placement: a first run of 6 short puzzles across Foundry tiers sets initial ratings (or the user self-reports a level per realm). Keep the first three runs conservative.

## Combining with spaced repetition
- FSRS governs *when* a node should be reviewed; Elo governs *which challenge* to use when it is.
- An unaided pass on an encounter tagged with a node records a "Good" review for the node's summary card; a crit records "Easy"; hints record "Hard"; Retreat records "Again".
- Bit Rot flag: retrievability < 0.7 and no exercise in 30 days.

## Rubrics for non-deterministic grading (Reviewer, Examiner)
- Analytic rubrics with 3-6 axes, 0-10, with anchor descriptions for 2, 5, 8.
- Require the model to quote the evidence (line or sentence) for each score; reject scores without quotes.
- Calibrate: keep 10 hand-graded samples per rubric in `content/evals/` and run them when prompts or models change; alert if mean absolute error > 1.5.
- Use rubric scores for bonuses, never as the sole gate for winning a fight.

## Evidence quality controls
- Retreat spam: Retreat gives no rating change but schedules review; three Retreats on one node in a week triggers a Shrine + Parsons sequence.
- Copy-paste detection is unnecessary (solo), but "solution pasted then edited" (huge first Probe passing everything within seconds) can be flagged as `suspiciously-fast` for the user's own honesty dashboard.
- Time-on-task is recorded but not scored (it is noisy and punishes thinking).

## Testing the model
Simulate learners: a script with synthetic "true skill" per node and noisy success draws; verify the planner converges to the target success rate and mastery levels climb monotonically with skill.
