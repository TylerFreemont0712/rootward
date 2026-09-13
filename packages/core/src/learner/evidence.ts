import { evolve } from "../run/evolve.ts";
import type { EncounterState, RunState } from "../run/types.ts";
import type { Evidence, FightEvidence, FightOutcome, TimedEvent } from "./types.ts";

/**
 * The evidence in one run's event log: a fight record whenever a fight ends (won, retreated, out of Focus, or a Kernel
 * Panic mid-fight) and a dungeon record when an expedition ends. Pure, so evidence can be rebuilt from stored events at
 * any time, for example after a mastery rule changes.
 */
export function evidenceFromRun(events: readonly TimedEvent[]): Evidence[] {
  const evidence: Evidence[] = [];
  let state: RunState | undefined;
  for (const { event, at } of events) {
    const fightWasActive = state?.encounter?.status === "active";
    state = evolve(state, event);
    const fightEnded =
      event.type === "EncounterWon" ||
      event.type === "Retreated" ||
      event.type === "Exhausted" ||
      (event.type === "RunEnded" && event.reason === "kernel-panic" && fightWasActive);
    if (fightEnded && state.encounter) evidence.push(fightEvidence(state.runId, state.encounter, at));
    if (event.type === "RunEnded" && state.plan) {
      evidence.push({ kind: "dungeon", runId: state.runId, outcome: event.reason, at });
    }
  }
  return evidence;
}

const OUTCOMES: Readonly<Record<EncounterState["status"], FightOutcome | undefined>> = {
  active: undefined,
  won: "won",
  retreated: "retreated",
  exhausted: "exhausted",
  "kernel-panic": "kernel-panic",
};

function fightEvidence(runId: string, encounter: EncounterState, at: string): FightEvidence {
  const outcome = OUTCOMES[encounter.status];
  if (!outcome) throw new Error(`the fight in room ${encounter.roomId} ended but is still active`);
  // Before the first Cast every test counts as failing, which says nothing about weak spots.
  const failingCategories =
    outcome === "won" || encounter.casts === 0
      ? []
      : encounter.tests.flatMap((test) =>
          test.visibility === "hidden" && !test.passing && test.category !== undefined ? [test.category] : [],
        );
  return {
    kind: "fight",
    runId,
    roomId: encounter.roomId,
    challengeId: encounter.challengeId,
    language: encounter.language,
    concepts: encounter.concepts,
    difficulty: encounter.difficulty,
    tier: encounter.enemy.tier,
    outcome,
    hintsTaken: encounter.hintsTaken,
    bonuses: encounter.rewards?.bonuses ?? [],
    commits: encounter.rewards?.commits ?? 0,
    failingCategories,
    at,
  };
}
