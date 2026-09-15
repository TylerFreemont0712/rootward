# Optional assets for Rootward

**Nothing in this folder is required.** `PROMPT.md` section 14 planned ASCII/Unicode glyphs as the default
`Renderer`, with a tileset later; in practice the tileset arrived first and is now the only map `Renderer`
(`TileMapRenderer` — see "AI-generated" below), styled with the generated art in `generated/`. Sound is still
unimplemented. Elsewhere in the client (buttons, chips, an enemy with no generated portrait) a plain-text glyph
fallback is still how content without art degrades — the point standing from `PROMPT.md`: the build must never
fail because an asset is missing, and every use goes through an interface with a fallback.

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

### AI-generated (ComfyUI)
Wired into the client via `apps/client/src/assets/AssetRegistry.ts` (`assetUrl(category, id)`, catalog-checked so an
unknown id returns `undefined` rather than a guessed path) and consumed by `TileMapRenderer.tsx`, `LeftPane.tsx`,
and `global.css`. Every use still keeps a fallback per AGENT.md — the ASCII glyph, or nothing — for whatever isn't
generated yet.

| Folder | What is inside | Wired into |
|---|---|---|
| `generated/enemies` | Portraits for the five seeded enemies (`content/packs/core/enemies/*.yaml`): Null Wraith, Off-By-One Goblin, Regex Sphinx, Tally Wisp, Type Mimic. | `EnemyCard` (`LeftPane.tsx`), replacing the inline `art:` ASCII block when a matching id exists. |
| `generated/classes` | One portrait so far: `artificer.png`, matching `content/packs/core/classes/artificer/`. | Not wired yet (no class-select screen exists). |
| `generated/avatars` | Top-down map tokens, distinct from `classes` (a front-facing portrait doesn't read well shrunk onto a tile). One so far: `artificer.png`. | `TileMapRenderer`'s avatar cell, keyed off `player.className` slugified; falls back to the `@` glyph for any class without a token. |
| `generated/items` | Icons for the two starting artifacts: `rubber-duck.png`, `stack-trace-lens.png` (`content/packs/core/items/*.yaml`). | Not wired yet (no artifact tray UI exists). |
| `generated/oaths` | Crest-style emblems for all seven oaths (`content/packs/core/oaths.yaml`): foundry, web, citadel, archives, interview, shadow, depths. | Not wired yet (no oath-selection UI exists). |
| `generated/realms` | One icon per realm, all eleven (`content/packs/core/realms.yaml`). | Not wired yet (no realm-select/world-map screen exists). |
| `generated/rooms` | A clean floating sigil per room kind (no baked-in ground — the renderer supplies the floor tile underneath): encounter (crossed swords), elite (ornate sword), boss (horned skull), shrine (blessing rune), puzzle (glowing "?"), rest (campfire). | `TileMapRenderer`, overlaid on a `tiles/floor.png` base at each room's center; also `OverworldRenderer` (ADR-0010), overlaid the same way on each overworld marker (`encounter`/`boss` kinds only, since a zone has no elite/shrine/puzzle/rest markers). |
| `generated/doors` | Three door states as small icons, not full tiles — a top-down "door texture" kept coming out as a front-on architectural scene, so a door is drawn as an icon over `tiles/wall.png` instead, the same pattern as room markers over floor: `open.png`, `closed.png`, `locked.png`. | `TileMapRenderer`, overlaid on the wall tile wherever a door sits. |
| `generated/hud` | Icons for the three HUD stats named in `PROMPT.md` 14.5: `integrity.png`, `focus.png`, `cycles.png` (no icon for Version — it's just a number). | `Hud` (`LeftPane.tsx`), next to each stat label. |
| `generated/tiles` | Six assets matching `TILE_STYLE`. `wall.png`/`floor.png`/`corridor.png` are opaque full-bleed textures, deliberately in three different color families (cool gray, warm tan, worn gray-brown) so they read as distinct surfaces rather than the same brick pattern recolored. `wall-corner.png` is **not AI-generated** — every attempt to prompt an asymmetric L-shaped tile just produced another uniform texture, so it's `wall.png` itself masked into an L with Pillow (transparent top-left quadrant, so the floor tile shows through); rotating that one asset 90°/180°/270° covers all four corners, and the plain wall texture doubles as the straight run in both orientations since it has no directional detail. `prop.png` is the realm's actual decoration — an anvil, per the `prop` TILE code's own comment, not a generic crate — and `rubble.png` is "Bit Rot": glitching magenta/black data-corruption debris, per that code's comment, not literal rocks. | `TileMapRenderer`: `wallOrientation()` reads each wall cell's four neighbors to pick straight vs. corner (+ rotation), replacing `# & ~ . ·`. |
| `generated/backgrounds` | One opaque backdrop so far: `foundry.png` — the only realm any seeded content is actually set in. | `.map-main` in `global.css` (`background-image`, `cover`, with a dark overlay so tiles stay legible over it). |

Sprites/icons are 512x512 pixelated to a 64x64 grid, transparent (except the two texture swatches, which are
opaque). `backgrounds/foundry.png` is 1024x1024 pixelated to a 256x256 grid — a background reads better with more
detail than a 64px sprite at that display size, and doesn't need transparency since it fills the whole map area.
Made with a local ComfyUI pipeline (SDXL base + the [Pixel Art XL](https://civitai.com/models/120096) LoRA + BiRefNet
background removal + nearest-neighbor pixelization), not downloaded from a pack. The reusable workflow is saved in
that ComfyUI install's library as `rootward-pixel-art-asset.json` — open it, edit the positive prompt and the
`SaveImage` filename, and queue it to generate more (e.g. one per new enemy/class/item added to `content/`). Same
CC0-equivalent situation as the rest of this folder: nothing in code depends on these existing, and licensing is
whatever the operator's use of the generating models allows (Pixel Art XL's CivitAI license permits this use as of
generation time).

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
