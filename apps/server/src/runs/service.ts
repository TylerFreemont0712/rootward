import { randomUUID } from "node:crypto";
import { type ClassDef, type Enemy, type IoCase, Language } from "@rootward/content-schema";
import type { LoadedChallenge } from "@rootward/content-tools";
import {
  decide,
  type EncounterState,
  evolve,
  foldRun,
  type RunCommand,
  type RunEvent,
  type RunState,
  type TestOutcome,
} from "@rootward/core";
import type { RunResult } from "@rootward/runners";
import type { ActionRequest, ChallengeSummary, EncounterResponse, StartEncounterRequest } from "@rootward/shared";
import type { GameContent } from "../content.ts";
import { ServiceError } from "../errors.ts";
import { LARGE_INPUT_CATEGORY, type Sandbox } from "../sandbox.ts";
import type { RunArtifacts } from "./artifacts.ts";
import { applyAttempt, type Attempt, type AttemptStore, InMemoryAttemptStore } from "./attempts.ts";
import { KeyedLock } from "./lock.ts";
import type { EventStore } from "./store.ts";
import { buildEncounterView } from "./views.ts";

/** M0 has one playable class; the Guild Hall (M1) makes it a choice. */
const DEFAULT_CLASS_ID = "artificer";
const ROOM_ID = "room-1";
/** How many runs keep their artifacts in memory; others are rebuilt from stored attempts when needed. */
const ARTIFACT_CACHE_SIZE = 50;

export interface RunServiceDeps {
  content: GameContent;
  sandbox: Sandbox;
  store: EventStore;
  attempts?: AttemptStore;
  newId?: () => string;
}

interface PreparedCommand {
  command: RunCommand;
  /** The Probe or Cast to record if the rules accept the command. */
  attempt?: Omit<Attempt, "seq">;
}

/** Orchestrates a run: loads events, runs code in the sandbox, asks the core rules, appends, and returns a view. */
export class RunService {
  private readonly content: GameContent;
  private readonly sandbox: Sandbox;
  private readonly store: EventStore;
  private readonly attempts: AttemptStore;
  private readonly newId: () => string;
  private readonly artifactCache = new Map<string, RunArtifacts>();
  private readonly lock = new KeyedLock();

  constructor(deps: RunServiceDeps) {
    this.content = deps.content;
    this.sandbox = deps.sandbox;
    this.store = deps.store;
    this.attempts = deps.attempts ?? new InMemoryAttemptStore();
    this.newId = deps.newId ?? randomUUID;
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

  async startEncounter(request: StartEncounterRequest): Promise<EncounterResponse> {
    const challenge = this.challenge(request.challengeId);
    const language = this.language(challenge, request.language);
    if (!(await this.sandbox.canRun(language))) {
      throw new ServiceError(409, "no-runner", `No sandbox can run ${language} on this machine yet.`);
    }
    const runId = this.newId();
    const visible = challenge.visibleTests?.cases ?? [];
    const hidden = challenge.hiddenTests?.cases ?? [];
    const { manifest } = challenge;

    const events = this.applyAll(undefined, [
      { type: "StartRun", runId, seed: request.seed ?? this.newId(), classDef: this.classDef() },
      {
        type: "StartEncounter",
        roomId: ROOM_ID,
        challenge: {
          id: manifest.id,
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
        mastery: 0,
      },
    ]);
    await this.store.create(runId, events);
    const artifacts = this.freshArtifacts(challenge, language);
    this.remember(runId, artifacts);
    return { view: this.view(foldRun(events), events, artifacts) };
  }

  async getRun(runId: string): Promise<EncounterResponse> {
    const events = await this.loadEvents(runId);
    const state = foldRun(events);
    return { view: this.view(state, events, await this.artifacts(state)) };
  }

  act(runId: string, action: ActionRequest): Promise<EncounterResponse> {
    return this.lock.run(runId, async () => {
      const events = await this.loadEvents(runId);
      const state = foldRun(events);
      const artifacts = await this.artifacts(state);
      const ctx = { balance: this.content.balance };

      // Refuse early when running code would be pointless (run over, no Focus): decide() checks those conditions
      // before it looks at results, so an empty result list yields exactly the refusal the real command would get.
      if (action.type === "probe" || action.type === "cast") {
        const precheck = decide(state, { type: action.type === "probe" ? "Probe" : "Cast", results: [] }, ctx);
        if (!precheck.ok && precheck.error.code !== "results-mismatch") {
          return { view: this.view(state, events, artifacts), refused: precheck.error };
        }
      }

      const prepared = await this.prepare(state, action);
      const decision = decide(state, prepared.command, ctx);
      if (!decision.ok) return { view: this.view(state, events, artifacts), refused: decision.error };

      await this.store.append(runId, events.length, decision.events);
      if (prepared.attempt) {
        const attempt: Attempt = { ...prepared.attempt, seq: events.length };
        await this.attempts.record(runId, attempt);
        applyAttempt(artifacts, attempt, this.visibleIds(this.challenge(this.encounterOf(state).challengeId)));
      }
      const all = [...events, ...decision.events];
      return { view: this.view(foldRun(all), all, artifacts) };
    });
  }

  private async prepare(state: RunState, action: ActionRequest): Promise<PreparedCommand> {
    if (action.type === "hint") return { command: { type: "TakeHint" } };
    if (action.type === "retreat") return { command: { type: "Retreat" } };

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

  private view(state: RunState, events: readonly RunEvent[], artifacts: RunArtifacts) {
    const challenge = this.challenge(this.encounterOf(state).challengeId);
    return buildEncounterView({
      state,
      events,
      challenge,
      enemy: this.enemy(challenge),
      classDef: this.classDef(),
      balance: this.content.balance,
      artifacts,
    });
  }

  /** A run's artifacts: from the cache, or rebuilt by replaying its stored attempts (for example after a restart). */
  private async artifacts(state: RunState): Promise<RunArtifacts> {
    const cached = this.artifactCache.get(state.runId);
    if (cached) return cached;
    const encounter = this.encounterOf(state);
    const challenge = this.challenge(encounter.challengeId);
    const artifacts = this.freshArtifacts(challenge, this.language(challenge, encounter.language));
    const visibleIds = this.visibleIds(challenge);
    for (const attempt of await this.attempts.list(state.runId)) applyAttempt(artifacts, attempt, visibleIds);
    this.remember(state.runId, artifacts);
    return artifacts;
  }

  private freshArtifacts(challenge: LoadedChallenge, language: Language): RunArtifacts {
    return { files: { ...(challenge.starter[language] ?? {}) }, latest: new Map() };
  }

  private remember(runId: string, artifacts: RunArtifacts): void {
    // LEARN: a Map iterates in insertion order, so re-inserting on use and dropping the first key is a tiny LRU cache.
    this.artifactCache.delete(runId);
    this.artifactCache.set(runId, artifacts);
    if (this.artifactCache.size > ARTIFACT_CACHE_SIZE) {
      const oldest = this.artifactCache.keys().next();
      if (!oldest.done) this.artifactCache.delete(oldest.value);
    }
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

  private classDef(): ClassDef {
    const loaded = this.content.index.classes.get(DEFAULT_CLASS_ID);
    if (!loaded) throw new Error(`class ${DEFAULT_CLASS_ID} is missing from the content packs`);
    return loaded.def;
  }
}
