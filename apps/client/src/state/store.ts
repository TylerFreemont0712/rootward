import {
  type ActionRequest,
  type ChallengeSummary,
  type DebriefView,
  type FileMap,
  type LearnerView,
  type OverworldRealmSummary,
  type OverworldView,
  ProfileView,
  type RunView,
  type SessionLength,
} from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";

// One store for the client. Game rules never run here: every change of game state comes back from the server as a
// fresh RunView. The store holds what the player is typing, which screen is up, and which request is in flight.

const PROFILE_KEY = "rootward:profile";
const runKey = (profileId: string) => `rootward:run:${profileId}`;
const overworldRunKey = (profileId: string) => `rootward:run:overworld:${profileId}`;
const draftKey = (runId: string, roomId: string) => `rootward:draft:${runId}:${roomId}`;

export type Busy = "loading" | "start" | "enter" | "probe" | "cast" | "hint" | "retreat" | "abandon" | "debrief";
export type CenterTab = "task" | "editor";
/** Character select, the Guild Board (no run), the expedition map, the overworld, a fight, or a finished run's
 * debrief. */
export type Screen = "profiles" | "board" | "map" | "overworld" | "encounter" | "debrief";

export interface GameStore {
  profiles: ProfileView[];
  activeProfile: ProfileView | undefined;
  challenges: ChallengeSummary[];
  learner: LearnerView | undefined;
  run: RunView | undefined;
  debrief: DebriefView | undefined;
  overworldRealms: OverworldRealmSummary[];
  overworld: OverworldView | undefined;
  /** Set while a run started from an overworld marker is in progress, so ending it resolves the marker and returns
   * to the zone instead of the Guild Board. */
  overworldRealmId: string | undefined;
  overworldMarkerId: string | undefined;
  screen: Screen;
  files: FileMap;
  busy: Busy | undefined;
  tab: CenterTab;
  error: string | undefined;
  notice: string | undefined;
  /** Restore the last-played character (if any) and everything that follows from it; called once at startup. */
  restoreProfile: () => Promise<void>;
  createProfile: (name: string) => Promise<void>;
  selectProfile: (profile: ProfileView) => void;
  /** Leave the current character for the select screen; its run and overworld progress are left as they are. */
  switchProfile: () => void;
  loadChallenges: () => Promise<void>;
  loadLearner: () => Promise<void>;
  resumeSavedRun: () => Promise<void>;
  startPractice: (challengeId: string, language: string) => Promise<void>;
  startExpedition: (language: string, length: SessionLength) => Promise<void>;
  enterRoom: (roomId: string) => Promise<void>;
  /** Leave a finished fight for the map. */
  showMap: () => void;
  /** Open the debrief of the current run. */
  showDebrief: () => Promise<void>;
  /** Back to the Guild Board. */
  leave: () => void;
  abandon: () => Promise<void>;
  loadOverworldRealms: () => Promise<void>;
  enterOverworld: (realmId: string, language: string) => Promise<void>;
  /** Persist a new position; the server re-checks walkability. */
  moveOverworld: (x: number, y: number) => Promise<void>;
  startOverworldEncounter: (markerId: string) => Promise<void>;
  /** Resolve the marker behind the just-finished fight and return to the zone. */
  finishOverworldEncounter: () => Promise<void>;
  leaveOverworld: () => void;
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
    const profile = get().activeProfile;
    const encounter = run.encounter;
    const draft = preferDraft && encounter ? readDraft(draftKey(run.runId, encounter.roomId)) : undefined;
    if (profile) writeStorage(runKey(profile.id), run.runId);
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

  const act = (busy: "probe" | "cast" | "hint" | "retreat" | "abandon", action: ActionRequest) =>
    request(busy, async () => {
      const { run, activeProfile } = get();
      if (!run || !activeProfile) return;
      const response = await api.act(activeProfile.id, run.runId, action);
      set({ run: response.run, notice: response.refused?.message });
    });

  return {
    profiles: [],
    activeProfile: undefined,
    challenges: [],
    learner: undefined,
    run: undefined,
    debrief: undefined,
    overworldRealms: [],
    overworld: undefined,
    overworldRealmId: undefined,
    overworldMarkerId: undefined,
    screen: "profiles",
    files: {},
    busy: undefined,
    tab: "task",
    error: undefined,
    notice: undefined,

    restoreProfile: async () => {
      set({ busy: "loading" });
      let candidateId: string | undefined;
      const raw = readStorage(PROFILE_KEY);
      if (raw !== undefined) {
        try {
          const parsed = ProfileView.safeParse(JSON.parse(raw));
          if (parsed.success) candidateId = parsed.data.id;
          else removeStorage(PROFILE_KEY);
        } catch {
          removeStorage(PROFILE_KEY);
        }
      }
      try {
        const { profiles } = await api.profiles();
        set({ profiles, busy: undefined });
        const match = candidateId !== undefined ? profiles.find((p) => p.id === candidateId) : undefined;
        if (match) get().selectProfile(match);
        else {
          removeStorage(PROFILE_KEY);
          set({ screen: "profiles" });
        }
      } catch (error) {
        set({ error: describe(error), busy: undefined, screen: "profiles" });
      }
    },

    createProfile: (name) =>
      request("start", async () => {
        const { profile } = await api.createProfile({ name });
        set({ profiles: [...get().profiles, profile] });
        get().selectProfile(profile);
      }),

    selectProfile: (profile) => {
      writeStorage(PROFILE_KEY, JSON.stringify(profile));
      set({ activeProfile: profile, screen: "board" });
      void get().loadChallenges();
      void get().loadLearner();
      void get().resumeSavedRun();
      void get().loadOverworldRealms();
    },

    switchProfile: () => {
      removeStorage(PROFILE_KEY);
      set({
        activeProfile: undefined,
        run: undefined,
        debrief: undefined,
        overworld: undefined,
        overworldRealmId: undefined,
        overworldMarkerId: undefined,
        screen: "profiles",
        files: {},
        notice: undefined,
        error: undefined,
      });
    },

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

    loadLearner: async () => {
      const profile = get().activeProfile;
      if (!profile) return;
      try {
        set({ learner: (await api.learner(profile.id)).learner });
      } catch (error) {
        set({ error: describe(error) });
      }
    },

    resumeSavedRun: async () => {
      const profile = get().activeProfile;
      if (!profile) return;
      const runId = readStorage(runKey(profile.id));
      if (runId === undefined) return;
      try {
        const { run } = await api.getRun(profile.id, runId);
        const sidecar = readOverworldSidecar(profile.id);
        if (sidecar) set({ overworldRealmId: sidecar.realmId, overworldMarkerId: sidecar.markerId });
        showRun(run, screenFor(run), true);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) removeStorage(runKey(profile.id));
        else set({ error: describe(error) });
      }
    },

    startPractice: (challengeId, language) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { run } = await api.startEncounter(profile.id, { challengeId, language });
        showRun(run, "encounter", false);
        set({ tab: "task" });
      }),

    startExpedition: (language, length) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { run } = await api.startExpedition(profile.id, { language, length });
        showRun(run, "map", false);
      }),

    enterRoom: (roomId) =>
      request("enter", async () => {
        const { run, activeProfile } = get();
        if (!run || !activeProfile) return;
        const response = await api.enterRoom(activeProfile.id, run.runId, { roomId });
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

    showDebrief: () =>
      request("debrief", async () => {
        const { run, activeProfile } = get();
        if (!run || !activeProfile) return;
        const { debrief } = await api.debrief(activeProfile.id, run.runId);
        set({ debrief, screen: "debrief" });
      }),

    leave: () => {
      const profile = get().activeProfile;
      if (profile) removeStorage(runKey(profile.id));
      set({ run: undefined, debrief: undefined, screen: "board", files: {}, notice: undefined, error: undefined });
      void get().loadChallenges();
      void get().loadLearner();
    },

    abandon: async () => {
      await act("abandon", { type: "abandon" });
      if (get().error === undefined) get().leave();
    },

    loadOverworldRealms: async () => {
      const profile = get().activeProfile;
      if (!profile) return;
      try {
        set({ overworldRealms: (await api.overworldRealms(profile.id)).realms });
      } catch (error) {
        set({ error: describe(error) });
      }
    },

    enterOverworld: (realmId, language) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { overworld } = await api.enterOverworld(profile.id, realmId, { language });
        set({ overworld, screen: "overworld" });
      }),

    moveOverworld: async (x, y) => {
      const { activeProfile, overworld } = get();
      if (!activeProfile || !overworld) return;
      try {
        const response = await api.moveOverworld(activeProfile.id, overworld.realmId, { x, y });
        set({ overworld: response.overworld });
      } catch (error) {
        set({ error: describe(error) });
      }
    },

    startOverworldEncounter: (markerId) =>
      request("start", async () => {
        const { activeProfile, overworld } = get();
        if (!activeProfile || !overworld) return;
        const { run } = await api.startMarkerEncounter(activeProfile.id, overworld.realmId, markerId);
        writeOverworldSidecar(activeProfile.id, { realmId: overworld.realmId, markerId });
        set({ overworldRealmId: overworld.realmId, overworldMarkerId: markerId });
        showRun(run, "encounter", false);
        set({ tab: "task" });
      }),

    finishOverworldEncounter: () =>
      request("enter", async () => {
        const { activeProfile, run, overworldRealmId, overworldMarkerId } = get();
        if (!activeProfile || !run || !overworldRealmId || !overworldMarkerId) return;
        const { overworld } = await api.resolveMarkerEncounter(activeProfile.id, overworldRealmId, overworldMarkerId, {
          runId: run.runId,
        });
        clearOverworldSidecar(activeProfile.id);
        removeStorage(runKey(activeProfile.id));
        set({
          overworld,
          overworldRealmId: undefined,
          overworldMarkerId: undefined,
          run: undefined,
          screen: "overworld",
          files: {},
          notice: undefined,
          error: undefined,
        });
      }),

    leaveOverworld: () => {
      set({ screen: "board" });
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

interface OverworldSidecar {
  realmId: string;
  markerId: string;
}

/** Which marker's fight is in progress, so it survives closing the app mid-fight (readDraft's tolerant style). */
function readOverworldSidecar(profileId: string): OverworldSidecar | undefined {
  const saved = readStorage(overworldRunKey(profileId));
  if (saved === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).realmId === "string" &&
      typeof (parsed as Record<string, unknown>).markerId === "string"
    ) {
      return parsed as OverworldSidecar;
    }
    return undefined;
  } catch {
    removeStorage(overworldRunKey(profileId));
    return undefined;
  }
}

function writeOverworldSidecar(profileId: string, sidecar: OverworldSidecar): void {
  writeStorage(overworldRunKey(profileId), JSON.stringify(sidecar));
}

function clearOverworldSidecar(profileId: string): void {
  removeStorage(overworldRunKey(profileId));
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
