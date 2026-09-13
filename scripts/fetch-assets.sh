#!/usr/bin/env bash
# Fetch OPTIONAL free assets for Rootward (all CC0 or SIL OFL). Safe to re-run; skips what is already present.
# Nothing in the game requires these files: the default renderer is ASCII/Unicode and the default font is the
# system monospace. These are ideas and raw material. See assets/README.md for the catalog and licenses.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/assets/vendor"
FONTS="$ROOT/assets/fonts"
mkdir -p "$VENDOR" "$FONTS"

extract() { # zip dest
  if command -v unzip >/dev/null 2>&1; then unzip -q -o "$1" -d "$2"
  else python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"; fi
}

fetch_zip() { # name url
  local name="$1"
  local url="$2"
  local dest="$VENDOR/$name"
  local tmp
  if [ -d "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then echo "skip   $name (already present)"; return; fi
  tmp="$(mktemp -t "rootward-$name.XXXXXX")"
  echo "fetch  $name"
  curl -fsSL --retry 3 --max-time 300 -o "$tmp" "$url"
  mkdir -p "$dest"
  extract "$tmp" "$dest"
  rm -f "$tmp"
  echo "$url" > "$dest/SOURCE_URL.txt"
}

fetch_font() { # family file
  local family="$1"
  local file="$2"
  local dest="$FONTS/$family"
  local base="https://raw.githubusercontent.com/google/fonts/main/ofl/$family"
  mkdir -p "$dest"
  local out
  out="$dest/$(printf '%s' "$file" | sed 's/%5B/[/g; s/%5D/]/g')"
  if [ -f "$out" ]; then echo "skip   font $family"; return; fi
  echo "fetch  font $family"
  curl -fsSL --retry 3 -o "$out" "$base/$file"
  curl -fsSL --retry 3 -o "$dest/OFL.txt" "$base/OFL.txt" || true
  echo "$base/$file" > "$dest/SOURCE_URL.txt"
}

# --- Kenney (kenney.nl), all CC0 1.0 ---------------------------------------------------------------------
fetch_zip kenney-tiny-dungeon            "https://kenney.nl/media/pages/assets/tiny-dungeon/f8422efb44-1674742415/kenney_tiny-dungeon.zip"
fetch_zip kenney-1-bit-pack              "https://kenney.nl/media/pages/assets/1-bit-pack/aa867a1f37-1677578516/kenney_1-bit-pack.zip"
fetch_zip kenney-micro-roguelike         "https://kenney.nl/media/pages/assets/micro-roguelike/bbcaf50993-1677578239/kenney_micro-roguelike.zip"
fetch_zip kenney-roguelike-caves-dungeons "https://kenney.nl/media/pages/assets/roguelike-caves-dungeons/5195ceb8ca-1677694831/kenney_roguelike-caves-dungeons.zip"
fetch_zip kenney-roguelike-characters    "https://kenney.nl/media/pages/assets/roguelike-characters/53ffff4133-1729196490/kenney_roguelike-characters.zip"
fetch_zip kenney-tiny-town               "https://kenney.nl/media/pages/assets/tiny-town/a415fbeb49-1735736916/kenney_tiny-town.zip"
fetch_zip kenney-pixel-ui-pack           "https://kenney.nl/media/pages/assets/pixel-ui-pack/821e760f21-1677661508/kenney_pixel-ui-pack.zip"
fetch_zip kenney-ui-pack                 "https://kenney.nl/media/pages/assets/ui-pack/f651646eab-1718203990/kenney_ui-pack.zip"
fetch_zip kenney-game-icons              "https://kenney.nl/media/pages/assets/game-icons/1ebf9c14af-1677661579/kenney_game-icons.zip"
fetch_zip kenney-fonts                   "https://kenney.nl/media/pages/assets/kenney-fonts/8d5435c213-1677661710/kenney_kenney-fonts.zip"
fetch_zip kenney-interface-sounds        "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip"
fetch_zip kenney-ui-audio                "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip"
fetch_zip kenney-rpg-audio               "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip"
fetch_zip kenney-impact-sounds           "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"

# --- Fonts (Google Fonts GitHub mirror), all SIL Open Font License 1.1 -----------------------------------
fetch_font pressstart2p  "PressStart2P-Regular.ttf"
fetch_font vt323         "VT323-Regular.ttf"
fetch_font silkscreen    "Silkscreen-Regular.ttf"
fetch_font pixelifysans  "PixelifySans%5Bwght%5D.ttf"
fetch_font sharetechmono "ShareTechMono-Regular.ttf"
fetch_font ibmplexmono   "IBMPlexMono-Regular.ttf"
fetch_font jetbrainsmono "JetBrainsMono%5Bwght%5D.ttf"
fetch_font firacode      "FiraCode%5Bwght%5D.ttf"

echo "done. Optional manual downloads (itch.io click-through, CC0): https://0x72.itch.io/dungeontileset-ii"
