# Content pipeline

## Authoring flow (human)
1. `pnpm content:new challenge` -> scaffold with prompts for realm, kind, concepts, languages, difficulty.
2. Write `prompt.md`, starter, tests (visible + hidden), reference solution, `hints.md` (4 levels), flavor.
3. `pnpm content:validate <path>` -> schema, references, execution (reference passes all tests; a deliberately broken variant, if provided in `wrong/`, fails), static constraints satisfiable, hint count, estimated minutes present.
4. Playtest in the Testing Grounds; adjust difficulty; commit.
5. CI runs `content:validate` on all packs; a coverage report (`content:stats`) is posted as a build artifact.

## Generation flow (Forge)
1. Input: node id, difficulty, language, optional template challenge id, count.
2. Prompt with the challenge schema, the node summary, 2 example challenges of similar difficulty (few-shot), the misconception tags for the node, and explicit requirements (hidden tests must cover: empty input, boundary, large input for the band; tests need names; solution idiomatic).
3. Model returns JSON (challenge fields + files); zod validation; on failure retry once with errors.
4. Execution validation in the sandbox: reference passes all tests; each of 2 requested "plausible wrong" solutions fails at least one test; time band achievable by the reference; static constraints satisfiable.
5. Deduplication: compare title and prompt to existing content (token-set similarity; embeddings optional); reject near-duplicates.
6. Optional second-model review for clarity and difficulty (rubric); attach the review.
7. Write to `content/generated/<pack>/<id>/` with `generated: { model, provider, promptHash, validatedAt, validatorVersion, review }`.
8. UI: the Bastion's generated-content browser lists items with "play", "promote to community pack", "edit", "delete".

## Difficulty calibration
`content:stats` shows per challenge: attempts, unaided pass rate, mean Casts, mean minutes, hint usage. Suggest a
difficulty adjustment when realized pass rate diverges from the expected band for its rating over >= 5 attempts.

## Versioning
- `challenge.version` bumps when tests or the prompt change materially; attempts record the version; the planner
  treats a new version as new for recency; mastery evidence remains valid.
- Packs use semver; the engine records pack versions in each run.

## Quality checklist (blocking in review)
Clear task in <= 150 words; examples in the prompt match the visible tests; hidden tests cover the tag list for the
node; reference solution is idiomatic and commented for Retreat; hints escalate without leaking; flavor does not
change the task; estimated minutes realistic; no external network needed.

## Deprecation
Mark `deprecated: true` with a `replacedBy`; the planner excludes deprecated content; history keeps working.
