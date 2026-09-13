import type { Balance, ClassDef } from "@rootward/content-schema";
import { accept, type Decision, refuse } from "../result.ts";
import { pickWeighted, randomFor } from "../rng.ts";
import { masteryKey, tierKey } from "./keys.ts";
import { type MoveContext, type MoveOutcome, MOVES, strike } from "./moves.ts";
import { computeRewards, type RewardInput } from "./rewards.ts";
import type { EncounterState, EncounterTest, RunCommand, RunEvent, RunState, TestOutcome } from "./types.ts";

export interface DecideContext {
  balance: Balance;
}

// LEARN: this is the "decider" pattern for event sourcing. `decide(state, command)` checks the rules and returns the
// events that happened (or a refusal); `evolve(state, event)` in evolve.ts applies them. Only decide knows rules and
// randomness, and both are pure, so any fight can be replayed or tested from a list of commands and a seed.
export function decide(state: RunState | undefined, command: RunCommand, ctx: DecideContext): Decision<RunEvent> {
  if (command.type === "StartRun") return startRun(state, command, ctx.balance);
  if (!state) return refuse("no-run", "Start a run first.");
  if (state.status !== "active") return refuse("run-ended", "This run has ended.");

  switch (command.type) {
    case "StartEncounter":
      return startEncounter(state, command, ctx.balance);
    case "Probe":
      return probe(state, command.results);
    case "Cast":
      return cast(state, command, ctx.balance);
    case "TakeHint":
      return takeHint(state);
    case "Retreat":
      return retreat(state);
    default:
      return assertNever(command);
  }
}

/** Product of every implemented `lootMultiplierOnCrit` passive effect (for example the Artificer's first-try crit). */
export function critLootMultiplier(classDef: ClassDef): number {
  let multiplier = 1;
  for (const passive of classDef.passives) {
    if (!passive.implemented) continue;
    for (const effect of passive.effects) {
      if (effect.type === "lootMultiplierOnCrit" && typeof effect.factor === "number") multiplier *= effect.factor;
    }
  }
  return multiplier;
}

function startRun(
  state: RunState | undefined,
  command: Extract<RunCommand, { type: "StartRun" }>,
  balance: Balance,
): Decision<RunEvent> {
  if (state) return refuse("run-exists", "This run has already started.");
  const stats = command.classDef.base_stats ?? {
    integrity: balance.player.integrity_start,
    focus: balance.player.focus_base,
  };
  return accept({
    type: "RunStarted",
    runId: command.runId,
    seed: command.seed,
    classId: command.classDef.id,
    integrityMax: stats.integrity,
    cycles: balance.player.cycles_start,
    focusBase: stats.focus,
    critLootMultiplier: critLootMultiplier(command.classDef),
  });
}

function startEncounter(
  state: RunState,
  command: Extract<RunCommand, { type: "StartEncounter" }>,
  balance: Balance,
): Decision<RunEvent> {
  if (state.encounter?.status === "active") {
    return refuse("encounter-active", "Finish or retreat from the current encounter first.");
  }
  const ids = [...command.tests.map((t) => t.id), ...command.reserve.map((t) => t.id)];
  if (command.tests.length === 0) return refuse("no-tests", "An encounter needs at least one test.");
  if (new Set(ids).size !== ids.length) return refuse("duplicate-tests", "Test ids must be unique.");

  const weights = balance.encounter.test_weights;
  const tests = command.tests.map((t): EncounterTest => {
    const test: EncounterTest = {
      id: t.id,
      name: t.name,
      visibility: t.visibility,
      weight: t.visibility === "visible" ? weights.visible : weights.hidden,
      passing: false,
    };
    if (t.category !== undefined) test.category = t.category;
    return test;
  });
  const hintMultiplier = balance.encounter.hint_cost_multiplier_by_mastery[masteryKey(command.mastery)];
  const { enemy, challenge } = command;

  const encounter: EncounterState = {
    roomId: command.roomId,
    challengeId: challenge.id,
    language: challenge.language,
    difficulty: challenge.difficulty,
    retreatable: challenge.retreatable,
    scoring: { ...challenge.scoring },
    enemy: {
      id: enemy.id,
      name: enemy.name,
      tier: enemy.tier,
      atk: enemy.base_atk ?? balance.enemy_moves.strike_atk_by_tier[tierKey(enemy.tier)],
      hpDisplayOffset: enemy.hp_display_offset,
      moves: enemy.moves.map((m) => ({ move: m.move, weight: m.weight, params: m.params })),
      taunts: [...enemy.flavor.taunt],
    },
    tests,
    reserve: command.reserve.map((r) => ({ ...r })),
    focus: state.focusBase,
    focusMax: state.focusBase,
    casts: 0,
    probes: 0,
    hintsTaken: 0,
    hintCosts: balance.encounter.hint_costs_cycles.map((cost) => Math.round(cost * hintMultiplier)),
    inspected: false,
    status: "active",
  };
  return accept({ type: "EncounterStarted", encounter });
}

function probe(state: RunState, results: TestOutcome[]): Decision<RunEvent> {
  const encounter = activeEncounter(state);
  if (!encounter) return refuse("no-encounter", "There is no active encounter.");
  const visible = encounter.tests.filter((test) => test.visibility === "visible");
  const mismatch = resultsMismatch(results, visible);
  if (mismatch) return refuse("results-mismatch", `Probe results must cover exactly the visible tests: ${mismatch}`);
  return accept({ type: "Probed", roomId: encounter.roomId, results });
}

function cast(state: RunState, command: Extract<RunCommand, { type: "Cast" }>, balance: Balance): Decision<RunEvent> {
  const encounter = activeEncounter(state);
  if (!encounter) return refuse("no-encounter", "There is no active encounter.");
  if (encounter.focus < 1) return refuse("no-focus", "No Focus left. Retreat, or keep Probing.");
  const mismatch = resultsMismatch(command.results, encounter.tests);
  if (mismatch) return refuse("results-mismatch", `Cast results must cover exactly the active tests: ${mismatch}`);

  // A test that starts passing deals its weight in damage; one that stops passing heals the enemy (section 7.2).
  const passed = new Map(command.results.map((result) => [result.id, result.passed]));
  let damage = 0;
  let heal = 0;
  let failingCount = 0;
  const tests = encounter.tests.map((test) => {
    const nowPassing = passed.get(test.id) === true;
    if (nowPassing && !test.passing) damage += test.weight;
    if (!nowPassing && test.passing && balance.encounter.regression_heals_enemy) heal += test.weight;
    if (!nowPassing) failingCount += 1;
    return { ...test, passing: nowPassing };
  });
  const focus = encounter.focus - 1;
  const afterCast: EncounterState = { ...encounter, tests, casts: encounter.casts + 1, focus };
  const { roomId } = encounter;
  const events: RunEvent[] = [{ type: "CastResolved", roomId, results: command.results, damage, heal, focus }];

  if (failingCount === 0) {
    const input: RewardInput = { encounter: afterCast, balance, critLootMultiplier: state.critLootMultiplier };
    if (command.timing) input.timing = command.timing;
    const rewards = computeRewards(input);
    events.push({ type: "EncounterWon", roomId, rewards, cycles: state.cycles + rewards.cycles });
    return accept(...events);
  }

  const outcome = enemyTurn({ encounter: afterCast, balance, failingCount, integrity: state.integrity }, state.seed);
  if (outcome.kind === "strike") {
    events.push({ type: "EnemyStruck", roomId, action: outcome.action, integrity: outcome.integrity });
    if (outcome.integrity === 0) {
      events.push({ type: "RunEnded", reason: "kernel-panic" });
      return accept(...events);
    }
  } else {
    events.push({ type: "EdgeCaseRevealed", roomId, action: outcome.action, test: outcome.test });
  }
  if (focus === 0) events.push({ type: "Exhausted", roomId });
  return accept(...events);
}

/** The enemy's move after a Cast it survived: a weighted random choice from its template, drawn from the run seed. */
function enemyTurn(ctx: MoveContext, seed: string): MoveOutcome {
  const { encounter } = ctx;
  const draw = encounter.casts;
  const choice = pickWeighted(encounter.enemy.moves, randomFor(seed, `enemy-move:${encounter.roomId}`, draw));
  const definition = choice ? MOVES.get(choice.move) : undefined;
  const resolved = choice && definition?.implemented ? definition.resolve(ctx, choice.params) : undefined;
  const outcome = resolved ?? strike(ctx, choice && choice.move !== "strike" ? choice.move : undefined);

  const { taunts } = encounter.enemy;
  const taunt = taunts[Math.floor(randomFor(seed, `taunt:${encounter.roomId}`, draw) * taunts.length)];
  if (taunt !== undefined) outcome.action.taunt = taunt;
  return outcome;
}

function takeHint(state: RunState): Decision<RunEvent> {
  const encounter = activeEncounter(state);
  if (!encounter) return refuse("no-encounter", "There is no active encounter.");
  const level = encounter.hintsTaken + 1;
  const cost = encounter.hintCosts[level - 1];
  if (cost === undefined) return refuse("no-more-hints", "That was the last hint. Retreat shows the full solution.");
  if (state.cycles < cost) {
    return refuse("not-enough-cycles", `Hint ${level} costs ${cost} Cycles and you have ${state.cycles}.`);
  }
  return accept({ type: "HintTaken", roomId: encounter.roomId, level, cost, cycles: state.cycles - cost });
}

function retreat(state: RunState): Decision<RunEvent> {
  const encounter = activeEncounter(state);
  if (!encounter) return refuse("no-encounter", "There is no active encounter.");
  if (!encounter.retreatable) return refuse("not-retreatable", "There is no retreating from this fight.");
  return accept({ type: "Retreated", roomId: encounter.roomId });
}

function activeEncounter(state: RunState): EncounterState | undefined {
  return state.encounter?.status === "active" ? state.encounter : undefined;
}

/** Undefined when `results` names each expected test exactly once; otherwise a short description of the problem. */
function resultsMismatch(results: readonly TestOutcome[], expected: readonly EncounterTest[]): string | undefined {
  const expectedIds = new Set(expected.map((test) => test.id));
  const seen = new Set<string>();
  for (const result of results) {
    if (!expectedIds.has(result.id)) return `unexpected test "${result.id}"`;
    if (seen.has(result.id)) return `test "${result.id}" appears twice`;
    seen.add(result.id);
  }
  const missing = [...expectedIds].filter((id) => !seen.has(id));
  return missing.length > 0 ? `missing ${missing.join(", ")}` : undefined;
}

function assertNever(value: never): never {
  throw new Error(`unhandled command: ${JSON.stringify(value)}`);
}
