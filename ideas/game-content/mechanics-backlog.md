# Mechanics backlog (ideas, not commitments)

Ordered roughly by value/effort. Each idea names the learning purpose; if it has none, it stays out.

## Modes
- **Automation realm** (Bitburner-style): a scripting API in the wasm-js runner lets the player write bots that play Puzzle rooms or optimize runs. Purpose: teach APIs, async, and automation by playing the game itself.
- **Bring Your Own Repo**: mount a user repo in a container; generate characterization/refactor/doc phases. Purpose: practice on real code.
- **Interview mode**: timed DSA sessions with a "whiteboard" (no Probe), then a debrief with complexity questions. Purpose: interview prep for `Oath of the Interview`.
- **Code golf mode**: character-count band as the win condition on known-solved challenges. Purpose: language mastery (opt-in; do not reward unreadable code elsewhere).
- **Speedrun / time attack review**: Rest cards under a soft timer for mastery >= 4 nodes only.
- **Pair mode**: the AI writes the tests, you write the code (or vice versa) in alternating turns. Purpose: TDD rhythm.
- **Reverse fight**: you write tests to break the enemy's code (Oracle default; open to all classes as a modifier).
- **Boss rush**: replay unlocked bosses back to back; hard mode.
- **Ironman**: permadeath of the character version (learning still kept).
- **Daily mutator**: one global modifier per day (e.g. "no dicts today", "everything in JS", "Timeout Breath everywhere").
- **Dojo**: pure kata drills for a single node with instant restart, no narrative.

## Progression and economy
- **Technical Debt**: retreating adds Debt; Debt spawns the Debt Collector in later runs; paying it off (passing the node unaided) grants a burst of Cycles. Purpose: make review loops feel like a story.
- **Spell fusion**: combine two Spells into a utility module; the Compiler runs tests on the fusion.
- **Guild rank**: titles per realm at mastery thresholds; cosmetic.
- **Prestige / New Game+**: start a new language track with the shared-concept nodes pre-credited (they transfer) and a cosmetic reward. Purpose: multi-language fluency.
- **Bounty board**: long-horizon project quests spanning weeks with milestone checks.
- **Weekly report**: a generated summary (deterministic template + optional AI prose) of what improved and what rotted.
- **Achievements**: tied to learning behaviors (e.g. "Retreated wisely", "Killed 100 mutants", "No hints for a whole run") rather than grind.

## Combat and rooms
- **Constraint Curses catalog**: no loops, no recursion, no imports, max lines, must use X, pure functions only, O(n) only, memory band, no mutation, single expression, tail-recursive, no regex, only regex.
- **Enemy affixes** (roguelike style): Hasty (timer), Armored (hidden tests count double), Regenerating (regressions heal more), Mimic (starter code has a subtle bug), Silent (no expected/actual shown), Swarm (five tiny challenges).
- **Companions**: a second class ability set borrowed for one run (introduces multiclass).
- **Events with consequences**: "A stranger asks you to review their code" (a readcode puzzle for Cycles), "A shrine of an old god" (learn a deprecated-but-common idiom), "The Bikeshed" (say no).
- **Environmental hazards**: Legacy Fog (identifiers obfuscated), Latency Swamp (tests run slower; efficiency matters), Cold Cache (no Spellbook).
- **Forge quests**: build a specific utility (e.g. `retry`) as a Spell that later fights require.

## Learning-specific
- **Misconception hunts**: rooms explicitly built around one error tag with escalating variants.
- **Teach-back to a fake student**: the AI plays a confused student; you explain until its questions stop (rubric).
- **Explain-the-diff**: after a Retreat, the player must write one sentence per differing line before moving on.
- **Chronicle insights**: "you tend to fail on empty input" style pattern detection from error tags.
- **Skill decay warnings** in the Bastion with one-click review runs.
- **Custom nodes**: the user adds their own concept (e.g. "my company's framework") with their own challenges.

## Presentation
- Tile renderer with the 1-bit pack tinted per realm; CRT shader toggle; sound toggle; screen shake on Kernel Panic (accessibility toggle).
- Enemy portraits from the character spritesheets; per-phase boss forms.
- Run recap card (shareable PNG, local only).

## Tooling and modding
- Content pack install from a git URL; pack marketplace is just a curated list in docs.
- Custom enemy builder in the in-game editor.
- Modding API for room types as TS plugins (in-repo only, no remote code).
- Import challenge formats from Exercism-style repos (their `config.json` + tests) via an importer.
