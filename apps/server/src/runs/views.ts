import { type Balance, type ClassDef, type Enemy, HINT_LEVEL_NAMES, Language, resolveStdin } from "@rootward/content-schema";
import type { ContentIndex, LoadedChallenge } from "@rootward/content-tools";
import {
  creditedNodes,
  displayedEnemyHp,
  type DungeonPlan,
  type EncounterState,
  type EnemyAction,
  enemyHp,
  enemyHpMax,
  type FightEvidence,
  formatVersion,
  type LearnerContext,
  type LearnerModel,
  layoutDungeon,
  reachableRoomIds,
  retreatSuggested,
  type RunEvent,
  type RunState,
} from "@rootward/core";
import type { TestResult } from "@rootward/runners";
import { DebriefView, EncounterView, LearnerView, type LogEntry, RunView, type TestView, type WeakSpot } from "@rootward/shared";
import type { RunLearning } from "../learner.ts";
import type { RunArtifacts } from "./artifacts.ts";

// The only place where server state becomes client data. Fairness rule (PROMPT.md section 7.6): hidden tests leave
// the server as a category label and pass/fail, never as names, inputs, expected or actual output, or program output.
// The run seed stays here too, because it would let a client predict enemy moves.

const MAX_DETAIL_CHARS = 2000;
const MAX_CONSOLE_CHARS = 8000;
const MAX_LOG_ENTRIES = 60;

export interface ViewInput {
  state: RunState;
  /** The events of this fight only, starting at its EncounterStarted event. */
  events: readonly RunEvent[];
  challenge: LoadedChallenge;
  enemy: Enemy;
  classDef: ClassDef;
  balance: Balance;
  artifacts: RunArtifacts;
}

export function buildEncounterView({ state, events, challenge, enemy, classDef, balance, artifacts }: ViewInput): EncounterView {
  const encounter = state.encounter;
  if (!encounter) throw new Error(`run ${state.runId} has no encounter`);
  const language = Language.parse(encounter.language);
  const { manifest } = challenge;
  const ended = encounter.status === "retreated" || encounter.status === "exhausted";

  const view = {
    runId: state.runId,
    roomId: encounter.roomId,
    status: encounter.status,
    challenge: {
      id: manifest.id,
      title: manifest.title,
      realm: manifest.realm,
      prompt: challenge.prompt,
      intro: manifest.flavor.intro,
      difficulty: manifest.difficulty,
      estimatedMinutes: manifest.estimated_minutes,
      concepts: manifest.concepts,
      language,
      languages: manifest.languages,
      entry: manifest.tests.entry[language] ?? "",
      maxLines: manifest.constraints.max_lines,
      bannedTokens: manifest.constraints.banned_tokens,
      targetComplexity: manifest.targets.complexity,
    },
    enemy: {
      name: enemy.name,
      // The room sets the tier: the same template can guard an Elite or a Boss room.
      tier: encounter.enemy.tier,
      art: enemy.art,
      intro: enemy.flavor.intro,
      defeat: enemy.flavor.defeat,
      hp: enemyHp(encounter),
      hpMax: enemyHpMax(encounter),
      hpDisplayed: displayedEnemyHp(encounter),
      lastAction: encounter.lastEnemyAction ? actionView(encounter.lastEnemyAction) : undefined,
    },
    player: {
      className: classDef.name,
      integrity: state.integrity,
      integrityMax: state.integrityMax,
      focus: encounter.focus,
      focusMax: encounter.focusMax,
      cycles: state.cycles,
    },
    starterFiles: challenge.starter[language] ?? {},
    editorFiles: artifacts.files,
    tests: testViews(encounter, challenge, artifacts),
    hints: {
      total: challenge.hints.length,
      taken: hintViews(events, encounter, challenge),
      nextCost: encounter.status === "active" ? encounter.hintCosts[encounter.hintsTaken] : undefined,
    },
    casts: encounter.casts,
    retreatSuggested: retreatSuggested(encounter, balance),
    lastRun: consoleView(artifacts),
    rewards: encounter.rewards,
    retreat: ended ? { solutionFiles: challenge.solution[language] ?? {}, explanation: challenge.explanation } : undefined,
    log: logEntries(events, enemy.name),
  };
  // Parsing validates the contract and strips any property the schema does not list.
  return EncounterView.parse(view);
}

/** What the map may say about the challenge behind a door. */
export interface RoomDetails {
  title: string;
  enemyName: string;
  difficulty: number;
}

export interface RunViewInput {
  state: RunState;
  classDef: ClassDef;
  /** The current or most recent fight, built with buildEncounterView. */
  encounter: EncounterView | undefined;
  describeChallenge: (challengeId: string) => RoomDetails | undefined;
}

export function buildRunView({ state, classDef, encounter, describeChallenge }: RunViewInput): RunView {
  const view = {
    runId: state.runId,
    status: state.status,
    endReason: state.endReason,
    player: {
      className: classDef.name,
      integrity: state.integrity,
      integrityMax: state.integrityMax,
      cycles: state.cycles,
    },
    expedition: state.plan ? expeditionView(state, state.plan, describeChallenge) : undefined,
    encounter,
  };
  return RunView.parse(view);
}

/**
 * The dungeon from where the player stands (ADR-0008): the laid-out map, each room's state, and what waits behind the
 * doors that have been open to the player. Rooms further down show only their kind.
 */
function expeditionView(state: RunState, plan: DungeonPlan, describeChallenge: RunViewInput["describeChallenge"]) {
  const map = layoutDungeon(plan);
  const planRooms = new Map(plan.rooms.map((room) => [room.id, room]));
  const outcomes = new Map(state.clearedRooms.map((record) => [record.roomId, record.outcome]));
  const open = new Set(reachableRoomIds(state));
  // Doors that were ever open: the whole first floor, and every room an edge leads to from a cleared room.
  const inReach = new Set([
    ...(plan.floors[0] ?? []),
    ...plan.edges.filter(([from]) => outcomes.has(from)).map(([, to]) => to),
  ]);
  const visited = state.currentRoomId === undefined ? [...outcomes.keys()] : [...outcomes.keys(), state.currentRoomId];
  const deepestVisited = Math.max(-1, ...visited.map((id) => planRooms.get(id)?.floor ?? -1));

  const rooms = map.rooms.map((geometry) => {
    const room = planRooms.get(geometry.roomId);
    if (!room) throw new Error(`map room ${geometry.roomId} is not in the plan`);
    const outcome = outcomes.get(room.id);
    let roomState: "cleared" | "current" | "open" | "ahead" | "sealed";
    if (outcome !== undefined) roomState = "cleared";
    else if (room.id === state.currentRoomId) roomState = "current";
    else if (open.has(room.id)) roomState = "open";
    else if (state.status === "ended" || room.floor <= deepestVisited) roomState = "sealed";
    else roomState = "ahead";
    const details = inReach.has(room.id) && room.challengeId !== undefined ? describeChallenge(room.challengeId) : undefined;
    return {
      id: room.id,
      floor: room.floor,
      kind: room.kind,
      purpose: room.purpose,
      state: roomState,
      outcome,
      details: details ? { ...details, concept: room.nodeId } : undefined,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      center: geometry.center,
      doorIn: geometry.doorIn,
      doorOut: geometry.doorOut,
    };
  });

  return {
    length: plan.length,
    language: plan.language,
    floorCount: plan.floors.length,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    entrance: map.entrance,
    start: map.start,
    rooms,
    edges: plan.edges,
    currentRoomId: state.currentRoomId,
    lastClearedRoomId: state.clearedRooms.at(-1)?.roomId,
    rationale: plan.rationale.map(({ kind, text }) => ({ kind, text })),
  };
}

/** The Chronicle's data: every skill node with the player's progress on it (ADR-0009). No test data is involved. */
export function buildLearnerView(model: LearnerModel, skills: ContentIndex["skills"], initialRating: number): LearnerView {
  const nodes = [...skills.values()]
    .map(({ value }) => {
      const progress = model.nodes.get(value.id);
      return {
        id: value.id,
        name: value.name,
        realm: value.realm,
        tier: value.tier,
        mastery: progress?.mastery ?? 0,
        rating: Math.round(progress?.rating ?? initialRating),
        commits: progress?.commits ?? 0,
        attempts: progress?.attempts ?? 0,
        wins: progress?.wins ?? 0,
        lastSeen: progress?.lastSeen,
      };
    })
    .sort((a, b) => a.realm.localeCompare(b.realm) || a.tier - b.tier || a.id.localeCompare(b.id));
  return LearnerView.parse({
    version: formatVersion(model.version),
    fights: model.fights,
    dungeonsCleared: model.dungeonsCleared,
    nodes,
    weakSpots: weakSpotViews(model.weakSpots),
  });
}

export interface DebriefInput {
  state: RunState;
  learning: RunLearning;
  context: LearnerContext;
  describeChallenge: (challengeId: string) => RoomDetails | undefined;
  nodeName: (nodeId: string) => string;
  /** Concepts the next expedition would introduce. */
  nextUp: readonly string[];
}

/** What a run changed: rooms, Version, Commits, and mastery and rating before and after for each concept. */
export function buildDebriefView({ state, learning, context, describeChallenge, nodeName, nextUp }: DebriefInput): DebriefView {
  const fights = learning.evidence.filter((item): item is FightEvidence => item.kind === "fight");
  const concepts = [...new Set(fights.flatMap((fight) => creditedNodes(fight.concepts, fight.language, context.nodes)))];
  const initialRating = context.balance.rating.initial_player;
  const weakSpots = new Map<string, number>();
  for (const fight of fights) {
    for (const category of fight.failingCategories) weakSpots.set(category, (weakSpots.get(category) ?? 0) + 1);
  }
  const earned = (fight: FightEvidence) => (fight.outcome === "won" ? fight.commits : 0);

  return DebriefView.parse({
    runId: state.runId,
    status: state.status,
    endReason: state.endReason,
    language: state.plan?.language ?? state.encounter?.language ?? "",
    roomsCleared: state.plan ? state.clearedRooms.length : fights.filter((fight) => fight.outcome === "won").length,
    floors: state.plan?.floors.length ?? 1,
    versionBefore: formatVersion(learning.before.version),
    versionAfter: formatVersion(learning.after.version),
    commits: fights.reduce((sum, fight) => sum + earned(fight), 0),
    crits: fights.filter((fight) => fight.bonuses.includes("crit")).length,
    retreats: fights.filter((fight) => fight.outcome === "retreated" || fight.outcome === "exhausted").length,
    fights: fights.map((fight) => ({
      roomId: fight.roomId,
      title: describeChallenge(fight.challengeId)?.title ?? fight.challengeId,
      outcome: fight.outcome,
      bonuses: [...fight.bonuses],
      commits: earned(fight),
    })),
    concepts: concepts.map((id) => {
      const before = learning.before.nodes.get(id);
      const after = learning.after.nodes.get(id);
      return {
        id,
        name: nodeName(id),
        commits: (after?.commits ?? 0) - (before?.commits ?? 0),
        masteryBefore: before?.mastery ?? 0,
        masteryAfter: after?.mastery ?? 0,
        ratingBefore: Math.round(before?.rating ?? initialRating),
        ratingAfter: Math.round(after?.rating ?? initialRating),
      };
    }),
    weakSpots: weakSpotViews(weakSpots),
    nextUp: nextUp.map((id) => ({ id, name: nodeName(id) })),
  });
}

function weakSpotViews(counts: ReadonlyMap<string, number>): WeakSpot[] {
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

function testViews(encounter: EncounterState, challenge: LoadedChallenge, artifacts: RunArtifacts): TestView[] {
  const cases = new Map(
    [...(challenge.visibleTests?.cases ?? []), ...(challenge.hiddenTests?.cases ?? [])].map((c) => [c.id, c]),
  );
  const perCategory = new Map<string, number>();
  let hiddenIndex = 0;

  return encounter.tests.map((test): TestView => {
    const result = artifacts.latest.get(test.id);
    const status = result === undefined ? "idle" : result.passed ? "pass" : "fail";
    const failed = result !== undefined && !result.passed;

    if (test.visibility === "visible") {
      const testCase = cases.get(test.id);
      return {
        id: test.id,
        label: test.name,
        visibility: "visible",
        status,
        revealed: false,
        ...(result ? { durationMs: result.durationMs, runStatus: result.status } : {}),
        ...(testCase ? { input: clip(resolveStdin(testCase), MAX_DETAIL_CHARS) } : {}),
        ...(failed
          ? {
              expected: clip(result.expected ?? testCase?.expected_stdout ?? "", MAX_DETAIL_CHARS),
              actual: clip(result.actual ?? "", MAX_DETAIL_CHARS),
              ...(result.message !== undefined ? { message: clip(result.message, MAX_DETAIL_CHARS) } : {}),
            }
          : {}),
      };
    }

    hiddenIndex += 1;
    const category = test.category ?? "hidden";
    const count = (perCategory.get(category) ?? 0) + 1;
    perCategory.set(category, count);
    const message = failed ? hiddenFailureMessage(result) : undefined;
    return {
      // Opaque ids: content authors may use descriptive ids, which would hint at the test.
      id: `hidden-${hiddenIndex}`,
      label: `${category} #${count}`,
      visibility: "hidden",
      status,
      revealed: test.revealedBy !== undefined,
      ...(result ? { durationMs: result.durationMs, runStatus: result.status } : {}),
      ...(message !== undefined ? { message } : {}),
    };
  });
}

/** Only fixed phrases: a hidden test's real error text could quote its input. */
function hiddenFailureMessage(result: TestResult): string | undefined {
  switch (result.status) {
    case "timeout":
      return "timed out";
    case "oom":
      return "ran out of memory";
    case "compile-error":
      return "did not compile";
    case "runtime-error":
      return "crashed";
    case "sandbox-error":
      return "could not run";
    case "ok":
      return undefined;
  }
}

function hintViews(events: readonly RunEvent[], encounter: EncounterState, challenge: LoadedChallenge) {
  return events.flatMap((event) =>
    event.type === "HintTaken" && event.roomId === encounter.roomId
      ? [
          {
            level: event.level,
            name: HINT_LEVEL_NAMES[event.level - 1] ?? `level ${event.level}`,
            text: challenge.hints[event.level - 1] ?? "",
            cost: event.cost,
          },
        ]
      : [],
  );
}

function consoleView(artifacts: RunArtifacts): EncounterView["lastRun"] {
  const last = artifacts.lastRun;
  if (!last) return undefined;
  const visible = (last.result.tests ?? []).filter((test) => last.visibleIds.has(test.id));
  const lines = [`$ ${last.kind} (${last.kind === "probe" ? "visible tests" : "all tests, visible output only"})`];
  for (const test of visible) {
    if (test.stderr) lines.push(`[${test.name}] ${test.stderr.trimEnd()}`);
  }
  const passed = visible.filter((test) => test.passed).length;
  lines.push(`visible: ${passed} passed, ${visible.length - passed} failed in ${Math.round(last.result.metrics.wallMs)} ms`);
  if (last.result.status !== "ok") lines.push(`run ended with ${last.result.status}: ${last.result.stderr}`);
  return {
    kind: last.kind,
    status: last.result.status,
    console: clip(lines.join("\n"), MAX_CONSOLE_CHARS),
    wallMs: last.result.metrics.wallMs,
  };
}

function actionView(action: EnemyAction): NonNullable<EncounterView["enemy"]["lastAction"]> {
  if (action.move === "strike") {
    return {
      move: "strike",
      damage: action.damage,
      ...(action.fallbackFrom !== undefined ? { fallbackFrom: action.fallbackFrom } : {}),
      ...(action.taunt !== undefined ? { taunt: action.taunt } : {}),
    };
  }
  return { move: "edge-case", category: action.category, ...(action.taunt !== undefined ? { taunt: action.taunt } : {}) };
}

function logEntries(events: readonly RunEvent[], enemyName: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const event of events) {
    switch (event.type) {
      case "Probed": {
        const passed = event.results.filter((r) => r.passed).length;
        entries.push({ kind: "probe", text: `Probe: ${passed} of ${event.results.length} visible tests pass.` });
        break;
      }
      case "CastResolved": {
        const healed = event.heal > 0 ? `, ${event.heal} healed by regressions` : "";
        entries.push({ kind: "cast", text: `Cast: ${event.damage} damage${healed}. Focus left: ${event.focus}.` });
        break;
      }
      case "EnemyStruck": {
        const fallback = event.action.fallbackFrom ? ` (${event.action.fallbackFrom} had nothing to do)` : "";
        entries.push({ kind: "enemy", text: `${enemyName} uses Strike${fallback}: -${event.action.damage} Integrity.` });
        break;
      }
      case "EdgeCaseRevealed":
        entries.push({
          kind: "enemy",
          text: `${enemyName} uses Edge Case: a hidden ${event.action.category} test joins the fight (+${event.test.weight} HP).`,
        });
        break;
      case "HintTaken":
        entries.push({ kind: "hint", text: `Hint ${event.level} bought for ${event.cost} Cycles.` });
        break;
      case "Retreated":
        entries.push({ kind: "retreat", text: "You retreat. Retreat is not defeat; it is a checkpoint." });
        break;
      case "Exhausted":
        entries.push({ kind: "exhausted", text: "Out of Focus. You fall back and study the reference solution." });
        break;
      case "EncounterWon":
        entries.push({
          kind: "won",
          text: `${enemyName} defeated: +${event.rewards.commits} Commits, +${event.rewards.cycles} Cycles.`,
        });
        break;
      case "RunEnded":
        entries.push(runEndedEntry(event.reason));
        break;
      case "RunStarted":
      case "RoomEntered":
      case "RoomCleared":
      case "EncounterStarted":
        break;
    }
  }
  return entries.slice(-MAX_LOG_ENTRIES);
}

function runEndedEntry(reason: RunState["endReason"]): LogEntry {
  switch (reason) {
    case "kernel-panic":
      return { kind: "panic", text: "Kernel panic - not syncing: Maintainer out of Integrity." };
    case "completed":
      return { kind: "won", text: "The Legacy System falls. The expedition is complete." };
    case "retreated":
      return { kind: "retreat", text: "You withdraw from the Legacy System. The expedition ends here." };
    case "abandoned":
    case undefined:
      return { kind: "retreat", text: "The expedition is abandoned." };
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... ${text.length - max} more characters]`;
}
