# Rootward

A programming-education roguelike: every fight is a real coding, shell, SQL, testing, or security task run in a
sandbox; classes are engineering disciplines; the skill graph is a curriculum with spaced repetition; an optional,
hot-swappable AI layer plays tutor, narrator, content forge, reviewer, and adversary. Built by one person, for one
person, to become a much better programmer. Nothing is implemented yet; this repo currently holds the design.

## Start here
| File | Purpose |
|---|---|
| `PROMPT.md` | The full design and build spec. The first message of the build session points at it. |
| `AGENT.md` | Standing working agreement for any AI session: rules, definition of done, how to add things, ready-made prompts. |
| `ideas/` | Reference material: 25 theory files, 4 pedagogy files, 6 game-content banks, 10 solution write-ups. Index in `ideas/README.md`. |
| `mockups/rootward-ui.html` | Clickable single-file UI mock of all six screens (open in a browser). `mockups/README.md` explains it. |
| `content/packs/core/` | Seed content in the target format: one full example challenge, skill nodes, a class, enemies, realms, review cards. |
| `config/` | Starting tunables (`balance.yaml`), AI routing template (`ai.example.json`), prompt templates. |
| `assets/` | Optional CC0/OFL art, fonts, sounds (about 19 MB), fetched by `scripts/fetch-assets.sh`. Never required. |
| `docs/` | Project documentation grows here during the build (ADR template included). |

## Starting the build session
Open a fresh Claude Code session in this directory and paste:

> Read AGENT.md first, then PROMPT.md in full, then ideas/README.md and mockups/README.md. Follow them. Start with
> the Kickoff Checklist in PROMPT.md section 18: ask me all of its questions in one message and wait for my
> answers. Then write docs/ROADMAP.md and CLAUDE.md and begin Milestone 0. Target for this session: Milestone 0
> complete and Milestone 1 underway, with tests green and docs updated as you go.

Later sessions: see the ready-made prompts in `AGENT.md` section 8.

## Environment
Copy `.env.example` to `.env` and fill in the keys you have. Nothing here requires any key.
