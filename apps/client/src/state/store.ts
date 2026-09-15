import {
  type ActionRequest,
  type ChallengeSummary,
  type ClassCardView,
  type ConversationView,
  type DebriefView,
  type FileMap,
  type LearnerView,
  type ProfileSummaryView,
  ProfileView,
  type RunView,
  type SessionLength,
  type StartingClassView,
  type WorldActionResponse,
  type WorldScreenId,
  type WorldView,
} from "@rootward/shared";
import { create } from "zustand";
import { api, ApiError } from "../api/client.ts";

// One store for the client. Game rules never run here: every change of game state comes back from the server as a
// fresh RunView or WorldView. The store holds what the player is typing, which screen is up, and which request is in
// flight.

const PROFILE_KEY = "rootward:profile";
/** The character played last; kept when switching characters, so the title screen can offer to continue. */
const LAST_PROFILE_KEY = "rootward:last-profile";
const runKey = (profileId: string) => `rootward:run:${profileId}`;
/** Which world marker the saved run was started from, so closing the app mid-fight still returns to the world. */
const worldFightKey = (profileId: string) => `rootward:run:world:${profileId}`;
const draftKey = (runId: string, roomId: string) => `rootward:draft:${runId}:${roomId}`;

export type Busy = "loading" | "start" | "enter" | "probe" | "cast" | "hint" | "retreat" | "abandon" | "debrief" | "world";
export type CenterTab = "task" | "editor";
/** Character select, the main menu, the walkable world, the Guild Board, the expedition map, a fight, a finished run's
 * debrief, or Shardrun, the roguelite mode (ADR-0012). */
export type Screen = "profiles" | "menu" | "world" | "board" | "map" | "encounter" | "debrief" | "shardrun";
/** A part of the Guild Board the world can send the player straight to. */
export type BoardSection = "chronicle" | "practice";

export interface Toast {
  id: number;
  text: string;
}

/** Where each world screen opens the Guild Board; the board itself opens at its top. */
const BOARD_SECTION: Readonly<Record<Exclude<WorldScreenId, "shardrun">, BoardSection | undefined>> = {
  "guild-board": undefined,
  chronicle: "chronicle",
  practice: "practice",
};

export interface GameStore {
  profiles: ProfileView[];
  /** Profile id -> what that character has done, for the title screen. */
  profileSummaries: Record<string, ProfileSummaryView>;
  startingClass: StartingClassView | undefined;
  /** Every class for the picker, playable and planned. */
  classes: ClassCardView[];
  lastProfileId: string | undefined;
  activeProfile: ProfileView | undefined;
  challenges: ChallengeSummary[];
  learner: LearnerView | undefined;
  run: RunView | undefined;
  debrief: DebriefView | undefined;
  /** The character's world, or undefined before they arrive in it. */
  world: WorldView | undefined;
  /** False until the first world request for this character answers: "not arrived yet" versus "still asking". */
  worldLoaded: boolean;
  /** Bumped whenever the world is re-read from the server, so the world screen drops any local walking state. */
  worldEpoch: number;
  conversation: ConversationView | undefined;
  /** Set while a run started from a world marker is in progress, so ending it resolves the marker and returns to the
   * world instead of the Guild Board. */
  worldMarkerId: string | undefined;
  toasts: Toast[];
  boardSection: BoardSection | undefined;
  screen: Screen;
  files: FileMap;
  busy: Busy | undefined;
  tab: CenterTab;
  error: string | undefined;
  notice: string | undefined;
  /** Restore the last-played character (if any) and everything that follows from it; called once at startup. */
  restoreProfile: () => Promise<void>;
  /** Refresh the character list and summaries. */
  loadProfiles: () => Promise<void>;
  createProfile: (name: string, classId: string) => Promise<void>;
  selectProfile: (profile: ProfileView) => void;
  /** Leave the current character for the select screen; its run and world progress are left as they are. */
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
  /** The main menu: pick a mode for the active character. */
  showMenu: () => void;
  showWorld: () => void;
  showBoard: (section?: BoardSection) => void;
  clearBoardSection: () => void;
  /** Shardrun keeps its own run state (state/shardrun.ts); this only switches to its screen. */
  showShardrun: () => void;
  loadWorld: () => Promise<void>;
  /** Arrive in the world, or change the language its fights are played in. */
  startWorld: (language: string) => Promise<void>;
  /** Save where the Maintainer stopped walking; the server re-checks the spot. */
  moveWorld: (x: number, y: number) => Promise<void>;
  travel: (portalId: string) => Promise<void>;
  talk: (npcId: string) => Promise<void>;
  /** Pick a choice (by its index in the conversation) in the open conversation. */
  choose: (index: number) => Promise<void>;
  inspect: (featureId: string) => Promise<void>;
  closeConversation: () => void;
  startWorldEncounter: (markerId: string) => Promise<void>;
  /** Resolve the marker behind the just-finished fight and return to the world. */
  finishWorldEncounter: () => Promise<void>;
  dismissToast: (id: number) => void;
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
  let nextToastId = 0;

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

  const toast = (texts: readonly string[]) => {
    if (texts.length > 0) set({ toasts: [...get().toasts, ...texts.map((text) => ({ id: ++nextToastId, text }))] });
  };

  const worldRequest = (work: (profileId: string) => Promise<WorldActionResponse>) =>
    request("world", async () => {
      const profile = get().activeProfile;
      if (!profile) return;
      const response = await work(profile.id);
      set({ world: response.world, conversation: response.conversation });
      toast(response.notices);
      if (response.open) {
        set({ conversation: undefined });
        if (response.open === "shardrun") get().showShardrun();
        else get().showBoard(BOARD_SECTION[response.open]);
      }
    });

  /** A fight started outside the world must not be resolved as a world marker's fight later. */
  const forgetWorldFight = () => {
    const profile = get().activeProfile;
    if (profile) removeStorage(worldFightKey(profile.id));
    set({ worldMarkerId: undefined });
  };

  return {
    profiles: [],
    profileSummaries: {},
    startingClass: undefined,
    classes: [],
    lastProfileId: undefined,
    activeProfile: undefined,
    challenges: [],
    learner: undefined,
    run: undefined,
    debrief: undefined,
    world: undefined,
    worldLoaded: false,
    worldEpoch: 0,
    conversation: undefined,
    worldMarkerId: undefined,
    toasts: [],
    boardSection: undefined,
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
        const { profiles, summaries, startingClass, classes } = await api.profiles();
        set({ profiles, profileSummaries: summaries, startingClass, classes, lastProfileId: readStorage(LAST_PROFILE_KEY), busy: undefined });
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

    loadProfiles: async () => {
      try {
        const { profiles, summaries, startingClass, classes } = await api.profiles();
        set({ profiles, profileSummaries: summaries, startingClass, classes });
      } catch (error) {
        set({ error: describe(error) });
      }
    },

    createProfile: (name, classId) =>
      request("start", async () => {
        const { profile } = await api.createProfile({ name, classId });
        set({ profiles: [...get().profiles, profile] });
        get().selectProfile(profile);
      }),

    selectProfile: (profile) => {
      writeStorage(PROFILE_KEY, JSON.stringify(profile));
      writeStorage(LAST_PROFILE_KEY, profile.id);
      set({
        activeProfile: profile,
        lastProfileId: profile.id,
        screen: "menu",
        world: undefined,
        worldLoaded: false,
        conversation: undefined,
      });
      void get().loadChallenges();
      void get().loadLearner();
      void get().loadWorld();
      void get().resumeSavedRun();
    },

    switchProfile: () => {
      removeStorage(PROFILE_KEY);
      set({
        activeProfile: undefined,
        run: undefined,
        debrief: undefined,
        world: undefined,
        worldLoaded: false,
        conversation: undefined,
        worldMarkerId: undefined,
        screen: "profiles",
        files: {},
        notice: undefined,
        error: undefined,
      });
      void get().loadProfiles();
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
        set({ worldMarkerId: readStorage(worldFightKey(profile.id)) });
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
        forgetWorldFight();
        showRun(run, "encounter", false);
        set({ tab: "task" });
      }),

    startExpedition: (language, length) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { run } = await api.startExpedition(profile.id, { language, length });
        forgetWorldFight();
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

    showMenu: () => {
      set({ screen: "menu", notice: undefined, conversation: undefined });
    },

    showWorld: () => {
      set({ screen: "world", notice: undefined });
      if (!get().worldLoaded) void get().loadWorld();
    },

    showBoard: (section) => {
      set({ screen: "board", boardSection: section, notice: undefined });
      void get().loadLearner();
    },

    clearBoardSection: () => {
      set({ boardSection: undefined });
    },

    showShardrun: () => {
      set({ screen: "shardrun", notice: undefined });
    },

    loadWorld: async () => {
      const profile = get().activeProfile;
      if (!profile) return;
      try {
        const { world } = await api.world(profile.id);
        if (get().activeProfile?.id !== profile.id) return;
        set({ world: world ?? undefined, worldLoaded: true, worldEpoch: get().worldEpoch + 1 });
      } catch (error) {
        set({ error: describe(error), worldLoaded: true });
      }
    },

    startWorld: (language) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { world } = await api.startWorld(profile.id, { language });
        set({ world, worldLoaded: true, screen: "world" });
      }),

    moveWorld: async (x, y) => {
      const profile = get().activeProfile;
      if (!profile || !get().world) return;
      try {
        const { position } = await api.moveWorld(profile.id, { x, y });
        const current = get().world;
        if (current && get().activeProfile?.id === profile.id) set({ world: { ...current, position } });
      } catch (error) {
        // The server refused the spot, so the walker on screen is out of step with it: take the server's world again.
        set({ error: describe(error) });
        await get().loadWorld();
      }
    },

    travel: (portalId) => worldRequest((profileId) => api.travel(profileId, { portalId })),
    talk: (npcId) => worldRequest((profileId) => api.talk(profileId, { npcId })),
    inspect: (featureId) => worldRequest((profileId) => api.inspect(profileId, { featureId })),

    choose: async (index) => {
      const conversation = get().conversation;
      if (conversation?.npcId === undefined || conversation.nodeId === undefined) {
        set({ conversation: undefined });
        return;
      }
      const { npcId, nodeId } = conversation;
      await worldRequest((profileId) => api.choose(profileId, { npcId, nodeId, choice: index }));
    },

    closeConversation: () => {
      set({ conversation: undefined });
    },

    startWorldEncounter: (markerId) =>
      request("start", async () => {
        const profile = get().activeProfile;
        if (!profile) return;
        const { run } = await api.startMarker(profile.id, markerId);
        writeStorage(worldFightKey(profile.id), markerId);
        set({ worldMarkerId: markerId, conversation: undefined });
        showRun(run, "encounter", false);
        set({ tab: "task" });
      }),

    finishWorldEncounter: () =>
      request("enter", async () => {
        const { activeProfile, run, worldMarkerId, world: before } = get();
        if (!activeProfile || !run || !worldMarkerId) return;
        const { world } = await api.resolveMarker(activeProfile.id, worldMarkerId, { runId: run.runId });
        removeStorage(worldFightKey(activeProfile.id));
        removeStorage(runKey(activeProfile.id));
        set({ world, worldMarkerId: undefined, run: undefined, screen: "world", files: {}, notice: undefined, error: undefined });
        // A win can finish a quest's objectives; say so, since the journal is not what the player is looking at.
        const wasReady = new Set(before?.quests.filter((quest) => quest.status === "ready").map((quest) => quest.id));
        toast(
          world.quests
            .filter((quest) => quest.status === "ready" && !wasReady.has(quest.id))
            .map((quest) => `${quest.name}: return to ${quest.giverName}`),
        );
        void get().loadLearner();
      }),

    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((candidate) => candidate.id !== id) });
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
