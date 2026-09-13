import type { ActionRequest, ChallengeSummary, EncounterResponse, EncounterView, FileMap } from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";

// One store for M0's two screens. Game rules never run here: every change of game state comes back from the server
// as a fresh EncounterView. The store only holds what the player is typing and which request is in flight.

const RUN_KEY = "rootward:run";
const draftKey = (runId: string) => `rootward:draft:${runId}`;

export type Busy = "loading" | "start" | "probe" | "cast" | "hint" | "retreat";
export type CenterTab = "task" | "editor";

export interface GameStore {
  challenges: ChallengeSummary[];
  view: EncounterView | undefined;
  files: FileMap;
  busy: Busy | undefined;
  tab: CenterTab;
  error: string | undefined;
  notice: string | undefined;
  loadChallenges: () => Promise<void>;
  resumeSavedRun: () => Promise<void>;
  start: (challengeId: string, language: string) => Promise<void>;
  leave: () => void;
  setTab: (tab: CenterTab) => void;
  editFile: (path: string, contents: string) => void;
  resetToStarter: () => void;
  probe: () => Promise<void>;
  cast: () => Promise<void>;
  hint: () => Promise<void>;
  retreat: () => Promise<void>;
  dismiss: () => void;
}

export const useGame = create<GameStore>()((set, get) => {
  /** Show a server view, restoring an unsent draft for this run if one was saved. */
  const showView = (view: EncounterView, preferDraft: boolean) => {
    const draft = preferDraft ? readDraft(view.runId) : undefined;
    writeStorage(RUN_KEY, view.runId);
    set({ view, files: draft ?? view.editorFiles });
  };

  const act = async (busy: Exclude<Busy, "loading" | "start">, action: ActionRequest) => {
    const { view } = get();
    if (!view || get().busy) return;
    set({ busy, error: undefined, notice: undefined });
    try {
      const response: EncounterResponse = await api.act(view.runId, action);
      set({ view: response.view, notice: response.refused?.message });
    } catch (error) {
      set({ error: describe(error) });
    } finally {
      set({ busy: undefined });
    }
  };

  return {
    challenges: [],
    view: undefined,
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
        showView((await api.getRun(runId)).view, true);
      } catch (error) {
        // The server keeps runs in memory until M1, so a restart forgets them. That is expected, not an error.
        if (error instanceof ApiError && error.status === 404) removeStorage(RUN_KEY);
        else set({ error: describe(error) });
      }
    },

    start: async (challengeId, language) => {
      set({ busy: "start", error: undefined, notice: undefined });
      try {
        const { view } = await api.startEncounter({ challengeId, language });
        showView(view, false);
        set({ tab: "task" });
      } catch (error) {
        set({ error: describe(error) });
      } finally {
        set({ busy: undefined });
      }
    },

    leave: () => {
      removeStorage(RUN_KEY);
      set({ view: undefined, files: {}, notice: undefined, error: undefined });
      void get().loadChallenges();
    },

    setTab: (tab) => {
      set({ tab });
    },

    editFile: (path, contents) => {
      const files = { ...get().files, [path]: contents };
      set({ files });
      const runId = get().view?.runId;
      if (runId !== undefined) writeStorage(draftKey(runId), JSON.stringify(files));
    },

    resetToStarter: () => {
      const { view } = get();
      if (view) get().editFile(view.challenge.entry, view.starterFiles[view.challenge.entry] ?? "");
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

function readDraft(runId: string): FileMap | undefined {
  const saved = readStorage(draftKey(runId));
  if (saved === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    // A corrupt draft is dropped; the server's copy of the last submission is used instead.
    removeStorage(draftKey(runId));
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
