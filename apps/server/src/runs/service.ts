import { randomUUID } from "node:crypto";
import { type ClassDef, type Enemy, type IoCase, Language } from "@rootward/content-schema";
import type { LoadedChallenge } from "@rootward/content-tools";
import {
  type Decision,
  decide,
  type EncounterSetup,
  type EncounterState,
  evolve,
  foldRun,
  type LearnerModel,
  type LearnerSnapshot,
  type PlannerCatalog,
  planDungeon,
  type PlanResult,
  type RunCommand,
  type RunEvent,
  type RunState,
  type SessionLength,
  type TestOutcome,
} from "@rootward/core";
import type { RunResult } from "@rootward/runners";
import type {
  ActionRequest,
  ChallengeSummary,
  DebriefView,
  EncounterView,
  EnterRoomRequest,
  LearnerView,
  RunResponse,
  RunView,
  StartEncounterRequest,
  StartExpeditionRequest,
} from "@rootward/shared";
import type { GameContent } from "../content.ts";
import { ServiceError } from "../errors.ts";
import { LearnerService } from "../learner.ts";
import { buildPlannerCatalog } from "../planning.ts";
import { LARGE_INPUT_CATEGORY, type Sandbox } from "../sandbox.ts";
import type { RunArtifacts } from "./artifacts.ts";
import { applyAttempt, type Attempt, type AttemptStore, InMemoryAttemptStore } from "./attempts.ts";
import { KeyedLock } from "./lock.ts";
import type { EventStore } from "./store.ts";
import { buildDebriefView, buildEncounterView, buildLearnerView, buildRunView, type RoomDetails } from "./views.ts";

/** One playable class and one Oath until the Bastion (M1) makes them a choice. */
const DEFAULT_CLASS_ID = "artificer";
const DEFAULT_OATH_ID = "oath-of-the-foundry";
/** The room id of a practice fight, which has no dungeon around it. */
const PRACTICE_ROOM_ID = "room-1";
/** How many fights keep their artifacts in memory; others are rebuilt from stored attempts when needed. */
const ARTIFACT_CACHE_SIZE = 50;

export interface RunServiceDeps {
  content: GameContent;
  sandbox: Sandbox;
  store: EventStore;
  attempts?: AttemptStore;
  newId?: () => string;
  /** The current time as an ISO string; the learner model uses it for recency. */
  now?: () => string;
}

interface PreparedCommand {
  command: RunCommand;
  /** The Probe or Cast to record if the rules accept the command. */
  attempt?: Omit<Attempt, "seq">;
}

/** Orchestrates a run: loads events, runs code in the sandbox, asks the core rules, appends, and returns a view. */
export class RunService {
  /** The learner model, rebuilt from the same event store (ADR-0009). */
  readonly learner: LearnerService;
  private readonly content: GameContent;
  private readonly sandbox: Sandbox;
  private readonly store: EventStore;
  private readonly attempts: AttemptStore;
  private readonly newId: () => string;
  private readonly now: () => string;
  private readonly catalog: PlannerCatalog;
  private readonly artifactCache = new Map<string, RunArtifacts>();
  private readonly lock = new KeyedLock();

  constructor(deps: RunServiceDeps) {
    this.content = deps.content;
    this.sandbox = deps.sandbox;
    this.store = deps.store;
    this.attempts = deps.attempts ?? new InMemoryAttemptStore();
    this.newId = deps.newId ?? randomUUID;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.catalog = buildPlannerCatalog(deps.content.index);
    this.learner = new LearnerService({ store: deps.store, balance: deps.content.balance, catalog: this.catalog, now: this.now });
  }

  async listChallenges(): Promise<ChallengeSummary[]> {
    const summaries: ChallengeSummary[] = [];
    for (const challenge of this.content.index.challenges.values()) {
      const { manifest } = challenge;
      if (manifest.deprecated) continue;
      const playableLanguages: string[] = [];
      for (const language of manifest.languages) {
        if (await this.sandbox.canRun(language)) playableLanguages.push(language);
      }
      summaries.push({
        id: manifest.id,
        title: manifest.title,
        realm: manifest.realm,
        difficulty: manifest.difficulty,
        estimatedMinutes: manifest.estimated_minutes,
        languages: manifest.languages,
        playableLanguages,
        enemyName: this.enemy(challenge).name,
      });
    }
    return summaries.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
  }

  /** A single practice fight outside any dungeon. */
  async startEncounter(request: StartEncounterRequest): Promise<RunResponse> {
    const setup = await this.encounterSetup(this.challenge(request.challengeId), request.language);
    const runId = this.newId();
    const events = this.applyAll(undefined, [
      { type: "StartRun", runId, seed: request.seed ?? this.newId(), classDef: this.classDef(DEFAULT_CLASS_ID) },
      { type: "StartEncounter", roomId: PRACTICE_ROOM_ID, ...setup },
    ]);
    await this.store.create(runId, events);
    return { run: await this.runView(foldRun(events), events) };
  }

  /** Plan a dungeon from what the player knows and start an expedition through it (ADR-0007, ADR-0008, ADR-0009). */
  async startExpedition(request: StartExpeditionRequest): Promise<RunResponse> {
    const parsed = Language.safeParse(request.language);
    if (!parsed.success) {
      throw new ServiceError(400, "unsupported-language", `There is no language called ${request.language}.`);
    }
    const language = parsed.data;
    if (!(await this.sandbox.canRun(language))) {
      throw new ServiceError(409, "no-runner", `No sandbox can run ${language} on this machine yet.`);
    }
    const seed = request.seed ?? this.newId();
    const length = request.length ?? this.content.balance.planner.default_session;
    const planned = this.plan(seed, length, language, await this.learner.snapshot());
    if (!planned.ok) throw new ServiceError(409, planned.error.code, planned.error.message);

    const runId = this.newId();
    const classDef = this.classDef(DEFAULT_CLASS_ID);
    const events = this.applyAll(undefined, [{ type: "StartRun", runId, seed, classDef, plan: planned.plan }]);
    await this.store.create(runId, events);
    return { run: await this.runView(foldRun(events), events) };
  }

  /** Step through a door. The rules decide whether the room is on the path; content supplies the fight inside. */
  enterRoom(runId: string, request: EnterRoomRequest): Promise<RunResponse> {
    return this.lock.run(runId, async () => {
      const events = await this.loadEvents(runId);
      const state = foldRun(events);
      const ctx = { balance: this.content.balance };
      // As with Casts, ask the rules first: only a reachable fight room is worth loading a challenge for.
      const precheck = decide(state, { type: "EnterRoom", roomId: request.roomId }, ctx);
      const room = state.plan?.rooms.find((candidate) => candidate.id === request.roomId);
      if (precheck.ok || precheck.error.code !== "missing-setup" || !state.plan || room?.challengeId === undefined) {
        return this.commit(runId, state, events, precheck);
      }
      const encounter = await this.encounterSetup(this.challenge(room.challengeId), state.plan.language);
      return this.commit(runId, state, events, decide(state, { type: "EnterRoom", roomId: room.id, encounter }, ctx));
    });
  }

  async getRun(runId: string): Promise<RunResponse> {
    const events = await this.loadEvents(runId);
    return { run: await this.runView(foldRun(events), events) };
  }

  act(runId: string, action: ActionRequest): Promise<RunResponse> {
    return this.lock.run(runId, async () => {
      const events = await this.loadEvents(runId);
      const state = foldRun(events);
      const ctx = { balance: this.content.balance };

      // Refuse early when running code would be pointless (run over, no Focus): decide() checks those conditions
      // before it looks at results, so an empty result list yields exactly the refusal the real command would get.
      if (action.type === "probe" || action.type === "cast") {
        const precheck = decide(state, { type: action.type === "probe" ? "Probe" : "Cast", results: [] }, ctx);
        if (!precheck.ok && precheck.error.code !== "results-mismatch") return this.commit(runId, state, events, precheck);
      }

      const prepared = await this.prepare(state, action);
      return this.commit(runId, state, events, decide(state, prepared.command, ctx), prepared.attempt);
    });
  }

  /** The Chronicle's data: every skill node and the player's progress (ADR-0009). */
  async learnerView(): Promise<LearnerView> {
    return buildLearnerView(await this.learner.model(), this.content.index.skills, this.content.balance.rating.initial_player);
  }

  /** What a run changed for the player, and what the next expedition would introduce. */
  async debrief(runId: string): Promise<DebriefView> {
    const state = foldRun(await this.loadEvents(runId));
    const learning = await this.learner.forRun(runId);
    const language = state.plan?.language ?? state.encounter?.language;
    return buildDebriefView({
      state,
      learning,
      context: this.learner.context,
      describeChallenge: (id) => this.describeChallenge(id),
      nodeName: (id) => this.content.index.skills.get(id)?.value.name ?? id,
      nextUp: language === undefined ? [] : this.nextUp(language, learning.after),
    });
  }

  /** Append an accepted decision (and the attempt behind it), or report a refusal, and answer with the run view. */
  private async commit(
    runId: string,
    state: RunState,
    events: readonly RunEvent[],
    decision: Decision<RunEvent>,
    attempt?: Omit<Attempt, "seq">,
  ): Promise<RunResponse> {
    if (!decision.ok) return { run: await this.runView(state, events), refused: decision.error };
    await this.store.append(runId, events.length, decision.events);
    if (attempt && state.encounter) {
      const recorded: Attempt = { ...attempt, seq: events.length };
      await this.attempts.record(runId, recorded);
      const artifacts = await this.artifacts(state, state.encounter, events);
      applyAttempt(artifacts, recorded, this.visibleIds(this.challenge(state.encounter.challengeId)));
    }
    const all = [...events, ...decision.events];
    return { run: await this.runView(foldRun(all), all) };
  }

  private plan(seed: string, length: SessionLength, language: string, learner: LearnerSnapshot): PlanResult {
    const { balance, index } = this.content;
    return planDungeon({
      seed,
      length,
      language,
      catalog: this.catalog,
      learner,
      oathRealms: index.oaths.get(DEFAULT_OATH_ID)?.value.weights.realms ?? {},
      classAffinity: this.classDef(DEFAULT_CLASS_ID).affinity,
      balance,
    });
  }

  /** The concepts a fresh plan would introduce next, as a preview for the debrief. */
  private nextUp(language: string, model: LearnerModel): string[] {
    const length = this.content.balance.planner.default_session;
    const planned = this.plan("debrief-preview", length, language, this.learner.snapshotOf(model));
    if (!planned.ok) return [];
    const introduced = planned.plan.rooms.flatMap((room) => (room.purpose === "frontier" && room.nodeId !== undefined ? [room.nodeId] : []));
    return [...new Set(introduced)];
  }

  private async prepare(state: RunState, action: ActionRequest): Promise<PreparedCommand> {
    if (action.type === "hint") return { command: { type: "TakeHint" } };
    if (action.type === "retreat") return { command: { type: "Retreat" } };
    if (action.type === "abandon") return { command: { type: "AbandonRun" } };

    const encounter = this.encounterOf(state);
    const challenge = this.challenge(encounter.challengeId);
    const language = this.language(challenge, encounter.language);
    const entry = challenge.manifest.tests.entry[language];
    if (entry === undefined || action.files[entry] === undefined) {
      throw new ServiceError(400, "missing-entry", `Submit ${entry ?? "the entry file"} to run the tests.`);
    }

    const visibleIds = encounter.tests.filter((t) => t.visibility === "visible").map((t) => t.id);
    const ids = action.type === "probe" ? visibleIds : encounter.tests.map((t) => t.id);
    const result = await this.sandbox.runIo(challenge, language, action.files, this.casesById(challenge, ids));
    const outcomes = ids.map((id): TestOutcome => {
      const test = result.tests?.find((t) => t.id === id);
      return { id, passed: test?.passed ?? false, durationMs: test?.durationMs ?? 0 };
    });
    const attempt = { kind: action.type, language, files: { ...action.files }, result };

    if (action.type === "probe") return { command: { type: "Probe", results: outcomes }, attempt };
    const timing = await this.largeInputTiming(challenge, language, encounter, result);
    return {
      command: timing ? { type: "Cast", results: outcomes, timing } : { type: "Cast", results: outcomes },
      attempt,
    };
  }

  /** The fight a challenge holds, ready for the rules: tests by visibility (reserve tests held back) and its enemy. */
  private async encounterSetup(challenge: LoadedChallenge, requestedLanguage: string): Promise<EncounterSetup> {
    const language = this.language(challenge, requestedLanguage);
    if (!(await this.sandbox.canRun(language))) {
      throw new ServiceError(409, "no-runner", `No sandbox can run ${language} on this machine yet.`);
    }
    const { manifest } = challenge;
    const visible = challenge.visibleTests?.cases ?? [];
    const hidden = challenge.hiddenTests?.cases ?? [];
    const primaryConcept = manifest.concepts[0];
    return {
      challenge: {
        id: manifest.id,
        concepts: manifest.concepts,
        language,
        difficulty: manifest.difficulty,
        retreatable: manifest.retreatable,
        scoring: manifest.scoring,
      },
      enemy: this.enemy(challenge),
      tests: [
        ...visible.map((c) => ({ id: c.id, name: c.name, visibility: "visible" as const })),
        ...hidden
          .filter((c) => !c.reserve)
          .map((c) => ({
            id: c.id,
            name: c.name,
            visibility: "hidden" as const,
            ...(c.category !== undefined ? { category: c.category } : {}),
          })),
      ],
      reserve: hidden.flatMap((c) =>
        c.reserve && c.category !== undefined ? [{ id: c.id, name: c.name, category: c.category }] : [],
      ),
      // Hints cost more on concepts the player has already shown they know (balance.yaml).
      mastery: primaryConcept === undefined ? 0 : await this.learner.mastery(primaryConcept, language),
    };
  }

  /** Player vs reference time on large-input cases, when every such case passed. */
  private async largeInputTiming(challenge: LoadedChallenge, language: Language, encounter: EncounterState, result: RunResult) {
    const largeIds = new Set(encounter.tests.filter((t) => t.category === LARGE_INPUT_CATEGORY).map((t) => t.id));
    if (largeIds.size === 0) return undefined;
    const large = (result.tests ?? []).filter((t) => largeIds.has(t.id));
    if (large.length !== largeIds.size || large.some((t) => !t.passed)) return undefined;
    const referenceMs = await this.sandbox.referenceLargeInputMs(challenge, language);
    if (referenceMs === undefined) return undefined;
    return { playerMs: Math.max(...large.map((t) => t.durationMs)), referenceMs };
  }

  private applyAll(initial: RunState | undefined, commands: readonly RunCommand[]): RunEvent[] {
    let state = initial;
    const events: RunEvent[] = [];
    for (const command of commands) {
      const decision = decide(state, command, { balance: this.content.balance });
      if (!decision.ok) throw new ServiceError(409, decision.error.code, decision.error.message);
      for (const event of decision.events) {
        state = evolve(state, event);
        events.push(event);
      }
    }
    return events;
  }

  private async runView(state: RunState, events: readonly RunEvent[]): Promise<RunView> {
    const classDef = this.classDef(state.classId);
    let encounter: EncounterView | undefined;
    if (state.encounter) {
      const challenge = this.challenge(state.encounter.challengeId);
      encounter = buildEncounterView({
        state,
        events: events.slice(encounterStart(events)),
        challenge,
        enemy: this.enemy(challenge),
        classDef,
        balance: this.content.balance,
        artifacts: await this.artifacts(state, state.encounter, events),
      });
    }
    return buildRunView({ state, classDef, encounter, describeChallenge: (id) => this.describeChallenge(id) });
  }

  /**
   * The current fight's artifacts: from the cache, or rebuilt by replaying the attempts made since the fight started
   * (for example after a restart). Keyed by the fight's first event, so every room starts from its own starter files.
   */
  private async artifacts(state: RunState, encounter: EncounterState, events: readonly RunEvent[]): Promise<RunArtifacts> {
    const start = encounterStart(events);
    const key = `${state.runId}#${start}`;
    const cached = this.artifactCache.get(key);
    if (cached) {
      this.remember(key, cached);
      return cached;
    }
    const challenge = this.challenge(encounter.challengeId);
    const artifacts = this.freshArtifacts(challenge, this.language(challenge, encounter.language));
    const visibleIds = this.visibleIds(challenge);
    for (const attempt of await this.attempts.list(state.runId)) {
      if (attempt.seq > start) applyAttempt(artifacts, attempt, visibleIds);
    }
    this.remember(key, artifacts);
    return artifacts;
  }

  private freshArtifacts(challenge: LoadedChallenge, language: Language): RunArtifacts {
    return { files: { ...(challenge.starter[language] ?? {}) }, latest: new Map() };
  }

  private remember(key: string, artifacts: RunArtifacts): void {
    // LEARN: a Map iterates in insertion order, so re-inserting on use and dropping the first key is a tiny LRU cache.
    this.artifactCache.delete(key);
    this.artifactCache.set(key, artifacts);
    if (this.artifactCache.size > ARTIFACT_CACHE_SIZE) {
      const oldest = this.artifactCache.keys().next();
      if (!oldest.done) this.artifactCache.delete(oldest.value);
    }
  }

  private describeChallenge(challengeId: string): RoomDetails | undefined {
    const challenge = this.content.index.challenges.get(challengeId);
    if (!challenge) return undefined;
    return {
      title: challenge.manifest.title,
      enemyName: this.enemy(challenge).name,
      difficulty: challenge.manifest.difficulty,
    };
  }

  private visibleIds(challenge: LoadedChallenge): ReadonlySet<string> {
    return new Set((challenge.visibleTests?.cases ?? []).map((c) => c.id));
  }

  private async loadEvents(runId: string): Promise<RunEvent[]> {
    const events = await this.store.load(runId);
    if (!events) throw new ServiceError(404, "run-not-found", "No run with that id.");
    return events;
  }

  private casesById(challenge: LoadedChallenge, ids: readonly string[]): IoCase[] {
    const all = new Map(
      [...(challenge.visibleTests?.cases ?? []), ...(challenge.hiddenTests?.cases ?? [])].map((c) => [c.id, c]),
    );
    return ids.map((id) => {
      const testCase = all.get(id);
      if (!testCase) throw new Error(`test ${id} does not exist in challenge ${challenge.manifest.id}`);
      return testCase;
    });
  }

  private encounterOf(state: RunState): EncounterState {
    if (!state.encounter) throw new ServiceError(409, "no-encounter", "This run has no encounter.");
    return state.encounter;
  }

  private challenge(id: string): LoadedChallenge {
    const challenge = this.content.index.challenges.get(id);
    if (!challenge) throw new ServiceError(404, "challenge-not-found", `No challenge with id ${id}.`);
    return challenge;
  }

  private language(challenge: LoadedChallenge, requested: string): Language {
    const parsed = Language.safeParse(requested);
    if (!parsed.success || !challenge.manifest.languages.includes(parsed.data)) {
      throw new ServiceError(400, "unsupported-language", `${challenge.manifest.title} is not available in ${requested}.`);
    }
    return parsed.data;
  }

  private enemy(challenge: LoadedChallenge): Enemy {
    const enemy = this.content.index.enemies.get(challenge.manifest.enemy.template);
    if (!enemy) throw new Error(`enemy ${challenge.manifest.enemy.template} is missing; content validation should catch this`);
    return enemy.value;
  }

  private classDef(id: string): ClassDef {
    const loaded = this.content.index.classes.get(id);
    if (!loaded) throw new Error(`class ${id} is missing from the content packs`);
    return loaded.def;
  }
}

/** Index of the event that started the current fight; that fight's attempts and log come after it. */
function encounterStart(events: readonly RunEvent[]): number {
  return events.findLastIndex((event) => event.type === "EncounterStarted");
}
