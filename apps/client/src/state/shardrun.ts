import type {
  ShardrunCommandRequest,
  ShardrunDevRequest,
  ShardrunDifficultyView,
  ShardrunLogView,
  ShardrunPlaystyleView,
  ShardrunView,
  SpellRunView,
} from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";
import { NOTHING_PENDING, type Pending, pendingOf, settled } from "../shardrun/fx/pending.ts";
import { type Cue, playbackMs } from "../shardrun/fx/timeline.ts";
import type { CodeSpeed } from "../shardrun/source.ts";

// Shardrun's client state (ADR-0012, ADR-0013), kept apart from the main store because nothing else reads it. As
// everywhere in the client, no rule runs here: every change comes back from the server as a fresh ShardrunView.

type Battle = NonNullable<ShardrunView["battle"]>;

/** Log entries kept for the battle log. */
const HISTORY = 60;
const SPEED_KEY = "rootward:shardrun:code-speed";
const DIFFICULTY_KEY = "rootward:shardrun:difficulty";
const SHAKE_KEY = "rootward:shardrun:shake";
const BUILD_CODE_KEY = "rootward:shardrun:build-code";
const SPEEDS: readonly CodeSpeed[] = ["off", "slow", "normal", "fast"];
/** How long a cast's score stays up after its hits have landed, then how long it takes to fade. */
const SCORE_LINGER_MS = 900;
const SCORE_FADE_MS = 400;

export interface ShardrunStore {
  profileId: string | undefined;
  /** Which of the character's runs this screen is about (ADR-0020): the menu card that opened it decides. */
  playstyle: ShardrunPlaystyleView;
  /** The playstyles the content offers. */
  playstyles: ShardrunPlaystyleView[];
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
  /** The last beat whose log the stage has started playing: coming back to the fight does not play it again. */
  shownBeat: number;
  /** Recent log entries across commands, newest last, for the battle log. */
  history: ShardrunLogView[];
  /** The last battle, held on screen while the log of the command that ended it plays out. */
  afterglow: { run: ShardrunView; battle: Battle } | undefined;
  /**
   * The last cast, step by step. While `phase` is `code` it plays as code; after that its score stays on the stage
   * while the hits land, and it is cleared a moment after they have (see `settleAll`).
   */
  replay: { beat: number; spellId: string; shards: string[]; run: SpellRunView } | undefined;
  /** The lingering score is on its way out. */
  replayFading: boolean;
  /** `code` while a cast plays as code; `log` once its hits may play. */
  phase: "code" | "log";
  /** The battle as it stood before the cast, shown while its code plays, so no HP bar gives the result away early. */
  staged: Battle | undefined;
  /** What the stage still has to show of the last command (see `Pending`). */
  pending: Pending;
  codeSpeed: CodeSpeed;
  /** Shake the stage on heavy hits (a per-browser option; prefers-reduced-motion turns it off regardless). */
  shake: boolean;
  /** A deck run shows the spell being built as code, growing with every card (ADR-0020); on unless turned off. */
  buildCode: boolean;
  difficulty: string;
  /** Switch to the run of another playstyle; the screen loads it next. */
  choosePlaystyle: (playstyle: ShardrunPlaystyleView) => void;
  load: (profileId: string) => Promise<void>;
  start: (language: string, sandbox?: boolean) => Promise<void>;
  command: (request: ShardrunCommandRequest) => Promise<void>;
  /** A dev tool: only answered for a sandbox run on a dev server. */
  devCommand: (request: ShardrunDevRequest) => Promise<void>;
  /** The code playback finished or was skipped: let the hits play. */
  finishReplay: () => void;
  /** The stage has started playing the log of `beat`. */
  markShown: (beat: number) => void;
  /** A cue has played on the stage: move its share of the pending numbers onto the bars. */
  settle: (cue: Cue) => void;
  /** The stage has shown everything. */
  settleAll: () => void;
  setCodeSpeed: (speed: CodeSpeed) => void;
  setShake: (on: boolean) => void;
  setBuildCode: (on: boolean) => void;
  setDifficulty: (id: string) => void;
  dismissError: () => void;
}

export const useShardrun = create<ShardrunStore>()((set, get) => {
  let afterglowTimer: number | undefined;

  let replayTimers: number[] = [];
  const clearReplayTimers = () => {
    for (const timer of replayTimers) window.clearTimeout(timer);
    replayTimers = [];
  };
  /** Let the cast of `beat` keep its score up a little longer, then fade it and let it go. */
  const retireReplay = (beat: number) => {
    clearReplayTimers();
    replayTimers = [
      window.setTimeout(() => {
        if (get().replay?.beat === beat) set({ replayFading: true });
      }, SCORE_LINGER_MS),
      window.setTimeout(() => {
        if (get().replay?.beat === beat) set({ replay: undefined, replayFading: false });
      }, SCORE_LINGER_MS + SCORE_FADE_MS),
    ];
  };

  const clearAfterglowIn = (ms: number) => {
    window.clearTimeout(afterglowTimer);
    afterglowTimer = window.setTimeout(() => {
      set({ afterglow: undefined });
    }, ms);
  };
  // The stage says when its last cue has played (`settleAll`), and the arena leaves soon after. This timer is only the
  // fallback for a stage that never finishes, such as a hidden tab, whose animation frames have stopped; it allows for
  // the pauses heavy hits add to the plain timeline.
  const clearAfterglowLater = () => {
    clearAfterglowIn(playbackMs(get().run?.log ?? []) * 1.6 + 1200);
  };

  /** Fill in spell previews once the sandbox has run them, unless the run has moved on since. */
  const loadPreviews = async (profileId: string, playstyle: ShardrunPlaystyleView, revision: number) => {
    try {
      const previews = await api.shardrunPreviews(profileId, playstyle);
      const current = get().run;
      const moved = get().profileId !== profileId || get().playstyle !== playstyle;
      if (moved || current?.revision !== revision || previews.revision !== revision) return;
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

  const send = async (work: (profileId: string, playstyle: ShardrunPlaystyleView) => Promise<ShardrunView>, fresh = false) => {
    const { profileId, playstyle, busy, run: before } = get();
    if (profileId === undefined || busy) return;
    set({ busy: true, error: undefined });
    try {
      const run = await work(profileId, playstyle);
      // The player went to the other playstyle's run while this one answered: it is not the run on screen any more.
      if (get().playstyle !== playstyle || get().profileId !== profileId) return;
      window.clearTimeout(afterglowTimer);
      const beat = get().beat + 1;
      const history = [...(fresh ? [] : get().history), ...run.log].slice(-HISTORY);
      // Every cast is kept, so its score can stay on the stage while its hits land; only its code playing first
      // depends on the option.
      const replay = run.replay ? { beat, spellId: run.replay.spellId, shards: run.replay.shards, run: run.replay.run } : undefined;
      const playsCode = replay !== undefined && get().codeSpeed !== "off";
      const phase = playsCode ? "code" : "log";
      const staged = playsCode ? before?.battle : undefined;
      const pending = pendingOf(run.log);
      clearReplayTimers();
      if (before?.battle && before.status === "battle" && run.status !== "battle") {
        // The winning (or losing) blow changes the screen at once; keep the arena up until its code and hits have played.
        // The held battle carries the foes' HP *after* the blow, like any other view, so the pending ledger applies to it.
        const battle = {
          ...before.battle,
          foes: before.battle.foes.map((foe) => ({
            ...foe,
            hp: Math.max(0, Math.min(foe.max, foe.hp - (pending.damage[foe.uid] ?? 0) + (pending.mending[foe.uid] ?? 0))),
          })),
        };
        set({ run, beat, history, replay, replayFading: false, phase, staged, pending, afterglow: { run: { ...run, spells: before.spells }, battle } });
        if (phase === "log") clearAfterglowLater();
      } else {
        set({ run, beat, history, replay, replayFading: false, phase, staged, pending, afterglow: undefined });
      }
      if (run.battle && run.previews === "pending") void loadPreviews(profileId, playstyle, run.revision);
    } catch (error) {
      set({ error: describe(error) });
    } finally {
      set({ busy: false });
    }
  };

  /** Forget everything about the run on screen: another character's or another playstyle's is about to load. */
  const cleared = (): Partial<ShardrunStore> => ({
    run: undefined,
    loaded: false,
    afterglow: undefined,
    replay: undefined,
    replayFading: false,
    phase: "log",
    staged: undefined,
    pending: NOTHING_PENDING,
    history: [],
  });

  return {
    profileId: undefined,
    playstyle: "spellbook",
    playstyles: ["spellbook"],
    run: undefined,
    languages: [],
    difficulties: [],
    loaded: false,
    dev: false,
    busy: false,
    error: undefined,
    beat: 0,
    shownBeat: 0,
    history: [],
    afterglow: undefined,
    replay: undefined,
    replayFading: false,
    phase: "log",
    staged: undefined,
    pending: NOTHING_PENDING,
    codeSpeed: readSpeed(),
    shake: readStorage(SHAKE_KEY) !== "off",
    buildCode: readStorage(BUILD_CODE_KEY) !== "off",
    difficulty: readStorage(DIFFICULTY_KEY) ?? "beginner",

    choosePlaystyle: (playstyle) => {
      if (get().playstyle === playstyle) return;
      window.clearTimeout(afterglowTimer);
      clearReplayTimers();
      set({ ...cleared(), playstyle });
    },

    load: async (profileId) => {
      const { playstyle } = get();
      if (get().profileId !== profileId) {
        window.clearTimeout(afterglowTimer);
        clearReplayTimers();
        set({ ...cleared(), profileId });
      }
      try {
        const { run, languages, difficulties, dev, playstyles } = await api.shardrun(profileId, playstyle);
        if (get().profileId !== profileId || get().playstyle !== playstyle) return;
        const known = difficulties.some((difficulty) => difficulty.id === get().difficulty);
        set({
          run: run ?? undefined,
          languages,
          difficulties,
          dev,
          playstyles,
          loaded: true,
          ...(known ? {} : { difficulty: difficulties[0]?.id ?? "beginner" }),
        });
        if (run?.battle && run.previews === "pending") void loadPreviews(profileId, playstyle, run.revision);
      } catch (error) {
        set({ error: describe(error), loaded: true });
      }
    },

    start: (language, sandbox = false) =>
      send(
        async (profileId, playstyle) =>
          (await api.startShardrun(profileId, { language, difficulty: get().difficulty, sandbox, playstyle })).run,
        true,
      ),
    command: (request) => send(async (profileId, playstyle) => (await api.shardrunCommand(profileId, playstyle, request)).run),
    devCommand: (request) => send(async (profileId, playstyle) => (await api.shardrunDev(profileId, playstyle, request)).run),

    finishReplay: () => {
      if (get().phase === "log") return;
      // The replay stays: its score lingers over the hits that are about to play.
      set({ phase: "log", staged: undefined });
      if (get().afterglow) clearAfterglowLater();
    },

    markShown: (beat) => {
      if (get().shownBeat < beat) set({ shownBeat: beat });
    },

    settle: (cue) => {
      const next = settled(get().pending, cue);
      if (next !== get().pending) set({ pending: next });
    },

    settleAll: () => {
      if (get().pending !== NOTHING_PENDING) set({ pending: NOTHING_PENDING });
      if (get().phase !== "log") return;
      const replay = get().replay;
      // A fight's last cast keeps the arena up until its score has faded, so the finishing blow's numbers are seen.
      if (get().afterglow) clearAfterglowIn(replay ? SCORE_LINGER_MS + SCORE_FADE_MS : 450);
      if (replay) retireReplay(replay.beat);
    },

    setCodeSpeed: (speed) => {
      writeStorage(SPEED_KEY, speed);
      set({ codeSpeed: speed });
    },

    setShake: (on) => {
      writeStorage(SHAKE_KEY, on ? "on" : "off");
      set({ shake: on });
    },

    setBuildCode: (on) => {
      writeStorage(BUILD_CODE_KEY, on ? "on" : "off");
      set({ buildCode: on });
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
