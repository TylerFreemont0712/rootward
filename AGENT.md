# AGENT.md — standing instructions for any AI agent working on Rootward

This file is the durable working agreement. `PROMPT.md` is the original design and build spec (read it first in a
new session); `ideas/` is reference material; `docs/` holds the living project documentation. When this file and
`PROMPT.md` disagree about *how to work*, this file wins; when they disagree about *what to build*, the ADRs in
`docs/decisions/` win, then `PROMPT.md` (the ADRs are newer and record where the build has moved on). `CLAUDE.md` is a
single line `@AGENT.md` plus the project's commands and code conventions.

## 1. What this project is
Rootward is a programming-education game where every fight is a real programming task executed in a sandbox. Today
it has three modes, chosen from a main menu:
- **The World**: an RPG of towns, people, quests, and code-graded fights. Classes are engineering disciplines, and the
  skill graph is a curriculum; a learner model turns evidence into mastery.
- **Shardrun**: a roguelite in which found shards of real code chain into spells that run in the sandbox. Damage
  compounds, and Big-O prices the cast.
- **Shardrun (Experimental)**: the same climb as a deckbuilder.

An optional, hot-swappable AI layer (tutor, narrator, content forge, reviewer, adversary) is designed and not yet built.
The user is both the sole player and the maintainer of this codebase, and is using it to become a much better
programmer. They playtest often and send notes, and their daughters are meant to play it too, in Japanese. Both the
game and the codebase are learning artifacts. Expandability is a hard requirement.

## 2. Read order at the start of a session
1. This file and `CLAUDE.md`.
2. `WIP.md` at the repository root if it exists: the player's current list, and the focus of the session.
3. `docs/ROADMAP.md` ("Next session: start here", then the milestone lists) and `docs/PLAYTEST_NOTES.md`, then the
   latest ADRs and `docs/ARCHITECTURE.md` for the parts being touched.
4. `PROMPT.md` (skim if already familiar; read sections 15-18 fully for milestone work).
5. `ideas/README.md`, then only the `ideas/` files relevant to the task. For client work, also `mockups/README.md`.
6. `git log --oneline -30` and `git status`.
Then state, in one short message, what you are picking up and why, ask any blocking questions in the same message,
and proceed.

## 3. Core rules
- **Real execution or nothing.** No mechanic is faked. Code runs in a runner; grades come from tests, rubrics
  with quoted evidence, or deterministic checks. A Shardrun preview is a real run, and a cast must land exactly what
  its preview said.
- **Data-driven.** Content, classes, enemies, items, realms, skills, shards, relics, foes, layers, zones, NPCs,
  quests, prompts, AI routing, balance numbers, and art prompts live in `content/`, `config/`, and
  `scripts/art/manifest.json`. Adding content never requires engine changes. If it does, that is a bug to fix in the
  engine.
- **Deterministic core, optional AI.** `packages/core` is pure and seeded. The game must run with zero AI
  providers. AI degrades gracefully, never gates.
- **Sandbox invariants.** Player and AI-generated code never run outside a runner. Hidden tests and run seeds never
  leave the backend. API keys never reach the client. No network in sandboxes unless the challenge declares it. No
  telemetry.
- **Small vertical slices.** Every increment leaves `pnpm dev` runnable and `pnpm test` green. Commit after each
  meaningful step with conventional commit messages. Never push unless asked. Before a large engine change, commit
  and tag a checkpoint the player can go back to.
- **Protect what the player loves.** The spellbook Shardrun is the player's favorite. Try new ideas as their own
  playstyle, option, or mode, rather than changing it as a side effect.
- **Strict quality.** TypeScript strict, no `any`, zod at every I/O boundary, no silent catches, small files,
  clear names, tests for core and runners first. Verify library APIs against installed packages or docs; do not
  guess. Pin versions. Verify client changes in a real browser (headless Chromium screenshots) before calling them
  done.
- **Assets are optional.** Art is generated locally (`scripts/art/`) and listed in the client's asset catalog, and
  every picture has a fallback. Pick art by how it reads in the game (foes composited in, at the size it is drawn),
  not in isolation.
- **Docs are part of the work.** Update `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and write an ADR
  (`docs/decisions/ADR-NNNN-title.md`) for any decision a future reader could reasonably question.
- **Teaching mode.** Leave concise `// LEARN:` comments where a decision or language feature is non-obvious.
  Maintain `docs/LEARNING_LOG.md` (things worth understanding in this codebase, with file pointers). Tag a few
  small tasks in `ROADMAP.md` as **Your Turn (easy/medium/hard)** for the user; never block on them.
- **Report faithfully.** If tests fail, show the output. If something is skipped or partial, say so. Do not claim
  completion without running the verification. When a report from the player could have more than one cause,
  measure before fixing, and say what was found.
- **Decide by the pillars.** When the spec is silent, choose the option most consistent with `PROMPT.md`
  section 2, write it down in an ADR, and continue. Ask the user only when the readings would lead to materially
  different work, when an action is destructive or outward-facing, or when a change would reverse something the
  player asked for earlier (check the ADRs' quotes of their notes).

## 4. Definition of done (any task)
Code compiles under strict TS; tests added or updated and green; `pnpm lint` clean; content validated if content
changed; `pnpm test:e2e` green if a screen changed; docs updated; ADR written if a decision was made; a
one-paragraph summary in the final message with what changed, how it was verified, and what is next.

## 5. How to add things (contracts live in `ideas/solutions/plugin-architecture.md` until `docs/EXTENDING.md` exists)
- **Challenge**: a folder under `content/packs/core/challenges/<realm>/<id>/`, then `pnpm content:validate`. The
  reference example is `content/packs/core/challenges/foundry/tally-wisp/` (two languages, visible and hidden io tests).
  Quality checklist in `ideas/solutions/content-pipeline.md`. Pull ideas from
  `ideas/game-content/challenge-bank.md` and the "Challenge ideas" sections of `ideas/theory/*.md`.
- **Skill node**: add to `content/packs/<pack>/skills/*.yaml` with prerequisites and evidence tags; validate
  acyclicity. Sequencing guidance in `ideas/pedagogy/curriculum-sequencing.md`.
- **Class**: `content/packs/<pack>/classes/<id>/{class.yaml,abilities.yaml,lore.md}` with a `status` (`planned` until
  its fights exist); abilities compose effect primitives; write TS effects only when a primitive is missing (then add
  the primitive, not a one-off).
- **Enemy / Artifact**: YAML in the pack; moves and effects by id from the registries.
- **Place, person, or quest in the World**: `zones/`, `npcs/`, `quests/`, `props.yaml`, `terrain.yaml` (ADR-0011);
  conditions and effects come from `packages/core/src/world/`.
- **Shard**: `content/packs/<pack>/shardrun/shards/<id>.yaml` with the same function in Python and JavaScript, a
  complexity class, and worked examples that validation runs (ADR-0012, ADR-0015). Any `draftable` shard joins the
  reward pool by rarity, and so does the deck playstyle's card pool.
- **Relic**: `shardrun/relics/<id>.yaml` built from the effect kinds in `packages/content-schema/src/shardrun.ts`,
  with `playstyles` when it only makes sense in one. **Foe**: `shardrun/foes/<id>.yaml` with a `size`, intents, and
  a trait. **Layer**: `shardrun/run.yaml`, with its arena and guardian's arena named by art id.
- **Translation**: UI strings in `apps/client/src/i18n/<locale>.ts`, content in
  `content/packs/<pack>/locales/<locale>/`, keyed by the English text; check with `pnpm content:locale <locale>`.
- **Art**: an entry in `scripts/art/manifest.json` (a style plus a prompt; img2img layouts in `scripts/art/layouts.py`),
  rendered with `scripts/art/generate.py`, listed in `apps/client/src/assets/AssetRegistry.ts`, and described in
  `assets/README.md`.
- **Runner**: implement the `Runner` interface in `packages/runners`, add a test adapter per
  `ideas/solutions/test-harness-per-language.md`, add the malicious-suite test, register it.
- **AI role** (M2): prompt file in `config/prompts/`, zod schema, typed call in `packages/ai`, config entry, fake
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
- Do not run `pnpm format` on the tree (it was never formatted as a whole), and do not commit `WIP.md`.
- Do not stop or restart the player's running Rootward (the launcher's server on port 7331); test on another port.

## 7. Session end checklist
Update `docs/ROADMAP.md` (done / next / blockers), `docs/ARCHITECTURE.md` if a part changed shape,
`docs/LEARNING_LOG.md`, `docs/PLAYTEST_NOTES.md` if you played or measured, and `WIP.md` (what was built from it,
without committing it), commit, and write the final summary, including anything the player must do to see the
changes (a reload, or a launcher restart for server changes). If you have a memory system, record only non-derivable
facts (user preferences, decisions made in conversation, external references).

## 8. Ready-to-use prompts for future sessions
- **Continue**: "Read AGENT.md, then WIP.md and docs/ROADMAP.md. Pick up the next unfinished item and complete it to
  the definition of done."
- **Playtest notes**: "Read AGENT.md. I played and wrote notes in WIP.md. Address every point, measuring before
  fixing, and tell me what you found."
- **Add a class**: "Read AGENT.md and PROMPT.md section 6. Implement the <Class> class: data files, its first two
  abilities, and one run's worth of content (>= 8 encounters, 1 boss, 20 cards) drawing on ideas/theory/<file>.md.
  Validate content and add tests."
- **Author content**: "Read AGENT.md. Author 10 challenges for node <id> at difficulties 2-6 in <language>, with hint
  ladders and hidden tests covering the tags in ideas/game-content/error-tag-taxonomy.md. Validate all of them."
- **Shardrun content**: "Read AGENT.md and ADR-0012 to ADR-0016. Add <n> shards around <idea>, each a real function in
  Python and JavaScript with worked examples, and a relic that rewards them. Validate, and check a build with them
  in a sandbox run."
- **Playtest and fix**: "Read AGENT.md. Run the app, play one full run as <class> with seed <n>, log every friction
  point to docs/PLAYTEST_NOTES.md, then fix the top three."
- **Refactor a subsystem**: "Read AGENT.md and the ADR for <subsystem>. Propose a refactor plan with tests first,
  then execute it in small commits."
- **Write an ADR**: "Read AGENT.md. Write ADR-NNNN for <decision>: context, options considered (with the trade-offs
  from ideas/solutions/<file>.md), decision, consequences."
- **New realm**: "Read AGENT.md, PROMPT.md section 4, and ideas/theory/<domain>.md. Add the <Realm> realm: skill
  nodes, 3 enemies, 12 challenges, 1 boss, lore per ideas/game-content/lore-and-narrative.md."
