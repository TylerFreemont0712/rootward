import type { EncounterState, RunEvent, RunState } from "./types.ts";

/**
 * Apply one event to the run state. Events already carry their resulting numbers, so this is bookkeeping, not rules;
 * the rules live in decide.ts. Throws only on impossible sequences, which indicate a bug or a corrupted event log.
 */
export function evolve(state: RunState | undefined, event: RunEvent): RunState {
  if (event.type === "RunStarted") {
    return {
      runId: event.runId,
      seed: event.seed,
      classId: event.classId,
      status: "active",
      integrity: event.integrityMax,
      integrityMax: event.integrityMax,
      cycles: event.cycles,
      focusBase: event.focusBase,
      critLootMultiplier: event.critLootMultiplier,
    };
  }
  if (!state) throw new Error(`event ${event.type} arrived before RunStarted`);

  switch (event.type) {
    case "EncounterStarted":
      return { ...state, encounter: event.encounter };
    case "Probed":
      return withEncounter(state, event.roomId, (e) => ({ ...e, probes: e.probes + 1, lastProbe: event.results }));
    case "CastResolved":
      return withEncounter(state, event.roomId, (e) => ({
        ...e,
        casts: e.casts + 1,
        focus: event.focus,
        lastCast: event.results,
        tests: e.tests.map((test) => {
          const result = event.results.find((r) => r.id === test.id);
          return result ? { ...test, passing: result.passed } : test;
        }),
      }));
    case "EnemyStruck":
      return {
        ...withEncounter(state, event.roomId, (e) => ({ ...e, lastEnemyAction: event.action })),
        integrity: event.integrity,
      };
    case "EdgeCaseRevealed":
      return withEncounter(state, event.roomId, (e) => ({
        ...e,
        lastEnemyAction: event.action,
        tests: [...e.tests, event.test],
        reserve: e.reserve.filter((test) => test.id !== event.test.id),
      }));
    case "HintTaken":
      return {
        ...withEncounter(state, event.roomId, (e) => ({ ...e, hintsTaken: event.level })),
        cycles: event.cycles,
      };
    case "Retreated":
      return withEncounter(state, event.roomId, (e) => ({ ...e, status: "retreated" }));
    case "Exhausted":
      return withEncounter(state, event.roomId, (e) => ({ ...e, status: "exhausted" }));
    case "EncounterWon":
      return {
        ...withEncounter(state, event.roomId, (e) => ({ ...e, status: "won", rewards: event.rewards })),
        cycles: event.cycles,
      };
    case "RunEnded": {
      const ended: RunState = { ...state, status: "ended", endReason: event.reason };
      if (event.reason === "kernel-panic" && state.encounter?.status === "active") {
        ended.encounter = { ...state.encounter, status: "kernel-panic" };
      }
      return ended;
    }
    default:
      return assertNever(event);
  }
}

/** Rebuild a run from its full event log. */
export function foldRun(events: readonly RunEvent[]): RunState {
  let state: RunState | undefined;
  for (const event of events) state = evolve(state, event);
  if (!state) throw new Error("a run's event log must start with RunStarted");
  return state;
}

function withEncounter(
  state: RunState,
  roomId: string,
  update: (encounter: EncounterState) => EncounterState,
): RunState {
  if (state.encounter?.roomId !== roomId) {
    throw new Error(`event for room ${roomId}, but the current room is ${state.encounter?.roomId ?? "none"}`);
  }
  return { ...state, encounter: update(state.encounter) };
}

function assertNever(value: never): never {
  throw new Error(`unhandled event: ${JSON.stringify(value)}`);
}
