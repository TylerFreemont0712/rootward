# Optional assets for Rootward

**Nothing in this folder is required.** `PROMPT.md` section 14 planned ASCII/Unicode glyphs as the default
`Renderer`, with a tileset later; in practice the tileset arrived first. Expedition maps are drawn by `TileMapRenderer`
and the walkable world (ADR-0011) by `WorldRenderer`, both styled with the generated art in `generated/`. Sound is
still unimplemented. Everywhere art is missing, content degrades to a fallback (a flat terrain color, a letter or glyph
for a prop, person, or monster, the ASCII art on an enemy card) -- the point standing from `PROMPT.md`: the build must
never fail because an asset is missing, and every use goes through an interface with a fallback.

Everything under `vendor/` and `fonts/` was downloaded by `scripts/fetch-assets.sh` (re-runnable; it skips what
exists). Each pack keeps its original license file and a `SOURCE_URL.txt`. `assets/vendor/` is git-ignored and
re-fetched; `assets/fonts/` and `assets/generated/` are committed.

## Licenses
- Everything under `vendor/` is from Kenney (kenney.nl), **CC0 1.0** (public domain; no attribution required,
  appreciated).
- Everything under `fonts/` is from the Google Fonts GitHub mirror, **SIL Open Font License 1.1** (free to use and
  bundle; keep the `OFL.txt` alongside; do not sell the fonts by themselves).
- `generated/` is AI-generated; see "AI-generated" below for the models used and what their licenses mean.

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
Wired into the client via `apps/client/src/assets/AssetRegistry.ts` (`assetUrl(category, id)` and
`terrainVariantUrls(id)`, catalog-checked so an unknown id returns `undefined` rather than a guessed path). **A new
file needs its id added to that catalog** before the client asks for it.

#### The world (ADR-0011), made with `scripts/art/generate.py`

| Folder | What is inside | Wired into |
|---|---|---|
| `generated/terrain` | Eleven ground kinds matching `content/packs/core/terrain.yaml` (grass, dirt, cobble, flagstone, planks, water, stone-wall, ash, basalt, lava, rock), four 32x32 variants each (`<id>-0.png` .. `<id>-3.png`). Each set shares one palette and one border strip, so any variant sits seamlessly next to any other. | `WorldRenderer`'s ground canvas; a spatial hash picks the variant per cell. |
| `generated/props` | The 35 props in `props.yaml`: Bastion buildings (Guild Hall 160x128, Library, the Compiler's forge, the Warm Cache inn, cottages, market stall, gate), town furniture (trees, lamps, fences, well, fountain, dummies, flowers), and Foundry machinery (furnaces, anvils, crucibles, glyph pillars, the sealed and the open kiln gate, Pell's camp, the waystone circle). | `WorldRenderer`, bottom-aligned on each footprint and sorted by row. |
| `generated/npcs` | Map sprites for the ten NPCs in `content/packs/core/npcs/` (32x48; Lint is a 32x32 floating daemon). | `WorldRenderer` (`sprite` id). |
| `generated/portraits` | 128x128 dialogue portraits for every NPC and for the Artificer. | `DialogueBox` (`portrait` id). |
| `generated/creatures` | Map sprites for the six enemies (48x48; the Kiln Warden boss 80x96), standing on world markers. | `WorldRenderer` markers, keyed by enemy template id. |
| `generated/avatars` | `artificer.png` (32x50, standing, facing the viewer) and three walk strips, `artificer-walk-down.png`, `-up.png`, and `-right.png`: five 32x50 frames each (standing, then contact, passing, contact, passing). All fifteen figures come from one pose-guided render (an OpenPose ControlNet over stick figures from `scripts/art/poses.py`), so the design matches from every side and the legs really move; every frame shares one scale and one palette. | `WorldRenderer` shows the standing frame and cycles the four walk frames for the facing direction (left mirrors right); `TileMapRenderer`, the title screen, and the Shardrun arena use the sprites too; `@` without either. |
| `generated/backgrounds/arena-*.png` | Shardrun's arenas (ADR-0019), 720x300 with 128 colors, painted for the stage's wide shape: one per layer (`arena-salvage`, `arena-heap`, `arena-kernel`) and one for each guardian's room (`arena-kiln`, `arena-vault`, `arena-throne`). Each starts from a layout sketch (`scripts/art/layouts.py`): a dark ceiling for the code view and a guardian's health bar, a broad lit floor where the fighters stand, an open middle for bolts, a distant glow for depth (behind the guardian in its room), and framed edges. Picked on a mock stage with each layer's hardest foe standing in it; the Salvage and the Throne are graded darker in post. | The Shardrun stage (a layer's arena, or its guardian's room in a boss fight, as `boss_backdrop` in `shardrun/run.yaml` says) and the mode's faint full-screen backdrop. |
| `generated/creatures` (Shardrun foes) | Nine foes for the Heap and the Kernel: memory-leak-ooze, race-condition-imp, dangling-pointer, garbage-collector (64x64), deadlock-golem (80x96), stack-overflow-serpent, segfault-specter, fork-bomb (64x64), root-daemon (80x96). | Arena sprites and map boss nodes. |
| `generated/shardrun/map-*.png`, `relic-*.png` | Map node icons (fight, elite, boss, rest, forge, treasure) and one icon per relic, 32x32. | The layer map and relic cards and bar. |
| `generated/portraits`, `generated/avatars` (classes) | Portraits (128x128) and map sprites (32x48) for the six planned classes: warden, shade, oracle, keeper, necromancer, summoner. | The class picker and the main menu. |
| `generated/shardrun` | Shardrun (ADR-0012): `bolt-none`, `-fire`, `-frost`, `-spark`, and `-ward` (24x24 projectiles) and an icon per shard family, `shard-<id>.png` (32x32; `fork-plus` uses `shard-fork`). | The arena's flying bolts and element tags; shard chips, cards, and spell flows (`shardIconUrl`). |
| `generated/backgrounds/salvage.png` | A 480x274 underground vault of broken machinery and violet crystal shards. | The Shardrun arena stage and the mode's faint full-screen backdrop. |
| `generated/brand/shardrun.png` | A 64x64 glowing crystal shard emblem. | The Shardrun start screen. |
| `generated/battle/artificer.png` | The Artificer's battle poses (ADR-0019): eight 96x104 frames side by side — idle, wind-up, cast, recover, ward, hurt, channel, victory — cut from one pose-guided render, so the design matches in every frame. The order is the contract with `BATTLE_POSES` in `AssetRegistry.ts`. | The arena's hero, posed by the battle timeline; without it the arena uses the walk strip. |
| `generated/battle/artificer-idle.png` | Four 96x104 frames made from the idle frame by `breathe` (the post option `idle` on the strip): everything above the robe's hem settles 0, 1, 2, 1 pixels, feet planted, in the strip's palette. | The arena's hero while idle, stepped through with a CSS `steps(4)` animation; without it the idle frame breathes by transform. |
| `generated/battle/portrait-artificer.png` | A 256x256 battle portrait (112 colors), casting, three-quarter view. | The lower-left panel beside the spells; without it, the 128px dialogue portrait. |
| `generated/foes` | Every Shardrun foe at arena scale: 72px small, 96px medium, 128px large, 168x176 huge, and the Root Daemon at 176x192 (a new render: a colossal machine king). All but the Daemon are the same render their map sprite in `creatures/` was cut from, cut again larger (`raw_from`). | The arena, sized by each foe's `size` in content; `creatures/` is the fallback. |
| `generated/fx` | Light effects rendered on black with brightness turned into alpha: `burst-<fire\|frost\|spark\|arcane>` (96x96), `circle` (a rune circle, recolored per element in code), `ward` (a barrier sphere, recolored teal for the Maintainer and steel for a foe's shield), `slash`, `flare`. Projectiles are drawn in code instead: rendered ones came back as scenes (frost as ice caves) rather than one object flying one way. | The effects canvas (`apps/client/src/shardrun/fx/`); every effect has a drawn fallback. |
| `generated/enemies/kiln-warden.png` | The boss's enemy-card portrait (96x96). | `EnemyCard` (`LeftPane.tsx`). |
| `generated/backgrounds/title.png` | A 480x274 dusk panorama of the Machine: a mountain of amber circuitry above an abyss, the Bastion on a cliff. | `TitleScreen`, full-bleed behind everything (scaled up with `image-rendering: pixelated`). |
| `generated/brand` | `emblem.png` (64x64, the Guild's gear crest with a root growing through it), `icon-256.png` (the same emblem scaled 4x with nearest-neighbor, via the manifest's `copies`), and `wanderer.png` (64x96, a hooded Maintainer seen from behind). | `TitleScreen` (emblem over the name, wanderer in the foreground); `icon-256.png` is the desktop launcher's icon (`scripts/rootward-launch.sh`), with `scripts/rootward.svg` as the fallback. |

**How the pipeline works.** `scripts/art/manifest.json` lists every asset: an id, an output path, a style, a prompt,
a seed, and post-processing settings. The script sends each to a running ComfyUI (default `http://127.0.0.1:8188`)
as a txt2img graph, with BiRefNet background removal for anything that needs transparency, and caches the raw renders
in `assets/.art-cache/` (git-ignored). Post-processing then does what ComfyUI has no stock nodes for:

1. Drop floating fragments left by background removal (connected blobs smaller than a fraction of the subject).
2. Crop to the subject and shrink with an area average on premultiplied alpha, so edges do not pick up a halo.
3. Reduce to a small palette (median cut, no dithering) and cut alpha to fully on or off.
4. Add a one-pixel dark outline, so sprites read against any ground.
5. For terrain, cut four crops from one render and blend each toward a shared half-rolled border strip, which makes
   every variant tile seamlessly with every other.

Styles: `backdrop` renders a 1344x768 landscape and reduces it to 64 colors at 480x274; `terrain` and `prop` use SDXL base 1.0 with the [Pixel Art XL](https://civitai.com/models/120096) LoRA;
`character` and `creature` use NovaAnimeXL (an Illustrious-based SDXL checkpoint) with Pixel Art XL at 0.8, which gives
readable chibi proportions at 32x48; `portrait` uses NovaAnimeXL alone. Most assets render two candidates; the
contact sheet shows them side by side and the manifest's `pick` chooses one.

```sh
PY=~/personal-project/ComfyUI/.venv/bin/python     # any Python 3.10+ with Pillow and numpy works
$PY scripts/art/generate.py                         # render anything not cached, post-process everything
$PY scripts/art/generate.py --only npc-pip,prop-*   # some ids, or prefixes ending in *
$PY scripts/art/generate.py --only npc-pip --force  # render again even though a raw render is cached
$PY scripts/art/generate.py --reprocess --sheet     # redo post-processing only, and write a contact sheet
```

A `walk-sheet` asset renders a whole character sheet instead of one figure: the script cuts it into separate figures
(connected blobs, top row first), `views` in the manifest names which figure faces down, up, and right, and each gets a
four-frame walk strip. Look at the contact sheet, then set `views` like `pick`.

A `walk-cycle` asset is pose-guided: its `control` block names an OpenPose ControlNet (`noobai-openpose-sdxl-fp16`, an
Illustrious-family model matching the character checkpoint, in ComfyUI's `models/controlnet`) and a pose sheet from
`scripts/art/poses.py` (preview one with `$PY scripts/art/poses.py walk 1280 1024 /tmp/pose.png`). The sheet is uploaded
to ComfyUI and steers the render; `rows` and `columns` then say how to cut it, and every figure is scaled by one common
factor so all directions come out the same size. Editing the poses re-renders the asset (the sheet's hash is part of the
cache key).

A `pose-strip` asset (ADR-0019) is pose-guided like a walk cycle, but for moves that carry the whole body: every cell
is cropped to one shared box and scaled by one factor, so a lunge still moves forward and a recoil back, and only the
lowest foot is dropped to the frame's floor. It uses background removal's own mask (pale skin and white eyes survive,
which a white-background cut would punch holes through). `battle` in `poses.py` is its sheet; in a side view keep
hands below the head, or the model draws a hand resting on it and turns the figure toward the viewer.

A pose strip can also emit an idle loop: `idle: {out, drops, waist}` lowers everything above `waist` (a share of the
figure's height) by each of `drops` pixels in turn, from the strip's first frame and in its palette. It is the pixel
artist's breathing idle, made without redrawing anything.

An asset with `init: {layout, denoise}` starts its render from a layout sketch instead of noise (img2img). The sketch
comes from `scripts/art/layouts.py`, which draws broad, blurred shapes of value and color; at `denoise` 0.8 the model
repaints every detail but keeps the composition. It is how an arena gets a floor where the fighters stand and a dark
band where text sits, which no prompt could guarantee. Editing a sketch re-renders the asset (its digest is part of the
cache key). Preview one with `$PY scripts/art/layouts.py salvage 1536 640 /tmp/salvage.png`.

A `glow` asset is light rendered on black. Its brightness becomes alpha (color divided back out), stepped into a few
levels like the palette, with the edges faded so rays that ran off the render do not end in a square. It draws
correctly with additive blending and with ordinary blending. The script warns when a candidate came back on a light
background; do not pick those.

An asset with `raw_from: <other asset id>` renders nothing: it post-processes that asset's cached render with its own
`post` settings. That is how a foe's arena sprite and its map sprite stay one design.

`flip: true` in `post` mirrors a finished picture or sprite (or a glow) left to right. Foes stand on the right of the
stage, so one painted looking right faces away from the Maintainer: the Kiln Warden's and the Root Daemon's arena
sprites are flipped, and so is the battle portrait, so it looks into the stage from the lower left. The file itself is
mirrored, so the sprite, its hit flash, and the pixels it breaks into all agree.

Changing only `post` settings (or `pick`) never touches the GPU again. Changing a prompt, seed, or model re-renders
that asset. The cache key is a hash of everything that shapes a render (`GENERATION_KEYS`). When the pipeline learns a
new kind of input (pose guidance, layout sketches), its keys are also listed in `LATER_GENERATION_KEYS`: a render
cached before they existed still counts for an asset that does not use them, instead of the whole manifest looking
stale and rendering again.

#### The first pass (expeditions and HUD)

| Folder | What is inside | Wired into |
|---|---|---|
| `generated/enemies` | Portraits for the five first enemies (`content/packs/core/enemies/*.yaml`): Null Wraith, Off-By-One Goblin, Regex Sphinx, Tally Wisp, Type Mimic. | `EnemyCard` (`LeftPane.tsx`), replacing the inline `art:` ASCII block when a matching id exists. |
| `generated/classes` | One portrait so far: `artificer.png`, matching `content/packs/core/classes/artificer/`. | Not wired yet (no class-select screen exists). |
| `generated/items` | Icons for the two starting artifacts: `rubber-duck.png`, `stack-trace-lens.png` (`content/packs/core/items/*.yaml`). | Not wired yet (no artifact tray UI exists). |
| `generated/oaths` | Crest-style emblems for all seven oaths (`content/packs/core/oaths.yaml`): foundry, web, citadel, archives, interview, shadow, depths. | Not wired yet (no oath-selection UI exists). |
| `generated/realms` | One icon per realm, all eleven (`content/packs/core/realms.yaml`). | Not wired yet (no realm-select screen exists). |
| `generated/rooms` | A clean floating sigil per room kind (no baked-in ground -- the renderer supplies the floor tile underneath): encounter (crossed swords), elite (ornate sword), boss (horned skull), shrine (blessing rune), puzzle (glowing "?"), rest (campfire). | `TileMapRenderer`, overlaid on a `tiles/floor.png` base at each room's center; `WorldRenderer` uses encounter/boss as the fallback for a marker whose enemy has no creature sprite. |
| `generated/doors` | Three door states as small icons, not full tiles -- a top-down "door texture" kept coming out as a front-on architectural scene, so a door is drawn as an icon over `tiles/wall.png` instead, the same pattern as room markers over floor: `open.png`, `closed.png`, `locked.png`. | `TileMapRenderer`, overlaid on the wall tile wherever a door sits. |
| `generated/hud` | Icons for the three HUD stats named in `PROMPT.md` 14.5: `integrity.png`, `focus.png`, `cycles.png` (no icon for Version -- it's just a number). | `Hud` (`LeftPane.tsx`), next to each stat label. |
| `generated/tiles` | Six assets matching `TILE_STYLE`. `wall.png`/`floor.png`/`corridor.png` are opaque full-bleed textures, deliberately in three different color families (cool gray, warm tan, worn gray-brown) so they read as distinct surfaces rather than the same brick pattern recolored. `wall-corner.png` is **not AI-generated** -- every attempt to prompt an asymmetric L-shaped tile just produced another uniform texture, so it's `wall.png` itself masked into an L with Pillow (transparent top-left quadrant, so the floor tile shows through); rotating that one asset 90°/180°/270° covers all four corners, and the plain wall texture doubles as the straight run in both orientations since it has no directional detail. `prop.png` is the realm's actual decoration -- an anvil, per the `prop` TILE code's own comment, not a generic crate -- and `rubble.png` is "Bit Rot": glitching magenta/black data-corruption debris, per that code's comment, not literal rocks. | `TileMapRenderer`: `wallOrientation()` reads each wall cell's four neighbors to pick straight vs. corner (+ rotation), replacing `# & ~ . ·`. |
| `generated/backgrounds` | One opaque backdrop so far: `foundry.png` -- the only realm any seeded content is actually set in. | `.map-main` in `global.css` (`background-image`, `cover`, with a dark overlay so tiles stay legible over it). |

First-pass sprites and icons are 512x512, pixelated to a 64x64 grid, transparent (except the texture swatches);
`backgrounds/foundry.png` is 1024x1024 pixelated to a 256x256 grid. They were made with the graph saved in that
ComfyUI install's library as `rootward-pixel-art-asset.json` (SDXL base + Pixel Art XL + BiRefNet + a nearest-neighbor
resize). The script above supersedes it: its area downscale and palette reduction are what the first pass lacked.

**Licensing.** Nothing in code depends on these files existing. Their licensing is whatever the generating models
allow: Pixel Art XL's CivitAI license permitted this use at generation time; check NovaAnimeXL's model card before
distributing anything made with the `character`, `creature`, or `portrait` styles outside this personal project.

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
