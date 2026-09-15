import { z } from "zod";
import { Effect } from "./effect.ts";
import { Id, NonEmptyString, Semver } from "./primitives.ts";

/** Mirrors `RunJob["kind"]` in @rootward/runners. */
export const RunKind = z.enum(["tests", "script", "terminal-check"]);
export type RunKind = z.infer<typeof RunKind>;

export const Passive = z.strictObject({
  id: Id,
  name: NonEmptyString,
  description: NonEmptyString,
  implemented: z.boolean(),
  effects: z.array(Effect).default([]),
});
export type Passive = z.infer<typeof Passive>;

/** `classes/<id>/class.yaml`: an engineering discipline (PROMPT.md section 6). */
export const ClassDef = z.strictObject({
  id: Id,
  name: NonEmptyString,
  tagline: NonEmptyString,
  discipline: NonEmptyString,
  /** Realm id -> planner weight in [0, 1]. Classes never lock content; they shape preferences. */
  affinity: z.record(Id, z.number().min(0).max(1)),
  default_runner_kinds: z.array(RunKind).min(1),
  starting_artifacts: z.array(Id).default([]),
  /** Falls back to `player` in config/balance.yaml when omitted. */
  base_stats: z.strictObject({ integrity: z.int().positive(), focus: z.int().positive() }).optional(),
  passives: z.array(Passive).default([]),
  lore: NonEmptyString.default("lore.md"),
  /** `planned` classes are shown at character creation but cannot be picked yet. */
  status: z.enum(["playable", "planned"]).default("playable"),
  /** What the class teaches, in a few words each, for the class picker. */
  subjects: z.array(NonEmptyString).default([]),
  /** Where the class appears in the picker; lower first. */
  order: z.int().min(0).default(100),
});
export type ClassDef = z.infer<typeof ClassDef>;

export const AbilityCost = z.strictObject({
  focus: z.int().min(0).optional(),
  cycles: z.int().min(0).optional(),
  integrity: z.int().min(0).optional(),
});
export type AbilityCost = z.infer<typeof AbilityCost>;

export const Ability = z.strictObject({
  id: Id,
  name: NonEmptyString,
  description: NonEmptyString,
  cost: AbilityCost.default({}),
  unlock_version: Semver,
  implemented: z.boolean(),
  ultimate: z.boolean().default(false),
  effects: z.array(Effect).min(1),
});
export type Ability = z.infer<typeof Ability>;

/** `classes/<id>/abilities.yaml`. */
export const AbilitiesFile = z.strictObject({
  abilities: z.array(Ability).min(1),
});
export type AbilitiesFile = z.infer<typeof AbilitiesFile>;
