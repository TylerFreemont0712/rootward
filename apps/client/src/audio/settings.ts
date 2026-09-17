import { z } from "zod";
import { create } from "zustand";

// The player's sound settings (ADR-0023): one volume for everything, and one each for the music and for game sounds,
// each with its own mute, so the soundtrack can be turned down without losing the sounds of a fight, or the other way
// round. A per-browser preference, like the language, that never leaves the machine.

export type Channel = "music" | "effects";
export type Control = "master" | Channel;

export interface SoundSettings {
  master: number;
  music: number;
  effects: number;
  masterMuted: boolean;
  musicMuted: boolean;
  effectsMuted: boolean;
}

export const DEFAULT_SOUND: SoundSettings = {
  master: 0.8,
  music: 0.6,
  effects: 0.8,
  masterMuted: false,
  musicMuted: false,
  effectsMuted: false,
};

const STORAGE_KEY = "rootward:sound";
const Volume = z.number().min(0).max(1);
const Stored = z.object({
  master: Volume.optional(),
  music: Volume.optional(),
  effects: Volume.optional(),
  masterMuted: z.boolean().optional(),
  musicMuted: z.boolean().optional(),
  effectsMuted: z.boolean().optional(),
});

/**
 * The gain a channel plays at: its volume times the master volume, or nothing when either is muted.
 *
 * LEARN: a slider moves linearly under the hand, but the ear hears loudness roughly logarithmically, so a linear gain
 * makes the top half of a slider sound almost the same. Squaring the setting is a simple curve that makes half way
 * sound like about half as loud.
 */
export function channelGain(settings: SoundSettings, channel: Channel): number {
  const muted = channel === "music" ? settings.musicMuted : settings.effectsMuted;
  if (settings.masterMuted || muted) return 0;
  const volume = settings.master * (channel === "music" ? settings.music : settings.effects);
  return volume * volume;
}

/** Settings from browser storage: whatever is missing, malformed, or out of range falls back to the default. */
export function readSettings(raw: string | null | undefined): SoundSettings {
  if (raw === null || raw === undefined || raw === "") return DEFAULT_SOUND;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Storage another version or a hand edit left unreadable: the defaults are the recovery, not an error to report.
    return DEFAULT_SOUND;
  }
  const parsed = Stored.safeParse(json);
  if (!parsed.success) return DEFAULT_SOUND;
  const stored = parsed.data;
  return {
    master: stored.master ?? DEFAULT_SOUND.master,
    music: stored.music ?? DEFAULT_SOUND.music,
    effects: stored.effects ?? DEFAULT_SOUND.effects,
    masterMuted: stored.masterMuted ?? DEFAULT_SOUND.masterMuted,
    musicMuted: stored.musicMuted ?? DEFAULT_SOUND.musicMuted,
    effectsMuted: stored.effectsMuted ?? DEFAULT_SOUND.effectsMuted,
  };
}

function load(): SoundSettings {
  try {
    return readSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be unavailable (a private window, blocked site data); the settings then last for the page.
    return DEFAULT_SOUND;
  }
}

function save(settings: SoundSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // See load: without storage the settings still apply for as long as the page is open.
  }
}

interface SoundStore extends SoundSettings {
  setVolume: (control: Control, value: number) => void;
  toggleMute: (control: Control) => void;
}

const settingsOf = (state: SoundStore): SoundSettings => ({
  master: state.master,
  music: state.music,
  effects: state.effects,
  masterMuted: state.masterMuted,
  musicMuted: state.musicMuted,
  effectsMuted: state.effectsMuted,
});

export const useSound = create<SoundStore>()((set, get) => ({
  ...load(),
  setVolume: (control, value) => {
    const volume = Math.min(1, Math.max(0, value));
    if (control === "master") set({ master: volume });
    else if (control === "music") set({ music: volume });
    else set({ effects: volume });
    save(settingsOf(get()));
  },
  toggleMute: (control) => {
    const state = get();
    if (control === "master") set({ masterMuted: !state.masterMuted });
    else if (control === "music") set({ musicMuted: !state.musicMuted });
    else set({ effectsMuted: !state.effectsMuted });
    save(settingsOf(get()));
  },
}));

export function currentSettings(): SoundSettings {
  return settingsOf(useSound.getState());
}
