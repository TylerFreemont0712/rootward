# UI mockup

`rootward-ui.html` is a single-file, dependency-free, clickable mock of the game's client. Open it in a browser
(`xdg-open mockups/rootward-ui.html`). It is a **starting point for the real client, not a spec**: if it conflicts
with `PROMPT.md`, the prompt wins. Everything in it is fake data.

## What it shows
| Screen | Key | What is mocked |
|---|---|---|
| Bastion | 1 | The hub as a grid of buildings: Guild Hall, Lint, The Changelog, The Chronicle (realm mastery + Bit Rot), The Compiler (Spellbook), Package Manager, Library, Testing Grounds. |
| Expedition | 2 | Branching 7-floor map (SVG), legend, the planner's "why this dungeon" rationale, selected-room detail. |
| Encounter | 3 | The three-pane IDE-dungeon. Left: floor list, HUD (Integrity, Focus pips, Cycles, Artifacts), enemy card with taunts and a next-move line. Center: Task / Editor / Lesson tabs, Probe / Cast / Hint / Retreat, abilities, hint ladder. Right: Lint chat, test list (visible with expected/actual, hidden as categories), console. **Playable:** fix the off-by-one in the editor (`len(items) - 1` → `len(items)`) and Cast to win; run out of Focus for a Kernel Panic. |
| Terminal | 4 | Warden room: a typed-out session in a fake terminal, check list as enemy HP, transcript tags. |
| Debrief | 5 | Run stats, Commits per concept with mastery movement, Reviewer rubric, loot, scheduled reviews, "what to study next". |
| Settings | 6 | Providers with status, per-role model dropdowns with fallbacks, privacy toggles, usage. |

Also: command palette (Ctrl+K) with `/model` and `/ai off` commands, keyboard shortcuts (Ctrl+Enter Cast,
Ctrl+Shift+Enter Probe, 1-6 screens), a CRT scanline overlay, and `prefers-reduced-motion` support.

## Design tokens (copy into the client's theme)
- Ground `#120e0a`, panel `#1a1410` / `#211a13` / `#2a2119`, lines `#3c2f21` / `#2b2219`.
- Accent amber phosphor `#f2a541` (dim `#a8712a`); text `#e9dcc0`, muted `#a58f6e`, faint `#6f5e46`.
- Teal `#5cc8b8` is reserved for Lint and the Machine "talking back" (Focus uses it too).
- Semantic: pass `#8bc96a`, fail `#e2584f`, warn `#e9c46a`, Integrity `#d9534f`.
- Type: VT323 for titles, narration, taunts, terminal; IBM Plex Mono for everything operated. Both are OFL and
  available locally under `assets/fonts/` (the mock loads them from Google Fonts; the real client should bundle
  or fall back to `monospace`).
- Single theme on purpose (a CRT is dark). If a light theme is ever wanted, build it as a second token set.

## How it maps to the spec
- Panes and panels: `PROMPT.md` 14.5. Screens: sections 4 (Bastion), 5 (loop), 7 (combat), 8 (rooms), 11 (AI settings).
- The enemy card's "HP one off" joke is the Off-By-One Goblin's `hp_display_offset` from Appendix D.
- Lint's lines follow the voice rules in `ideas/game-content/lore-and-narrative.md`; the hint ladder follows
  `ideas/pedagogy/hint-design.md`; the Retreat panel follows its explanation format.

## What the real client must do differently
Real CodeMirror 6 editor and xterm.js terminal; real test results from runners over WebSocket; state from the
core engine's event log, not page-local JS; streaming Tutor text; theme tokens in a file; the asset registry with
glyph fallbacks; accessibility pass (focus order, ARIA on live regions, contrast check on amber-on-brown for small
text: use `--text` for body copy, amber only for accents and large type).
