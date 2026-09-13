# Optional assets for Rootward

**Nothing in this folder is required.** The game's default presentation is ASCII/Unicode glyphs rendered in the
system monospace font, with no sound. Everything here is raw material that *may* be used behind the `Renderer`,
theme, and audio interfaces described in `PROMPT.md` section 14. Treat these as ideas, not dependencies: the build
must never fail because an asset is missing, and every use must go through an interface with a glyph/silent
fallback.

Everything was downloaded by `scripts/fetch-assets.sh` (re-runnable; it skips what exists). Each pack keeps its
original license file and a `SOURCE_URL.txt`. Decide at repo-init time whether `assets/vendor/` and `assets/fonts/`
are committed or git-ignored and re-fetched (they total about 19 MB; committing is fine, ignoring is cleaner).

## Licenses
- Everything under `vendor/` is from Kenney (kenney.nl), **CC0 1.0** (public domain; no attribution required,
  appreciated).
- Everything under `fonts/` is from the Google Fonts GitHub mirror, **SIL Open Font License 1.1** (free to use and
  bundle; keep the `OFL.txt` alongside; do not sell the fonts by themselves).

## Catalog

### Tilesets and sprites (16x16 unless noted)
| Folder | What is inside | Where it could fit |
|---|---|---|
| `vendor/kenney-1-bit-pack` | One-bit (monochrome) 16x16 tilesheet with ~1000 tiles: dungeon, interior, urban, fantasy characters, items, UI glyphs. Recolorable to any palette. | **Best fit for the phosphor/CRT aesthetic.** Map tiles, enemy glyphs, item icons, all tinted with the theme color. Halfway between ASCII and pixel art. |
| `vendor/kenney-tiny-dungeon` | 16x16 dungeon tiles, characters, monsters, items; includes a Tiled tilemap sample and `Tilesheet.txt` (tile names). | Dungeon map renderer (tile implementation), enemy portraits. |
| `vendor/kenney-tiny-town` | Companion to Tiny Dungeon: town buildings, roads, props, townsfolk. | The Bastion hub map (Guild Hall, Library, Compiler, Package Manager). |
| `vendor/kenney-micro-roguelike` | 8x8 micro tiles (also a Playdate Pulp export): tiny dungeon, characters, items. | Minimap, the branching run map, tiny status icons. |
| `vendor/kenney-roguelike-caves-dungeons` | Roguelike cave/dungeon tiles spritesheet (16x16 with spacing). | Alternative dungeon look per realm (caves for Silicon Depths). |
| `vendor/kenney-roguelike-characters` | Modular character parts (bodies, hair, armor, weapons) as a spritesheet. | Class portraits and character creator in the Guild Hall. |

### UI
| Folder | What is inside | Where it could fit |
|---|---|---|
| `vendor/kenney-pixel-ui-pack` | Pixel-art panels, buttons, sliders, 9-slice pieces. | HUD frames, dialog boxes, the Tutor chat panel, in the retro theme. |
| `vendor/kenney-ui-pack` | Clean vector/PNG UI elements in several colors, plus a font and click sounds. | A non-retro "clean" theme; quick prototyping of panels. |
| `vendor/kenney-game-icons` | ~100 flat game icons (PNG + SVG): arrows, gears, hearts, locks, save, pause, audio. | Command palette icons, settings, HUD (Integrity, Focus), Artifact icons. |

### Fonts
| Folder | Font | License | Where it could fit |
|---|---|---|---|
| `vendor/kenney-fonts` | Kenney Pixel, Kenney Mini, Kenney Blocks, Kenney Future (TTF) | CC0 | Titles, HUD numbers, retro theme labels. |
| `fonts/pressstart2p` | Press Start 2P | OFL | Title screen and boss names (use sparingly; low readability at small sizes). |
| `fonts/vt323` | VT323 | OFL | **The CRT terminal look** for narration, lore, Loremaster text, the Bastion. |
| `fonts/silkscreen` | Silkscreen | OFL | Tiny pixel labels on the map. |
| `fonts/pixelifysans` | Pixelify Sans (variable) | OFL | Friendlier pixel headings. |
| `fonts/sharetechmono` | Share Tech Mono | OFL | Alternative HUD/monospace with a techy feel. |
| `fonts/ibmplexmono` | IBM Plex Mono | OFL | Readable editor/terminal font option. |
| `fonts/jetbrainsmono` | JetBrains Mono (variable) | OFL | Editor font option with ligatures. |
| `fonts/firacode` | Fira Code (variable) | OFL | Editor font option with ligatures. |

Recommendation if fonts are used at all: **VT323** for narrative/UI text, **JetBrains Mono or IBM Plex Mono** for
the code editor and terminal, **Press Start 2P** only for the title. Always provide `monospace` fallbacks in CSS.

### Audio (OGG/WAV, short)
| Folder | What is inside | Where it could fit |
|---|---|---|
| `vendor/kenney-interface-sounds` | ~100 UI clicks, confirmations, errors, toggles. | Cast/Probe feedback, menu navigation, test pass/fail ticks. |
| `vendor/kenney-ui-audio` | ~50 UI sounds (clicks, switches, rollovers). | Command palette, panel toggles. |
| `vendor/kenney-rpg-audio` | ~50 RPG sounds: chests, coins, doors, footsteps, hits, drinks, book flips. | Loot, Cycles, room transitions, Tome pickup, Coffee artifact. |
| `vendor/kenney-impact-sounds` | ~100 impact sounds (wood, metal, glass, soft). | Damage to enemy per passing test; Kernel Panic. |

Audio must be opt-in (settings toggle, default off) and never block anything.

## Not downloaded (manual, optional)
- **0x72 16x16 DungeonTileset II** — CC0, animated characters and dungeon tiles, arguably the nicest free dungeon
  set; itch.io requires a click-through: https://0x72.itch.io/dungeontileset-ii
- **0x72 16x16 Dungeon Tileset (original)** — CC0: https://0x72.itch.io/16x16-dungeon-tileset
- More CC0 packs: https://itch.io/game-assets/assets-cc0/tag-roguelike and https://kenney.nl/assets (all CC0).
- Icons needing attribution (CC BY 3.0, so only if attribution is added to the About screen): https://game-icons.net

## How the code should reference assets (when it does)
- Load through an `AssetRegistry` in the client that maps logical names (`tile.wall`, `sfx.cast.pass`,
  `font.ui`) to files, with a glyph/silent fallback for every logical name.
- Theme files (`config/themes/*.json`) choose renderer (`ascii` | `tiles`), tileset folder, palette, and fonts.
- Never import an asset path directly from a component. Never make a test depend on an asset file.
