import type { Balance } from "@rootward/content-schema";
import { z } from "zod";
import type { EncounterState, EncounterTest, EnemyAction } from "./types.ts";

// Enemy moves (PROMPT.md section 7.3). Each move is data plus one function: a parameter schema that content is
// validated against, and a `resolve` that decides what happens. Enemy YAML refers to moves by id.

export interface MoveContext {
  encounter: EncounterState;
  balance: Balance;
  /** Number of tests still failing after the Cast that triggered this move. */
  failingCount: number;
  integrity: number;
}

export type MoveOutcome =
  | { kind: "strike"; action: Extract<EnemyAction, { move: "strike" }>; integrity: number }
  | { kind: "edge-case"; action: Extract<EnemyAction, { move: "edge-case" }>; test: EncounterTest };

export interface MoveDefinition {
  id: string;
  params: z.ZodType;
  /** False for moves the engine does not support yet: they fall back to Strike and validation warns. */
  implemented: boolean;
  /** Returns undefined when the move cannot apply right now (for example no reserve test left), which also falls back to Strike. */
  resolve(ctx: MoveContext, params: unknown): MoveOutcome | undefined;
}

function defineMove<P extends z.ZodType>(
  id: string,
  params: P,
  resolve: (ctx: MoveContext, params: z.output<P>) => MoveOutcome | undefined,
): MoveDefinition {
  return {
    id,
    params,
    implemented: true,
    resolve: (ctx, raw) => {
      const parsed = params.safeParse(raw);
      return parsed.success ? resolve(ctx, parsed.data) : undefined;
    },
  };
}

function placeholder(id: string): MoveDefinition {
  return { id, params: z.looseObject({}), implemented: false, resolve: () => undefined };
}

/** Damage = failing tests x enemy ATK, capped by `enemy_moves.strike_damage_cap`. Also the fallback for every move. */
export function strike(ctx: MoveContext, fallbackFrom?: string): MoveOutcome {
  const damage = Math.min(ctx.failingCount * ctx.encounter.enemy.atk, ctx.balance.enemy_moves.strike_damage_cap);
  const action: Extract<EnemyAction, { move: "strike" }> = { move: "strike", damage };
  if (fallbackFrom !== undefined) action.fallbackFrom = fallbackFrom;
  return { kind: "strike", action, integrity: Math.max(0, ctx.integrity - damage) };
}

const strikeMove = defineMove("strike", z.strictObject({}), (ctx) => strike(ctx));

/** Reveals a reserve hidden test of the given category; the enemy gains its weight in HP until the player passes it. */
const edgeCaseMove = defineMove("edge-case", z.strictObject({ category: z.string().min(1) }), (ctx, params) => {
  const reserve = ctx.encounter.reserve.find((test) => test.category === params.category);
  if (!reserve) return undefined;
  const test: EncounterTest = {
    id: reserve.id,
    name: reserve.name,
    visibility: "hidden",
    category: reserve.category,
    weight: ctx.balance.enemy_moves.edge_case_hp_added,
    passing: false,
    revealedBy: "edge-case",
  };
  return { kind: "edge-case", action: { move: "edge-case", testId: reserve.id, category: reserve.category }, test };
});

// Your Turn (medium): implement `drain` (costs the player `enemy_moves.drain_focus` Focus). It needs a new outcome
// kind, an event, and a case in evolve.ts; `edge-case` is the closest worked example.
const MOVE_LIST: readonly MoveDefinition[] = [
  strikeMove,
  edgeCaseMove,
  placeholder("drain"),
  placeholder("constraint-curse"),
  placeholder("timeout-breath"),
  placeholder("memory-bloat"),
  placeholder("obfuscate"),
  placeholder("regression"),
  placeholder("counterattack"),
  placeholder("split"),
];

export const MOVES: ReadonlyMap<string, MoveDefinition> = new Map(MOVE_LIST.map((move) => [move.id, move]));
