import type {
  ShardrunCommandRequest,
  ShardrunDevRequest,
  ShardrunDifficultyView,
  ShardrunLogView,
  ShardrunView,
  SpellRunView,
} from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";
import { playbackMs } from "../shardrun/playback.ts";
import type { CodeSpeed } from "../shardrun/source.ts";

// Shardrun's client state (ADR-0012, ADR-0013), kept apart from the main store because nothing else reads it. As
// everywhere in the client, no rule runs here: every change comes back from the server as a fresh ShardrunView.

type Battle = NonNullable<ShardrunView["battle"]>;

/** Log entries kept for the battle log. */
const HISTORY = 60;
const SPEED_KEY = "rootward:shardrun:code-speed";
const DIFFICULTY_KEY = "rootward:shardrun:difficulty";
const SPEEDS: readonly CodeSpeed[] = ["off", "slow", "normal", "fast"];

export interface ShardrunStore {
  profileId: string | undefined;
  run: ShardrunView | undefined;
  languages: string[];
  difficulties: ShardrunDifficultyView[];
  loaded: boolean;
  /** Whether this server was started with ROOTWARD_DEV: sandbox runs and the dev drawer only exist when it was. */
  dev: boolean;
  busy: boolean;
  error: string | undefined;
  /** Counts responses, so the arena replays each new log exactly once. */
  beat: number;
  /** Recent log entries across commands, newest last, for the battle log. */
  history: ShardrunLogView[];
  /** The last battle, held on screen while the log of the command that ended it plays out. */
  afterglow: { run: ShardrunView; battle: Battle } | undefined;
  /** A cast to play as code before its hits land. */
  replay: { beat: number; spellId: string; run: SpellRunView } | undefined;
  /** `code` while a cast plays as code; `log` once its hits may play. */
  phase: "code" | "log";
  /** The battle as it stood before the cast, shown while its code plays, so no HP bar gives the result away early. */
  staged: Battle | undefined;
  codeSpeed: CodeSpeed;
  difficulty: string;
  load: (profileId: string) => Promise<void>;
  start: (language: string, sandbox?: boolean) => Promise<void>;
  command: (request: ShardrunCommandRequest) => Promise<void>;
  /** A dev tool: only answered for a sandbox run on a dev server. */
  devCommand: (request: ShardrunDevRequest) => Promise<void>;
  /** The code playback finished or was skipped: let the hits play. */
  finishReplay: () => void;
  setCodeSpeed: (speed: CodeSpeed) => void;
  setDifficulty: (id: string) => void;
  dismissError: () => void;
}

export const useShardrun = create<ShardrunStore>()((set, get) => {
  let afterglowTimer: number | undefined;

  const clearAfterglowLater = () => {
    window.clearTimeout(afterglowTimer);
    afterglowTimer = window.setTimeout(() => {
      set({ afterglow: undefined });
    }, playbackMs(get().run?.log ?? []) + 400);
  };

  /** Fill in spell previews once the sandbox has run them, unless the run has moved on since. */
  const loadPreviews = async (profileId: string, revision: number) => {
    try {
      const previews = await api.shardrunPreviews(profileId);
      const current = get().run;
      if (get().profileId !== profileId || current?.revision !== revision || previews.revision !== revision) return;
      set({
        run: {
          ...current,
          previews: "ready",
          spells: current.spells.map((spell) => {
            const preview = previews.spells[spell.id];
            return preview ? { ...spell, preview } : spell;
          }),
        },
      });
    } catch (error) {
      set({ error: describe(error) });
    }
  };

  const send = async (work: (profileId: string) => Promise<ShardrunView>, fresh = false) => {
    const { profileId, busy, run: before } = get();
    if (profileId === undefined || busy) return;
    set({ busy: true, error: undefined });
    try {
      const run = await work(profileId);
      window.clearTimeout(afterglowTimer);
      const beat = get().beat + 1;
      const history = [...(fresh ? [] : get().history), ...run.log].slice(-HISTORY);
      const replay = run.replay && get().codeSpeed !== "off" ? { beat, spellId: run.replay.spellId, run: run.replay.run } : undefined;
      const phase = replay ? "code" : "log";
      const staged = replay ? before?.battle : undefined;
      if (before?.battle && before.status === "battle" && run.status !== "battle") {
        // The winning (or losing) blow changes the screen at once; keep the arena up until its code and hits have played.
        const defeated = new Set(run.log.flatMap((entry) => (entry.kind === "defeat" && entry.foe !== undefined ? [entry.foe] : [])));
        const battle = { ...before.battle, foes: before.battle.foes.map((foe) => (defeated.has(foe.uid) ? { ...foe, hp: 0 } : foe)) };
        set({ run, beat, history, replay, phase, staged, afterglow: { run: { ...run, spells: before.spells }, battle } });
        if (phase === "log") clearAfterglowLater();
      } else {
        set({ run, beat, history, replay, phase, staged, afterglow: undefined });
      }
      if (run.battle && run.previews === "pending") void loadPreviews(profileId, run.revision);
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
    difficulties: [],
    loaded: false,
    dev: false,
    busy: false,
    error: undefined,
    beat: 0,
    history: [],
    afterglow: undefined,
    replay: undefined,
    phase: "log",
    staged: undefined,
    codeSpeed: readSpeed(),
    difficulty: readStorage(DIFFICULTY_KEY) ?? "beginner",

    load: async (profileId) => {
      if (get().profileId !== profileId) set({ profileId, run: undefined, loaded: false, afterglow: undefined, replay: undefined, phase: "log" });
      try {
        const { run, languages, difficulties, dev } = await api.shardrun(profileId);
        if (get().profileId !== profileId) return;
        const known = difficulties.some((difficulty) => difficulty.id === get().difficulty);
        set({
          run: run ?? undefined,
          languages,
          difficulties,
          dev,
          loaded: true,
          ...(known ? {} : { difficulty: difficulties[0]?.id ?? "beginner" }),
        });
        if (run?.battle && run.previews === "pending") void loadPreviews(profileId, run.revision);
      } catch (error) {
        set({ error: describe(error), loaded: true });
      }
    },

    start: (language, sandbox = false) =>
      send(async (profileId) => (await api.startShardrun(profileId, { language, difficulty: get().difficulty, sandbox })).run, true),
    command: (request) => send(async (profileId) => (await api.shardrunCommand(profileId, request)).run),
    devCommand: (request) => send(async (profileId) => (await api.shardrunDev(profileId, request)).run),

    finishReplay: () => {
      if (get().phase === "log") return;
      set({ phase: "log", replay: undefined, staged: undefined });
      if (get().afterglow) clearAfterglowLater();
    },

    setCodeSpeed: (speed) => {
      writeStorage(SPEED_KEY, speed);
      set({ codeSpeed: speed });
    },

    setDifficulty: (id) => {
      writeStorage(DIFFICULTY_KEY, id);
      set({ difficulty: id });
    },

    dismissError: () => {
      set({ error: undefined });
    },
  };
});

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function readSpeed(): CodeSpeed {
  const saved = readStorage(SPEED_KEY);
  return SPEEDS.find((speed) => speed === saved) ?? "normal";
}

// Browser storage can be unavailable (private windows, blocked site data); these settings are conveniences, so a
// failure just means the defaults are used.
function readStorage(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // See the note above readStorage.
  }
}
