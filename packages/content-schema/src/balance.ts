import { z } from "zod";
import { Semver } from "./primitives.ts";
import { WorkCurve } from "./shardrun.ts";

const PositiveInt = z.int().positive();
const NonNegativeInt = z.int().min(0);
const Ratio = z.number().min(0).max(1);

// LEARN: a record keyed by an enum is exhaustive in zod 4: every key must be present. That turns "forgot to tune
// tier 3" from a silent `undefined` at runtime into a validation error when the file loads.
const MasteryKey = z.enum(["0", "1", "2", "3", "4", "5"]);
const TierKey = z.enum(["0", "1", "2", "3", "4"]);
const EnemyTierKey = z.enum(["1", "2", "3", "elite", "boss", "special"]);
const DifficultyKey = z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

/** `config/balance.yaml`: every tunable number in the game. */
export const Balance = z.strictObject({
  version: z.literal(1),
  player: z.strictObject({
    integrity_start: PositiveInt,
    focus_base: PositiveInt,
    cycles_start: NonNegativeInt,
  }),
  encounter: z.strictObject({
    test_weights: z.strictObject({
      visible: NonNegativeInt,
      hidden: NonNegativeInt,
      adversary: NonNegativeInt,
    }),
    regression_heals_enemy: z.boolean(),
    suggest_retreat_after_failed_casts: PositiveInt,
    hint_costs_cycles: z.tuple([NonNegativeInt, NonNegativeInt, NonNegativeInt, NonNegativeInt]),
    hint_cost_multiplier_by_mastery: z.record(MasteryKey, z.number().min(0)),
  }),
  enemy_moves: z.strictObject({
    strike_atk_by_tier: z.record(EnemyTierKey, NonNegativeInt),
    strike_damage_cap: PositiveInt,
    edge_case_hp_added: PositiveInt,
    drain_focus: PositiveInt,
    timeout_breath_factor: z.number().gt(0).max(1),
    memory_bloat_factor: z.number().gt(0).max(1),
    counterattack_tests: z.strictObject({ min: PositiveInt, max: PositiveInt }),
  }),
  bonuses: z.strictObject({
    commits_multiplier: z.strictObject({
      crit: z.number().min(1),
      true_sight: z.number().min(1),
      efficiency: z.number().min(1),
      elegance: z.number().min(1),
      unaided: z.number().min(1),
    }),
    elegance_threshold: z.number().min(0).max(10),
    efficiency_max_ratio_vs_reference: z.number().min(1),
    cycles_by_tier: z.record(EnemyTierKey, NonNegativeInt),
  }),
  commits: z.strictObject({
    base_by_difficulty: z.record(DifficultyKey, PositiveInt),
    puzzle_multiplier: z.number().min(0),
    boss_split_across_concepts: z.boolean(),
  }),
  mastery: z.strictObject({
    retained_min_days_between_passes: PositiveInt,
    rotting_retrievability_below: Ratio,
    rotting_after_days_unexercised: PositiveInt,
    never_drop_below_once_reached: z.int().min(0).max(5),
  }),
  planner: z.strictObject({
    session_rooms: z.strictObject({ short: PositiveInt, standard: PositiveInt, long: PositiveInt }),
    default_session: z.enum(["short", "standard", "long"]),
    target_success: z.strictObject({ frontier: Ratio, review: Ratio, elite: Ratio }),
    frontier_nodes_per_run: z.strictObject({ min: PositiveInt, max: PositiveInt }),
    review_slots_per_run: z.strictObject({ rest: NonNegativeInt, encounter: NonNegativeInt }),
    stretch_probability: Ratio,
    recency_exclusion_days: NonNegativeInt,
    streak_valve: z.strictObject({
      failures_to_soften: PositiveInt,
      crits_to_harden: PositiveInt,
      target_delta: Ratio,
    }),
  }),
  rating: z.strictObject({
    initial_player: z.number(),
    challenge_rating_base: z.number(),
    challenge_rating_per_difficulty: z.number(),
    k_by_tier: z.record(TierKey, z.number().positive()),
    actual_score: z.strictObject({ unaided: Ratio, assisted: Ratio, retreat: Ratio }),
    max_change_per_attempt: z.number().positive(),
  }),
  character_version: z.strictObject({
    patch_per_encounter: PositiveInt,
    minor_per_dungeon: PositiveInt,
    major_requires_realm_boss_and_avg_mastery: z.number().min(0).max(5),
    unlocks: z.record(Semver, z.string().regex(/^[a-z][a-z0-9_]*$/)),
  }),
  /** Shardrun, the roguelite mode (ADR-0012). */
  shardrun: z.strictObject({
    integrity_start: PositiveInt,
    /** Mana a turn gives: the base, plus `per_layer` for every layer descended (ADR-0015). Income grows with the bill. */
    mana_per_turn: z.strictObject({ base: PositiveInt, per_layer: NonNegativeInt }),
    /** Every cast pays this before its shards' own costs. */
    spell_base_cost: NonNegativeInt,
    /**
     * How the work a pipeline did is billed in mana (ADR-0015). Work units come from each shard's complexity class and
     * the bolts it was handed; `per_mana` is the units one mana buys on the linear curve, and the curve decides how
     * that bill grows. A sublinear curve is what makes a wide build payable at all.
     */
    work_billing: z.strictObject({ curve: WorkCurve, per_mana: PositiveInt, log_base: z.number().min(1.1) }),
    base_bolt_power: PositiveInt,
    /** Bolts that land after the last shard: the base, plus `per_layer` for each layer descended, never past `max`. */
    bolt_cap: z.strictObject({ base: PositiveInt, per_layer: NonNegativeInt, max: PositiveInt }),
    /** Inside the pipeline, a shard's output is cut to this many before the next shard sees it. */
    max_pipeline_bolts: PositiveInt,
    max_bolt_power: PositiveInt,
    /** A bolt's multiplier is player code's number too, so it is clamped exactly as its power is (ADR-0014). */
    max_bolt_mult: z.number().min(1),
    /**
     * The most Integrity a foe can be given, however a layer and a difficulty multiply it (ADR-0016). Damage is
     * bounded by foe HP by construction, so this one number is what keeps every number the engine carries an exact
     * integer: it must leave room under 2^53 for the intermediate products of a whole cast.
     */
    max_foe_hp: PositiveInt,
    weak_multiplier: z.number().min(1),
    resist_multiplier: Ratio,
    /** A bolt aimed at every foe hits each for this fraction of its power. */
    scatter_multiplier: Ratio,
    /** Against a pattern ward, a bolt of the wrong element hits for this fraction. */
    pattern_off_multiplier: Ratio,
    rest_heal_fraction: Ratio,
    reward_choices: PositiveInt,
    /** Relics offered after an elite, in a treasure room, and after a boss. */
    elite_relic_choices: NonNegativeInt,
    treasure_relic_choices: PositiveInt,
    boss_relic_choices: PositiveInt,
    max_spells: PositiveInt,
    /** A forge can widen a spell up to this many slots. */
    max_spell_capacity: PositiveInt,
    /** Integrity restored on reaching the next layer, as a fraction of the maximum. */
    layer_heal_fraction: Ratio,
    /** Bolts per step kept in a spell's trace for the code view. */
    trace_bolts: PositiveInt,
    /** The experimental deck playstyle (ADR-0020), where shards are cards drawn into blank spells every turn. */
    deck: z.strictObject({
      /** Cards drawn at the start of every turn. */
      hand_size: PositiveInt,
      /** A deck run's income: less than a spellbook's, so two full spells are not always both castable. */
      mana_per_turn: z.strictObject({ base: PositiveInt, per_layer: NonNegativeInt }),
      /** A forge will not melt down a card when the deck is this small. */
      min_cards: PositiveInt,
    }),
  }),
  sandbox_defaults: z.strictObject({
    wall_ms: PositiveInt,
    cpu_ms: PositiveInt,
    mem_mb: PositiveInt,
    pids: PositiveInt,
    output_kb: PositiveInt,
    max_concurrent: PositiveInt,
  }),
});
export type Balance = z.infer<typeof Balance>;
