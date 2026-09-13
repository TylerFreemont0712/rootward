# Hint design and Socratic tutoring

## The ladder (per challenge, in `hints.md`, separated by `---`)
1. **Nudge** (free-ish): restate the goal or point at the failing test category. "The failing tests all involve empty input."
2. **Concept reminder**: name the concept and link the node. "A dict lookup with `.get(key, default)` avoids KeyError. [py.collections.dict]"
3. **Pseudocode / plan**: 3-6 lines of plan, no code.
4. **Partial solution**: the skeleton with one key part blanked, or the exact line that is wrong.
5. **Retreat** (not a hint): the full reference solution with an explanation in the format below.

Costs rise with level and with the player's mastery of the node (an expert asking for a level-2 hint pays more).
The Tutor is instructed with the requested level and must not exceed it.

## Socratic patterns for the Tutor (prompt fragments keyed by error tag)
- `off-by-one`: "What does your loop produce for the smallest input? Walk through it by hand with n=1."
- `mutating-while-iterating`: "What happens to the index when you remove an item mid-loop? Try printing i and len each iteration."
- `aliasing`: "After `b = a`, if you change b, what does a look like? Why?"
- `missing-base-case`: "When does your function stop calling itself? What input would reach that?"
- `hidden-linear-op`: "How many times does `in` scan the list across the whole loop? What structure makes membership O(1)?"
- `unquoted-variable`: "What does the shell do with `$f` when the filename has a space? Try `set -x`."
- `null-comparison`: "In SQL, what does `NULL = NULL` evaluate to? What operator tests for NULL?"
- `missing-await`: "What type is the value you are comparing? Log it. Is it the result or a promise of the result?"
- generic: "What did you expect? What did you get? Where is the first place they could diverge?"

## Retreat explanation format
1. What the task actually required (one sentence).
2. The reference solution, annotated line by line at the reader's level.
3. Why the player's approach failed (referencing their code, kindly).
4. The general pattern to remember and its node id.
5. One follow-up variant to try later (added to review).

## Rules
- Never reveal hidden test contents; describe categories only.
- Never write the full solution below level 5.
- Prefer questions that make the player run something.
- Match the player's language and level; avoid jargon not yet unlocked.
- Keep it short (under 120 words for levels 1-3).
- If the player asks a direct conceptual question, answer it (that is learning), but do not solve the task.
- Suggest Retreat after three failed Casts, framed as a good decision, not a failure.

## Hint-worthy signals to feed the Tutor
Failing test names and categories, the diff between the last two Casts, error tags detected, time since last Cast, whether Probe was ever used, mastery of the tagged nodes.

## Worked examples in Shrines
- One fully worked example with commentary; then one "faded" example (a blank to fill); then the encounter.
- Show the *wrong* approach and why it fails when the node has a famous misconception.
