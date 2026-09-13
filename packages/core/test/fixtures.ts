import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Balance, ClassDef, Enemy } from "@rootward/content-schema";
import { parse } from "yaml";
import {
  type DecideContext,
  decide,
  type EncounterState,
  evolve,
  type ReserveTest,
  type RunCommand,
  type RunEvent,
  type RunState,
  type TestOutcome,
} from "../src/index.ts";

// Tests read the real config/balance.yaml, so expectations are written in terms of its values and keep holding
// after the numbers are tuned.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
export const balance: Balance = Balance.parse(parse(readFileSync(path.join(repoRoot, "config/balance.yaml"), "utf8")));
export const ctx: DecideContext = { balance };

export function makeClass(stats: { integrity?: number; focus?: number } = {}): ClassDef {
  return ClassDef.parse({
    id: "artificer",
    name: "Artificer",
    tagline: "Functions are spells.",
    discipline: "Software engineering",
    affinity: { foundry: 1 },
    default_runner_kinds: ["tests"],
    base_stats: { integrity: stats.integrity ?? 100, focus: stats.focus ?? 5 },
    passives: [
      {
        id: "first-try-crit",
        name: "First-try crit",
        description: "Double loot on a crit.",
        implemented: true,
        effects: [{ type: "lootMultiplierOnCrit", factor: 2 }],
      },
    ],
  });
}

export function makeEnemy(
  moves: { move: string; weight: number; params?: Record<string, unknown> }[],
  options: { atk?: number; displayOffset?: number } = {},
): Enemy {
  return Enemy.parse({
    id: "tally-wisp",
    name: "Tally Wisp",
    tier: 1,
    realm_affinity: ["foundry"],
    base_atk: options.atk ?? 4,
    hp_display_offset: options.displayOffset ?? 0,
    moves,
    loot_table: "tier1-common",
    flavor: { intro: "A wisp.", taunt: ["One, two, many."], defeat: "Settled." },
  });
}

export const strikeOnly = (atk = 4) => makeEnemy([{ move: "strike", weight: 1 }], { atk });

export const TESTS = [
  { id: "v1", name: "counts words", visibility: "visible" },
  { id: "v2", name: "ignores case", visibility: "visible" },
  { id: "h1", name: "empty input", visibility: "hidden", category: "empty-input" },
  { id: "h2", name: "punctuation only", visibility: "hidden", category: "boundary" },
] as const;

export const RESERVE: ReserveTest[] = [{ id: "r1", name: "whitespace only", category: "empty-input" }];

export interface Scenario {
  state: RunState;
  events: RunEvent[];
}

/** Apply commands through decide + evolve. A refusal fails the test with the refusal's message. */
export function play(commands: RunCommand[], start?: Scenario): Scenario {
  let state = start?.state;
  const events = [...(start?.events ?? [])];
  for (const command of commands) {
    const decision = decide(state, command, ctx);
    if (!decision.ok) throw new Error(`${command.type} refused: ${decision.error.code}: ${decision.error.message}`);
    for (const event of decision.events) {
      state = evolve(state, event);
      events.push(event);
    }
  }
  if (!state) throw new Error("no commands were applied");
  return { state, events };
}

export interface EncounterOptions {
  seed?: string;
  enemy?: Enemy;
  classDef?: ClassDef;
  mastery?: number;
  retreatable?: boolean;
  reserve?: ReserveTest[];
}

export function startEncounter(options: EncounterOptions = {}): Scenario {
  return play([
    { type: "StartRun", runId: "run-1", seed: options.seed ?? "seed-1", classDef: options.classDef ?? makeClass() },
    {
      type: "StartEncounter",
      roomId: "room-1",
      challenge: {
        id: "foundry.py.dict-word-count",
        language: "javascript",
        difficulty: 3,
        retreatable: options.retreatable ?? true,
        scoring: { crit: true, efficiency: true, elegance: true },
      },
      enemy: options.enemy ?? strikeOnly(),
      tests: TESTS,
      reserve: options.reserve ?? RESERVE,
      mastery: options.mastery ?? 0,
    },
  ]);
}

export function results(passing: Record<string, boolean>): TestOutcome[] {
  return Object.entries(passing).map(([id, passed]) => ({ id, passed, durationMs: 1 }));
}

export const ALL_PASS = results({ v1: true, v2: true, h1: true, h2: true });
export const ALL_FAIL = results({ v1: false, v2: false, h1: false, h2: false });

export function encounterOf(state: RunState): EncounterState {
  if (!state.encounter) throw new Error("the run has no encounter");
  return state.encounter;
}
