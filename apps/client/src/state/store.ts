import type { ActionRequest, ChallengeSummary, FileMap, RunView, SessionLength } from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";

// One store for the client. Game rules never run here: every change of game state comes back from the server as a
// fresh RunView. The store holds what the player is typing, which screen is up, and which request is in flight.

const RUN_KEY = "rootward:run";
const draftKey = (runId: string, roomId: string) => `rootward:draft:${runId}:${roomId}`;

export type Busy = "loading" | "start" | "enter" | "probe" | "cast" | "hint" | "retreat" | "abandon";
export type CenterTab = "task" | "editor";
/** The Guild Board (no run), the expedition map, or a fight. */
export type Screen = "board" | "map" | "encounter";

export interface GameStore {
  challenges: ChallengeSummary[];
  run: RunView | undefined;
  screen: Screen;
  files: FileMap;
  busy: Busy | undefined;
  tab: CenterTab;
  error: string | undefined;
  notice: string | undefined;
  loadChallenges: () => Promise<void>;
  resumeSavedRun: () => Promise<void>;
  startPractice: (challengeId: string, language: string) => Promise<void>;
  startExpedition: (language: string, length: SessionLength) => Promise<void>;
  enterRoom: (roomId: string) => Promise<void>;
  /** Leave a finished fight for the map. */
  showMap: () => void;
  /** Back to the Guild Board. */
  leave: () => void;
  abandon: () => Promise<void>;
  setTab: (tab: CenterTab) => void;
  editFile: (path: string, contents: string) => void;
  resetToStarter: () => void;
  probe: () => Promise<void>;
  cast: () => Promise<void>;
  hint: () => Promise<void>;
  retreat: () => Promise<void>;
  dismiss: () => void;
}

/** Where a loaded run belongs: the map between rooms of an expedition, otherwise its fight. */
function screenFor(run: RunView): Screen {
  return run.expedition && run.expedition.currentRoomId === undefined ? "map" : "encounter";
}

export const useGame = create<GameStore>()((set, get) => {
  /** Show a server run, restoring an unsent draft for its current fight if one was saved. */
  const showRun = (run: RunView, screen: Screen, preferDraft: boolean) => {
    const encounter = run.encounter;
    const draft = preferDraft && encounter ? readDraft(draftKey(run.runId, encounter.roomId)) : undefined;
    writeStorage(RUN_KEY, run.runId);
    set({ run, screen, files: draft ?? encounter?.editorFiles ?? {} });
  };

  /** One request at a time: a busy flag while it runs, and its error in the banner if it fails. */
  const request = async (busy: Busy, work: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy, error: undefined, notice: undefined });
    try {
      await work();
    } catch (error) {
      set({ error: describe(error) });
    } finally {
      set({ busy: undefined });
    }
  };

  const act = (busy: Exclude<Busy, "loading" | "start" | "enter">, action: ActionRequest) =>
    request(busy, async () => {
      const { run } = get();
      if (!run) return;
      const response = await api.act(run.runId, action);
      set({ run: response.run, notice: response.refused?.message });
    });

  return {
    challenges: [],
    run: undefined,
    screen: "board",
    files: {},
    busy: undefined,
    tab: "task",
    error: undefined,
    notice: undefined,

    loadChallenges: async () => {
      set({ busy: "loading", error: undefined });
      try {
        set({ challenges: (await api.challenges()).challenges });
      } catch (error) {
        set({ error: describe(error) });
      } finally {
        set({ busy: undefined });
      }
    },

    resumeSavedRun: async () => {
      const runId = readStorage(RUN_KEY);
      if (runId === undefined) return;
      try {
        const { run } = await api.getRun(runId);
        showRun(run, screenFor(run), true);
      } catch (error) {
        // The run may be gone (for example the server uses a different data directory now). Forget it quietly.
        if (error instanceof ApiError && error.status === 404) removeStorage(RUN_KEY);
        else set({ error: describe(error) });
      }
    },

    startPractice: (challengeId, language) =>
      request("start", async () => {
        const { run } = await api.startEncounter({ challengeId, language });
        showRun(run, "encounter", false);
        set({ tab: "task" });
      }),

    startExpedition: (language, length) =>
      request("start", async () => {
        const { run } = await api.startExpedition({ language, length });
        showRun(run, "map", false);
      }),

    enterRoom: (roomId) =>
      request("enter", async () => {
        const { run } = get();
        if (!run) return;
        const response = await api.enterRoom(run.runId, { roomId });
        if (response.refused) {
          set({ run: response.run, notice: response.refused.message });
          return;
        }
        showRun(response.run, "encounter", true);
        set({ tab: "task" });
      }),

    showMap: () => {
      set({ screen: "map", notice: undefined });
    },

    leave: () => {
      removeStorage(RUN_KEY);
      set({ run: undefined, screen: "board", files: {}, notice: undefined, error: undefined });
      void get().loadChallenges();
    },

    abandon: async () => {
      await act("abandon", { type: "abandon" });
      if (get().error === undefined) get().leave();
    },

    setTab: (tab) => {
      set({ tab });
    },

    editFile: (path, contents) => {
      const files = { ...get().files, [path]: contents };
      set({ files });
      const encounter = get().run?.encounter;
      if (encounter) writeStorage(draftKey(encounter.runId, encounter.roomId), JSON.stringify(files));
    },

    resetToStarter: () => {
      const encounter = get().run?.encounter;
      if (encounter) get().editFile(encounter.challenge.entry, encounter.starterFiles[encounter.challenge.entry] ?? "");
    },

    probe: () => act("probe", { type: "probe", files: get().files }),
    cast: () => act("cast", { type: "cast", files: get().files }),
    hint: () => act("hint", { type: "hint" }),
    retreat: () => act("retreat", { type: "retreat" }),

    dismiss: () => {
      set({ notice: undefined, error: undefined });
    },
  };
});

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function readDraft(key: string): FileMap | undefined {
  const saved = readStorage(key);
  if (saved === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    // A corrupt draft is dropped; the server's copy of the last submission is used instead.
    removeStorage(key);
    return undefined;
  }
}

// Browser storage can be unavailable (private windows, blocked site data). Drafts and resume are conveniences, so
// storage failures are deliberately ignored: the game keeps working with the server's copy of the run.
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

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See the note above readStorage.
  }
}
