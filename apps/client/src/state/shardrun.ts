import type { ShardrunCommandRequest, ShardrunLogView, ShardrunView } from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";
import { playbackMs } from "../shardrun/playback.ts";

/** Log entries kept for the battle log. */
const HISTORY = 60;

// Shardrun's client state (ADR-0012), kept apart from the main store because nothing else reads it. As everywhere in
// the client, no rule runs here: every change comes back from the server as a fresh ShardrunView.

type Battle = NonNullable<ShardrunView["battle"]>;

export interface ShardrunStore {
  profileId: string | undefined;
  run: ShardrunView | undefined;
  languages: string[];
  loaded: boolean;
  busy: boolean;
  error: string | undefined;
  /** Counts responses, so the arena replays each new log exactly once. */
  beat: number;
  /** Recent log entries across commands, newest last, for the battle log. */
  history: ShardrunLogView[];
  /** The last battle, held on screen while the log of the command that ended it plays out. */
  afterglow: { run: ShardrunView; battle: Battle } | undefined;
  load: (profileId: string) => Promise<void>;
  start: (language: string) => Promise<void>;
  command: (request: ShardrunCommandRequest) => Promise<void>;
  dismissError: () => void;
}

export const useShardrun = create<ShardrunStore>()((set, get) => {
  let afterglowTimer: number | undefined;

  const send = async (work: (profileId: string) => Promise<ShardrunView>, fresh = false) => {
    const { profileId, busy, run: before } = get();
    if (profileId === undefined || busy) return;
    set({ busy: true, error: undefined });
    try {
      const run = await work(profileId);
      window.clearTimeout(afterglowTimer);
      const beat = get().beat + 1;
      set({ history: [...(fresh ? [] : get().history), ...run.log].slice(-HISTORY) });
      if (before?.battle && before.status === "battle" && run.status !== "battle") {
        // The winning (or losing) blow changes the screen at once; keep the arena up until its animation has played.
        const defeated = new Set(run.log.flatMap((entry) => (entry.kind === "defeat" && entry.foe !== undefined ? [entry.foe] : [])));
        const battle = { ...before.battle, foes: before.battle.foes.map((foe) => (defeated.has(foe.uid) ? { ...foe, hp: 0 } : foe)) };
        set({ run, beat, afterglow: { run: { ...run, spells: before.spells }, battle } });
        afterglowTimer = window.setTimeout(() => {
          set({ afterglow: undefined });
        }, playbackMs(run.log) + 400);
      } else {
        set({ run, beat, afterglow: undefined });
      }
    } catch (error) {
      set({ error: describe(error) });
    } finally {
      set({ busy: false });
    }
  };

  return {
    profileId: undefined,
    run: undefined,
    languages: [],
    loaded: false,
    busy: false,
    error: undefined,
    beat: 0,
    history: [],
    afterglow: undefined,

    load: async (profileId) => {
      if (get().profileId !== profileId) set({ profileId, run: undefined, loaded: false, afterglow: undefined });
      try {
        const { run, languages } = await api.shardrun(profileId);
        if (get().profileId !== profileId) return;
        set({ run: run ?? undefined, languages, loaded: true });
      } catch (error) {
        set({ error: describe(error), loaded: true });
      }
    },

    start: (language) => send(async (profileId) => (await api.startShardrun(profileId, { language })).run, true),
    command: (request) => send(async (profileId) => (await api.shardrunCommand(profileId, request)).run),

    dismissError: () => {
      set({ error: undefined });
    },
  };
});

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
