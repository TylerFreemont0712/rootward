// The music and sounds the client knows how to ask for (ADR-0023): files in assets/generated/audio, made by
// scripts/audio/generate.py from scripts/audio/manifest.json. Like the art catalog (AssetRegistry.ts), an id that is not
// listed has no URL, so content can name music that was never rendered and the game stays silent instead of fetching a
// file that is not there. **A new file needs its id added here.**

const BASE_URL = "/generated/audio";

export const MUSIC = [
  "music-title",
  "music-bastion",
  "music-foundry",
  "music-focus",
  "music-salvage",
  "music-heap",
  "music-kernel",
  "music-battle",
  "music-guardian",
] as const;

export const SOUNDS = [
  "cue-victory",
  "cue-defeat",
  "cue-treasure",
  "sfx-cast",
  "sfx-hit",
  "sfx-hit-heavy",
  "sfx-ward",
  "sfx-glance",
  "sfx-shatter",
  "sfx-hurt",
  "sfx-card",
  "sfx-draw",
  "sfx-step",
  "sfx-coins",
  "sfx-chime",
  "sfx-turn",
  "sfx-pass",
  "sfx-fail",
  "sfx-open",
] as const;

export type SoundId = (typeof SOUNDS)[number];

const KNOWN: ReadonlySet<string> = new Set<string>([...MUSIC, ...SOUNDS]);

export function audioUrl(id: string): string | undefined {
  return KNOWN.has(id) ? `${BASE_URL}/${id}.ogg` : undefined;
}

/** Where each music file loops (`scripts/audio/generate.py` writes it beside the files). */
export const LOOP_POINTS_URL = `${BASE_URL}/music.json`;
