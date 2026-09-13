# AGENT.md — standing instructions for any AI agent working on ProgramMe / Rootward

This file is the durable working agreement. `PROMPT.md` is the original design and build spec (read it first in a
new session); `ideas/` is reference material; `docs/` holds the living project documentation once it exists. When
this file and `PROMPT.md` disagree about *how to work*, this file wins; when they disagree about *what to build*,
`PROMPT.md` and the ADRs in `docs/decisions/` win. Suggested `CLAUDE.md` content: a single line `@AGENT.md` plus
the project's run/test commands.

## 1. What this project is
Rootward is a turn-based roguelike where every fight is a real programming, shell, SQL, testing, or security task
executed in a sandbox; classes are engineering disciplines; the skill graph is a curriculum with spaced repetition;
an optional, hot-swappable AI layer plays tutor, narrator, content forge, reviewer, and adversary. The user is both
the sole player and the maintainer of this codebase, and is using it to become a much better programmer. Both the
game and the codebase are learning artifacts. Expandability is a hard requirement.

## 2. Read order at the start of a session
1. This file.
2. `PROMPT.md` (skim if already familiar; read sections 15-18 fully).
3. `docs/ROADMAP.md` and `docs/PLAYTEST_NOTES.md` (current state and open issues), then the latest ADRs.
4. `ideas/README.md`, then only the `ideas/` files relevant to the milestone at hand. For client work, also
   `mockups/README.md` and the mock itself.
5. `git log --oneline -30` and `git status`.
Then state, in one short message, what milestone/task you are picking up and why, ask any blocking questions in
the same message, and proceed.

## 3. Core rules
- **Real execution or nothing.** No mechanic is faked. Code runs in a runner; grades come from tests, rubrics
  with quoted evidence, or deterministic checks.
- **Data-driven.** Content, classes, enemies, items, realms, skills, prompts, AI routing, balance numbers live in
  `content/` and `config/`. Adding content never requires engine changes. If it does, that is a bug to fix in
  the engine.
- **Deterministic core, optional AI.** `packages/core` is pure and seeded. The game must run with zero AI
  providers. AI degrades gracefully, never gates.
- **Sandbox invariants.** Player and AI-generated code never run outside a runner. Hidden tests never leave the
  backend. API keys never reach the client. No network in sandboxes unless the challenge declares it. No
  telemetry.
- **Small vertical slices.** Every increment leaves `pnpm dev` runnable and `pnpm test` green. Commit after each
  meaningful step with conventional commit messages. Never push unless asked.
- **Strict quality.** TypeScript strict, no `any`, zod at every I/O boundary, no silent catches, small files,
  clear names, tests for core and runners first. Verify library APIs against installed packages or docs; do not
  guess. Pin versions.
- **Docs are part of the work.** Update `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and write an ADR
  (`docs/decisions/ADR-NNNN-title.md`) for any decision a future reader could reasonably question.
- **Teaching mode.** Leave concise `// LEARN:` comments where a decision or language feature is non-obvious.
  Maintain `docs/LEARNING_LOG.md` (things worth understanding in this codebase, with file pointers). Tag a few
  small tasks in `ROADMAP.md` as **Your Turn (easy/medium/hard)** for the user; never block on them.
- **Report faithfully.** If tests fail, show the output. If something is skipped or partial, say so. Do not claim
  completion without running the verification.
- **Decide by the pillars.** When the spec is silent, choose the option most consistent with `PROMPT.md`
  section 2, write it down in an ADR, and continue. Ask the user only when the readings would lead to materially
  different work or when an action is destructive or outward-facing.

## 4. Definition of done (any task)
Code compiles under strict TS; tests added or updated and green; `pnpm lint` clean; content validated if content
changed; docs updated; ADR written if a decision was made; a one-paragraph summary in the final message with what
changed, how it was verified, and what is next.

## 5. How to add things (contracts live in `ideas/solutions/plugin-architecture.md` until `docs/EXTENDING.md` exists)
- **Challenge**: `pnpm content:new challenge` -> fill files -> `pnpm content:validate`. The reference example is
  `content/packs/core/challenges/foundry/tally-wisp/` (two languages, visible + hidden io tests). Quality checklist in
  `ideas/solutions/content-pipeline.md`. Pull ideas from `ideas/game-content/challenge-bank.md` and the
  "Challenge ideas" sections of `ideas/theory/*.md`.
- **Skill node**: add to `content/packs/<pack>/skills/*.yaml` with prerequisites and evidence tags; validate
  acyclicity. Sequencing guidance in `ideas/pedagogy/curriculum-sequencing.md`.
- **Class**: `content/packs/<pack>/classes/<id>/{class.yaml,abilities.yaml,lore.md}`; abilities compose effect
  primitives; write TS effects only when a primitive is missing (then add the primitive, not a one-off).
- **Enemy / Artifact**: YAML in the pack; moves and effects by id from the registries.
- **Runner**: implement the `Runner` interface in `packages/runners`, add a test adapter per
  `ideas/solutions/test-harness-per-language.md`, add the malicious-suite test, register it.
- **AI role**: prompt file in `config/prompts/`, zod schema, typed call in `packages/ai`, config entry, fake
  provider fixture, eval case.
- **Room type**: controller in core, panel in client, registry entries, a generator if puzzle-like.

## 6. Things not to do
- Do not add an "AI writes the solution" feature. The Tutor hints; the player codes.
- Do not build multiplayer, accounts, cloud sync, monetization, mobile, real-time combat.
- Do not make assets required; `assets/` is optional material with glyph/silent fallbacks.
- Do not copy the mockup's page-local JavaScript into the client; rebuild its screens on the engine and real
  components.
- Do not enable the unsandboxed `process` runner by default.
- Do not hardcode balance numbers, model ids (beyond documented defaults), or content in engine code.
- Do not relitigate `[DECIDED]` sections of `PROMPT.md` unless the user asks.
- Do not expand scope beyond the current milestone's DoD without noting it in `ROADMAP.md`.

## 7. Session end checklist
Update `docs/ROADMAP.md` (done / next / blockers), `docs/LEARNING_LOG.md`, `docs/PLAYTEST_NOTES.md` if you played,
commit, and write the final summary. If you have a memory system, record only non-derivable facts (user
preferences, decisions made in conversation, external references).

## 8. Ready-to-use prompts for future sessions
- **Continue**: "Read AGENT.md, then docs/ROADMAP.md. Pick up the next unfinished item in the current milestone and
  complete it to the definition of done."
- **Add a class**: "Read AGENT.md and PROMPT.md section 6. Implement the <Class> class: data files, its first two
  abilities, and one run's worth of content (>= 8 encounters, 1 boss, 20 cards) drawing on ideas/theory/<file>.md.
  Validate content and add tests."
- **Author content**: "Read AGENT.md. Author 10 challenges for node <id> at difficulties 2-6 in <language>, with hint
  ladders and hidden tests covering the tags in ideas/game-content/error-tag-taxonomy.md. Validate all of them."
- **Playtest and fix**: "Read AGENT.md. Run the app, play one full run as <class> with seed <n>, log every friction
  point to docs/PLAYTEST_NOTES.md, then fix the top three."
- **Refactor a subsystem**: "Read AGENT.md and the ADR for <subsystem>. Propose a refactor plan with tests first,
  then execute it in small commits."
- **Write an ADR**: "Read AGENT.md. Write ADR-NNNN for <decision>: context, options considered (with the trade-offs
  from ideas/solutions/<file>.md), decision, consequences."
- **New realm**: "Read AGENT.md, PROMPT.md section 4, and ideas/theory/<domain>.md. Add the <Realm> realm: skill
  nodes, 3 enemies, 12 challenges, 1 boss, lore per ideas/game-content/lore-and-narrative.md."
