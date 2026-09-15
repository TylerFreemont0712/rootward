import {
  type Balance,
  Bolt,
  type Element,
  RELIC_RARITIES,
  type Relic,
  SHARD_RARITIES,
  type Shard,
  type ShardBattle,
  type ShardrunConfig,
  type ShardrunDifficulty,
  type ShardrunFoe,
  type ShardrunLayer,
} from "@rootward/content-schema";
import type { DomainError } from "../result.ts";
import { createRng, pickWeighted, randomFor } from "../rng.ts";
import { generateLayerMap, nextRooms } from "./map.ts";
import type { BattleKind, BattleState, FoeState, LogEntry, MapNode, RewardState, ShardrunState, SpellState } from "./types.ts";

// The rules of Shardrun (ADR-0012, ADR-0013), as pure functions. A spell's shards run in a sandbox first; what comes back
// is only a list of candidate bolts, which these rules validate, pay for, and resolve. No number a shard computes is
// trusted as damage: power is clamped, bolts past the cap fizzle, and every bolt a shard handles costs mana.

export type ShardrunBalance = Balance["shardrun"];

/** Everything from content and config the rules read. */
export interface ShardrunCatalog {
  config: ShardrunConfig;
  shards: ReadonlyMap<string, Shard>;
  foes: ReadonlyMap<string, ShardrunFoe>;
  relics: ReadonlyMap<string, Relic>;
  balance: ShardrunBalance;
}

/** What running a spell's shards in the sandbox produced. `work` counts bolts handed to shards, summed over the pipeline. */
export type PipelineOutcome = { ok: true; bolts: readonly unknown[]; work: number } | { ok: false; reason: string };

export type ShardrunCommand =
  | { type: "enter"; nodeId: string }
  | { type: "arrange"; spells: readonly { id: string; shards: readonly string[] }[]; inventory: readonly string[] }
  | { type: "cast"; spellId: string; outcome: PipelineOutcome }
  | { type: "end-turn" }
  | { type: "take"; shardId: string | null }
  | { type: "claim-relic"; relicId: string }
  | { type: "claim-spell" }
  | { type: "leave" }
  | { type: "rest" }
  | { type: "forge"; shardId: string | null }
  | { type: "widen"; spellId: string }
  | { type: "abandon" };

export type StepResult = { ok: true; state: ShardrunState } | { ok: false; error: DomainError };

/** Run-wide changes from the relics held. */
export interface RelicModifiers {
  boltPower: number;
  damageMultiplier: number;
  weakBonus: number;
  manaPerTurn: number;
  firstCastDiscount: number;
  turnBlock: number;
  healAfterFight: number;
}

const ARRANGEABLE = new Set<ShardrunState["status"]>(["map", "reward", "rest", "forge"]);
const ENDED = new Set<ShardrunState["status"]>(["won", "lost", "abandoned"]);

export interface StartOptions {
  seed: string;
  language: string;
  difficulty: string;
}

export function startShardrun(catalog: ShardrunCatalog, options: StartOptions): ShardrunState {
  const { config, balance } = catalog;
  const firstLayer = config.layers[0];
  if (!firstLayer) throw new Error("a Shardrun config needs at least one layer");
  const state: ShardrunState = {
    version: 2,
    seed: options.seed,
    language: options.language,
    difficulty: difficultyOf(catalog, options.difficulty).id,
    status: "map",
    integrity: balance.integrity_start,
    integrityMax: balance.integrity_start,
    layer: 0,
    map: generateLayerMap(options.seed, 0, firstLayer),
    position: null,
    visited: [],
    spells: config.start.spells.map(
      (spell, index): SpellState => ({ id: `spell-${index + 1}`, name: spell.name, capacity: spell.capacity, shards: [...spell.shards] }),
    ),
    inventory: [...config.start.inventory],
    relics: [],
    revision: 0,
    log: [],
    stats: { fights: 0, turns: 0, casts: 0, damage: 0, shards: 0, relics: 0, layers: 0 },
  };
  for (const relicId of config.start.relics) {
    const relic = catalog.relics.get(relicId);
    if (relic) gainRelic(state, relic, catalog);
  }
  state.log = [{ kind: "layer", text: `${firstLayer.name}. ${firstLayer.flavor}` }];
  return state;
}

/** Apply one command. The input state is never modified: a refused command leaves it exactly as it was. */
export function stepShardrun(state: ShardrunState, command: ShardrunCommand, catalog: ShardrunCatalog): StepResult {
  // LEARN: structuredClone deep-copies plain data, so every rule below can mutate `next` freely; if a rule refuses
  // halfway through, the half-changed copy is simply thrown away.
  const next = structuredClone(state);
  next.log = [];
  const refuse = (code: string, message: string): StepResult => ({ ok: false, error: { code, message } });
  const accept = (): StepResult => {
    next.revision += 1;
    return { ok: true, state: next };
  };

  if (ENDED.has(next.status)) return refuse("run-over", "This run is over. Start a new one.");

  switch (command.type) {
    case "enter": {
      if (next.status !== "map") return refuse("not-on-map", "Finish the room you are in first.");
      const node = nextRooms(next.map, next.position).find((candidate) => candidate.id === command.nodeId);
      if (!node) return refuse("unreachable-node", "No path leads there from here.");
      next.position = node.id;
      next.visited.push(node.id);
      enterRoom(next, node, catalog);
      return accept();
    }

    case "arrange": {
      if (!ARRANGEABLE.has(next.status)) return refuse("cannot-arrange", "Spells can only be rearranged between fights.");
      const byId = new Map(next.spells.map((spell) => [spell.id, spell]));
      if (command.spells.length !== next.spells.length || command.spells.some((spell) => !byId.has(spell.id))) {
        return refuse("unknown-spell", "Every spell must be listed exactly once.");
      }
      for (const change of command.spells) {
        const spell = byId.get(change.id);
        if (spell && change.shards.length > spell.capacity) {
          return refuse("over-capacity", `${spell.name} holds at most ${spell.capacity} shards.`);
        }
      }
      const before = [...next.spells.flatMap((spell) => spell.shards), ...next.inventory];
      const after = [...command.spells.flatMap((spell) => spell.shards), ...command.inventory];
      if (!sameMultiset(before, after)) return refuse("shards-changed", "Rearranging cannot create or destroy shards.");
      for (const change of command.spells) {
        const spell = byId.get(change.id);
        if (spell) spell.shards = [...change.shards];
      }
      next.inventory = [...command.inventory];
      return accept();
    }

    case "cast": {
      const battle = next.battle;
      if (next.status !== "battle" || !battle) return refuse("not-in-battle", "There is nothing to cast at.");
      const spell = next.spells.find((candidate) => candidate.id === command.spellId);
      if (!spell) return refuse("unknown-spell", "No such spell.");
      if (battle.cast.includes(spell.id)) return refuse("already-cast", `${spell.name} is spent until your next turn.`);
      const refusal = castSpell(next, battle, spell, command.outcome, catalog);
      return refusal ? { ok: false, error: refusal } : accept();
    }

    case "end-turn": {
      const battle = next.battle;
      if (next.status !== "battle" || !battle) return refuse("not-in-battle", "There is no turn to end.");
      enemyTurn(next, battle);
      if (next.integrity <= 0) {
        lose(next);
        return accept();
      }
      newTurn(next, battle, catalog);
      return accept();
    }

    case "take": {
      const reward = next.reward;
      if (next.status !== "reward" || !reward?.shards) return refuse("no-shards", "There are no shards to take.");
      if (command.shardId !== null) {
        if (!reward.shards.includes(command.shardId)) return refuse("not-offered", "That shard was not offered.");
        next.inventory.push(command.shardId);
        next.stats.shards += 1;
        log(next, { kind: "reward", text: `You salvage ${catalog.shards.get(command.shardId)?.name ?? command.shardId}.` });
      }
      delete reward.shards;
      settleReward(next, catalog);
      return accept();
    }

    case "claim-relic": {
      const reward = next.reward;
      if (next.status !== "reward" || !reward?.relics) return refuse("no-relics", "There is no relic to claim.");
      const relic = catalog.relics.get(command.relicId);
      if (!relic || !reward.relics.includes(relic.id)) return refuse("not-offered", "That relic was not offered.");
      gainRelic(next, relic, catalog);
      delete reward.relics;
      settleReward(next, catalog);
      return accept();
    }

    case "claim-spell": {
      const reward = next.reward;
      if (next.status !== "reward" || !reward?.spell) return refuse("no-spell", "There is no new spell here.");
      if (next.spells.length >= catalog.balance.max_spells) return refuse("too-many-spells", "Your spellbook is full.");
      const id = `spell-${next.spells.length + 1}`;
      next.spells.push({ id, name: reward.spell.name, capacity: reward.spell.capacity, shards: [] });
      log(next, { kind: "spell", spell: id, text: `A new spell, ${reward.spell.name}, with ${reward.spell.capacity} empty slots.` });
      delete reward.spell;
      settleReward(next, catalog);
      return accept();
    }

    case "leave": {
      if (next.status !== "reward") return refuse("no-reward", "There is nothing to leave behind.");
      delete next.reward;
      log(next, { kind: "note", text: "You leave the rest where it lies." });
      afterRoom(next, catalog);
      return accept();
    }

    case "rest": {
      if (next.status !== "rest") return refuse("not-resting", "There is nowhere to rest here.");
      const healed = Math.min(next.integrityMax - next.integrity, Math.ceil(next.integrityMax * catalog.balance.rest_heal_fraction));
      next.integrity += healed;
      log(next, { kind: "rest", amount: healed, text: `You rest and recover ${healed} Integrity.` });
      afterRoom(next, catalog);
      return accept();
    }

    case "forge": {
      if (next.status !== "forge") return refuse("no-forge", "There is no forge here.");
      if (command.shardId === null) {
        log(next, { kind: "note", text: "You leave the forge as you found it." });
      } else {
        const shard = catalog.shards.get(command.shardId);
        const into = shard?.forge?.into;
        if (!shard || into === undefined) return refuse("cannot-forge", "That shard cannot be reworked.");
        const spell = next.spells.find((candidate) => candidate.shards.includes(shard.id));
        const index = next.inventory.indexOf(shard.id);
        if (spell) spell.shards[spell.shards.indexOf(shard.id)] = into;
        else if (index >= 0) next.inventory[index] = into;
        else return refuse("not-owned", "You do not carry that shard.");
        const verb = shard.forge?.verb === "repair" ? "repair" : "upgrade";
        log(next, { kind: "forge", text: `You ${verb} ${shard.name} into ${catalog.shards.get(into)?.name ?? into}.` });
      }
      afterRoom(next, catalog);
      return accept();
    }

    case "widen": {
      if (next.status !== "forge") return refuse("no-forge", "There is no forge here.");
      const spell = next.spells.find((candidate) => candidate.id === command.spellId);
      if (!spell) return refuse("unknown-spell", "No such spell.");
      if (spell.capacity >= catalog.balance.max_spell_capacity) return refuse("too-wide", `${spell.name} cannot hold more shards.`);
      spell.capacity += 1;
      log(next, { kind: "forge", spell: spell.id, text: `You widen ${spell.name} to ${spell.capacity} slots.` });
      afterRoom(next, catalog);
      return accept();
    }

    case "abandon": {
      next.status = "abandoned";
      log(next, { kind: "loss", text: "You climb back out of the Salvage. The shards stay behind." });
      return accept();
    }
  }
}

// --- Queries the server and client share ----------------------------------------------------------------------------

export function difficultyOf(catalog: ShardrunCatalog, id: string): ShardrunDifficulty {
  const found = catalog.config.difficulties.find((difficulty) => difficulty.id === id) ?? catalog.config.difficulties[0];
  if (!found) throw new Error("a Shardrun config needs at least one difficulty");
  return found;
}

export function layerOf(state: ShardrunState, catalog: ShardrunCatalog): ShardrunLayer {
  const layer = catalog.config.layers[state.layer] ?? catalog.config.layers.at(-1);
  if (!layer) throw new Error("a Shardrun config needs at least one layer");
  return layer;
}

export function relicModifiers(state: Pick<ShardrunState, "relics">, catalog: ShardrunCatalog): RelicModifiers {
  const modifiers: RelicModifiers = {
    boltPower: 0,
    damageMultiplier: 1,
    weakBonus: 0,
    manaPerTurn: 0,
    firstCastDiscount: 0,
    turnBlock: 0,
    healAfterFight: 0,
  };
  for (const relicId of state.relics) {
    for (const effect of catalog.relics.get(relicId)?.effects ?? []) {
      switch (effect.kind) {
        case "bolt-power":
          modifiers.boltPower += effect.add;
          break;
        case "damage-multiplier":
          modifiers.damageMultiplier *= effect.factor;
          break;
        case "weak-bonus":
          modifiers.weakBonus += effect.add;
          break;
        case "mana-per-turn":
          modifiers.manaPerTurn += effect.add;
          break;
        case "first-cast-discount":
          modifiers.firstCastDiscount += effect.amount;
          break;
        case "turn-block":
          modifiers.turnBlock += effect.amount;
          break;
        case "heal-after-fight":
          modifiers.healAfterFight += effect.amount;
          break;
        case "spell-capacity":
        case "max-integrity":
          // One-time effects, applied when the relic is claimed.
          break;
      }
    }
  }
  return modifiers;
}

export function manaPerTurn(state: Pick<ShardrunState, "relics">, catalog: ShardrunCatalog): number {
  return Math.max(1, catalog.balance.mana_per_turn + relicModifiers(state, catalog).manaPerTurn);
}

/** Mana a cast costs right now: the base, every shard's own cost, the work its shards did, and any first-cast discount. */
export function castCost(state: ShardrunState, spell: SpellState, work: number, catalog: ShardrunCatalog): number {
  return discounted(state, spellCost(spell, work, catalog), catalog);
}

/** Mana a spell costs before discounts. */
export function spellCost(spell: SpellState, work: number, catalog: ShardrunCatalog): number {
  const shardCosts = spell.shards.reduce((sum, id) => sum + (catalog.shards.get(id)?.cost ?? 0), 0);
  return catalog.balance.spell_base_cost + shardCosts + Math.floor(Math.max(0, work) / catalog.balance.work_per_mana);
}

/**
 * Turn whatever a pipeline returned into bolts the rules accept: malformed ones and ones past the cap fizzle, and power
 * is rounded and clamped. Nothing a shard writes into a bolt can exceed what balance.yaml allows.
 */
export function normalizeBolts(raw: readonly unknown[], balance: ShardrunBalance): { bolts: Bolt[]; fizzled: number } {
  const bolts: Bolt[] = [];
  let fizzled = 0;
  for (const candidate of raw) {
    const parsed = Bolt.safeParse(candidate);
    if (!parsed.success || bolts.length >= balance.max_bolts) {
      fizzled += 1;
      continue;
    }
    bolts.push({ ...parsed.data, power: clampPower(parsed.data.power, balance) });
  }
  return { bolts, fizzled };
}

/** The bolt every spell starts from, before its first shard. */
export function baseBolt(balance: ShardrunBalance): Bolt {
  return { power: balance.base_bolt_power, element: "none", target: "front", pierce: false, ward: false };
}

/** The battle as shard code sees it: only living foes, and only fields a player could read off the screen. */
export function shardBattle(state: ShardrunState, battle: BattleState): ShardBattle {
  return {
    turn: battle.turn,
    me: { hp: state.integrity, max: state.integrityMax, block: battle.block, mana: battle.mana },
    foes: battle.foes
      .filter((foe) => foe.hp > 0)
      .map((foe) => ({ name: foe.name, hp: foe.hp, max: foe.max, shield: foe.shield, weak: [...foe.weak], resist: [...foe.resist] })),
  };
}

export interface CastPreview {
  cost: number;
  /** Enough mana, and not yet cast this turn. */
  affordable: boolean;
  bolts: number;
  damage: number;
  block: number;
  misfire?: string;
}

/** What casting a spell right now would do, worked out on a copy of the state. */
export function previewCast(state: ShardrunState, spellId: string, outcome: PipelineOutcome, catalog: ShardrunCatalog): CastPreview | undefined {
  const battle = state.battle;
  const spell = state.spells.find((candidate) => candidate.id === spellId);
  if (!battle || !spell) return undefined;
  const spent = battle.cast.includes(spell.id);
  if (!outcome.ok) {
    const cost = discounted(state, catalog.balance.spell_base_cost, catalog);
    return { cost, affordable: !spent && cost <= battle.mana, bolts: 0, damage: 0, block: 0, misfire: outcome.reason };
  }
  const cost = castCost(state, spell, outcome.work, catalog);
  return { cost, affordable: !spent && cost <= battle.mana, ...previewBolts(state, outcome.bolts, catalog) };
}

/**
 * What a list of candidate bolts would do if a spell ended with them now: how many survive, the damage they deal, and
 * the block they raise. The code view uses it after every shard, so its numbers are the rules' own.
 */
export function previewBolts(state: ShardrunState, raw: readonly unknown[], catalog: ShardrunCatalog): { bolts: number; damage: number; block: number } {
  const copy = structuredClone(state);
  const battle = copy.battle;
  if (!battle) return { bolts: 0, damage: 0, block: 0 };
  const blockBefore = battle.block;
  const bolts = empower(normalizeBolts(raw, catalog.balance).bolts, copy, catalog);
  copy.log = [];
  const damage = resolveBolts(copy, battle, bolts, catalog);
  return { bolts: bolts.length, damage, block: battle.block - blockBefore };
}

/** The foes waiting in a battle room, fixed by the run's seed so the map can show them before the room is entered. */
export function encounterFor(seed: string, node: MapNode, layer: ShardrunLayer): readonly string[] {
  if (node.kind !== "fight" && node.kind !== "elite" && node.kind !== "boss") return [];
  const groups = layer.encounters[node.kind];
  return groups[Math.floor(randomFor(seed, `encounter:${node.id}`, 0) * groups.length)] ?? groups[0] ?? [];
}

// --- Rooms ----------------------------------------------------------------------------------------------------------

function enterRoom(state: ShardrunState, node: MapNode, catalog: ShardrunCatalog): void {
  switch (node.kind) {
    case "rest":
      state.status = "rest";
      log(state, { kind: "enter", text: "A quiet alcove. The hum of the Machine is almost soothing." });
      return;
    case "forge":
      state.status = "forge";
      log(state, { kind: "enter", text: "An abandoned forge, still warm. A shard can be reworked, or a spell widened." });
      return;
    case "treasure": {
      const relics = draftRelics(state, "treasure", catalog.balance.treasure_relic_choices, catalog);
      log(state, { kind: "enter", text: "A sealed cache, left behind by an earlier Maintainer." });
      if (relics.length === 0) {
        log(state, { kind: "note", text: "It is empty. Someone got here first." });
        afterRoom(state, catalog);
        return;
      }
      state.reward = { relics };
      state.status = "reward";
      return;
    }
    case "fight":
    case "elite":
    case "boss":
      startBattle(state, node, node.kind, catalog);
      return;
  }
}

function settleReward(state: ShardrunState, catalog: ShardrunCatalog): void {
  const reward = state.reward;
  if (reward && (reward.shards || reward.relics || reward.spell)) return;
  delete state.reward;
  afterRoom(state, catalog);
}

function afterRoom(state: ShardrunState, catalog: ShardrunCatalog): void {
  const node = state.map.nodes.find((candidate) => candidate.id === state.position);
  if (node?.kind !== "boss") {
    state.status = "map";
    return;
  }
  state.stats.layers += 1;
  const nextIndex = state.layer + 1;
  const nextLayer = catalog.config.layers[nextIndex];
  if (!nextLayer) {
    state.status = "won";
    log(state, { kind: "victory", text: "The last guardian falls. The Salvage is yours." });
    return;
  }
  state.layer = nextIndex;
  state.map = generateLayerMap(state.seed, nextIndex, nextLayer);
  state.position = null;
  state.visited = [];
  const healed = Math.min(state.integrityMax - state.integrity, Math.ceil(state.integrityMax * catalog.balance.layer_heal_fraction));
  state.integrity += healed;
  state.status = "map";
  log(state, { kind: "layer", amount: healed, text: `You descend into ${nextLayer.name}, recovering ${healed} Integrity. ${nextLayer.flavor}` });
}

function gainRelic(state: ShardrunState, relic: Relic, catalog: ShardrunCatalog): void {
  state.relics.push(relic.id);
  state.stats.relics += 1;
  for (const effect of relic.effects) {
    if (effect.kind === "spell-capacity") {
      for (const spell of state.spells) spell.capacity = Math.min(catalog.balance.max_spell_capacity, spell.capacity + effect.add);
    } else if (effect.kind === "max-integrity") {
      state.integrityMax += effect.add;
      state.integrity += effect.add;
    }
  }
  log(state, { kind: "relic", text: `You claim ${relic.name}: ${relic.summary}` });
}

// --- Battles --------------------------------------------------------------------------------------------------------

function startBattle(state: ShardrunState, node: MapNode, kind: BattleKind, catalog: ShardrunCatalog): void {
  const layer = layerOf(state, catalog);
  const difficulty = difficultyOf(catalog, state.difficulty);
  const group = encounterFor(state.seed, node, layer);
  const foes = group.flatMap((foeId, index): FoeState[] => {
    const def = catalog.foes.get(foeId);
    if (!def) return [];
    const hp = Math.max(1, Math.round(def.hp * layer.foe_hp * difficulty.foe_hp));
    return [
      {
        uid: `${node.id}-${index}`,
        id: def.id,
        name: def.name,
        sprite: def.sprite,
        hp,
        max: hp,
        shield: 0,
        weak: [...def.weak],
        resist: [...def.resist],
        ...(def.trait ? { trait: def.trait } : {}),
        intents: [...def.intents],
        // Two of the same foe start on different steps of their pattern, so they do not act in lockstep.
        intentIndex: index % def.intents.length,
        stoked: false,
        nullified: false,
        flavor: def.flavor,
      },
    ];
  });
  if (foes.length === 0) {
    afterRoom(state, catalog);
    return;
  }
  const modifiers = relicModifiers(state, catalog);
  const battle: BattleState = { kind, turn: 1, mana: manaPerTurn(state, catalog), block: modifiers.turnBlock, foes, cast: [] };
  beginTurn(battle);
  state.battle = battle;
  state.status = "battle";
  state.stats.fights += 1;
  log(state, { kind: "enter", text: `${foes.map((foe) => foe.name).join(" and ")} ${foes.length === 1 ? "blocks" : "block"} the way.` });
}

function castSpell(
  state: ShardrunState,
  battle: BattleState,
  spell: SpellState,
  outcome: PipelineOutcome,
  catalog: ShardrunCatalog,
): DomainError | undefined {
  const { balance } = catalog;
  if (!outcome.ok) {
    const cost = discounted(state, balance.spell_base_cost, catalog);
    if (cost > battle.mana) return { code: "not-enough-mana", message: `${spell.name} needs mana you do not have.` };
    battle.mana -= cost;
    battle.cast.push(spell.id);
    state.stats.casts += 1;
    log(state, { kind: "fizzle", spell: spell.id, amount: cost, text: `${spell.name} fizzles: ${outcome.reason}` });
    return undefined;
  }
  const cost = castCost(state, spell, outcome.work, catalog);
  if (cost > battle.mana) {
    return { code: "not-enough-mana", message: `${spell.name} needs ${cost} mana and you have ${battle.mana}.` };
  }
  battle.mana -= cost;
  battle.cast.push(spell.id);
  state.stats.casts += 1;

  const normalized = normalizeBolts(outcome.bolts, balance);
  const bolts = empower(normalized.bolts, state, catalog);
  log(state, {
    kind: "cast",
    spell: spell.id,
    amount: cost,
    text: `${spell.name}: ${bolts.length} ${bolts.length === 1 ? "bolt" : "bolts"} for ${cost} mana.`,
  });
  if (normalized.fizzled > 0) {
    log(state, {
      kind: "fizzle",
      spell: spell.id,
      amount: normalized.fizzled,
      text: `${normalized.fizzled} ${normalized.fizzled === 1 ? "bolt" : "bolts"} fizzled.`,
    });
  }

  const curse = spell.shards.reduce((sum, id) => sum + (catalog.shards.get(id)?.curse?.integrity ?? 0), 0);
  if (curse > 0) {
    state.integrity = Math.max(0, state.integrity - curse);
    log(state, { kind: "curse", amount: curse, text: `Cursed code burns you for ${curse} Integrity.` });
  }

  state.stats.damage += resolveBolts(state, battle, bolts, catalog);
  if (state.integrity <= 0) lose(state);
  else if (battle.foes.every((foe) => foe.hp === 0)) win(state, battle, catalog);
  return undefined;
}

/** Relics that add power apply after the last shard, before the bolts fly, and stay inside the power cap. */
function empower(bolts: readonly Bolt[], state: ShardrunState, catalog: ShardrunCatalog): Bolt[] {
  const add = relicModifiers(state, catalog).boltPower;
  return add === 0 ? [...bolts] : bolts.map((bolt) => ({ ...bolt, power: clampPower(bolt.power + add, catalog.balance) }));
}

/** Fire bolts in order and return the damage dealt. Logs every hit so the client can animate it. */
function resolveBolts(state: ShardrunState, battle: BattleState, bolts: readonly Bolt[], catalog: ShardrunCatalog): number {
  const { balance } = catalog;
  const modifiers = relicModifiers(state, catalog);
  let dealt = 0;
  for (const bolt of bolts) {
    if (bolt.ward) {
      battle.block += bolt.power;
      log(state, { kind: "ward", amount: bolt.power, element: bolt.element, text: `A ward gathers ${bolt.power} block.` });
      continue;
    }
    const alive = battle.foes.filter((foe) => foe.hp > 0);
    if (alive.length === 0) break;
    const share = bolt.target === "all" ? balance.scatter_multiplier : 1;
    for (const foe of targetsOf(bolt, alive)) {
      const power = Math.floor(bolt.power * share);
      if (foe.trait?.kind === "nullify-first" && !foe.nullified) {
        foe.nullified = true;
        log(state, { kind: "absorb", foe: foe.uid, element: bolt.element, text: `${foe.name} swallows the first bolt whole.` });
        continue;
      }
      if (foe.trait?.kind === "thick-hide" && power < foe.trait.threshold) {
        log(state, { kind: "glance", foe: foe.uid, element: bolt.element, text: `A ${power}-power bolt glances off ${foe.name}.` });
        continue;
      }
      let multiplier = modifiers.damageMultiplier;
      if (foe.trait?.kind === "pattern-ward" && bolt.element !== foe.pattern) multiplier *= balance.pattern_off_multiplier;
      if (foe.weak.includes(bolt.element)) multiplier *= balance.weak_multiplier + modifiers.weakBonus;
      else if (foe.resist.includes(bolt.element)) multiplier *= balance.resist_multiplier;
      let damage = Math.floor(power * multiplier);
      let blocked = 0;
      if (!bolt.pierce) {
        blocked = Math.min(foe.shield, damage);
        foe.shield -= blocked;
        damage -= blocked;
      }
      damage = Math.min(damage, foe.hp);
      foe.hp -= damage;
      dealt += damage;
      const shieldNote = blocked > 0 ? ` (${blocked} into its shield)` : "";
      log(state, { kind: "hit", foe: foe.uid, amount: damage, element: bolt.element, text: `${foe.name} takes ${damage}${shieldNote}.` });
      if (foe.hp === 0) log(state, { kind: "defeat", foe: foe.uid, text: `${foe.name} breaks apart.` });
    }
  }
  return dealt;
}

function targetsOf(bolt: Bolt, alive: readonly FoeState[]): FoeState[] {
  const pick = (better: (a: FoeState, b: FoeState) => boolean) => alive.reduce((best, foe) => (better(foe, best) ? foe : best));
  switch (bolt.target) {
    case "all":
      return [...alive];
    case "back":
      return alive.slice(-1);
    case "weakest":
      return [pick((a, b) => a.hp < b.hp)];
    case "strongest":
      return [pick((a, b) => a.hp > b.hp)];
    case "front":
      return alive.slice(0, 1);
  }
}

function enemyTurn(state: ShardrunState, battle: BattleState): void {
  for (const foe of battle.foes) {
    if (foe.hp === 0) continue;
    // A shield raised last turn has done its job by the time its owner acts again.
    foe.shield = 0;
    const intent = foe.intents[foe.intentIndex % foe.intents.length];
    if (!intent) continue;
    switch (intent.kind) {
      case "strike": {
        const power = intent.power * (foe.stoked ? 2 : 1);
        foe.stoked = false;
        hitMaintainer(state, battle, foe, power);
        break;
      }
      case "multi":
        for (let i = 0; i < intent.times && state.integrity > 0; i++) hitMaintainer(state, battle, foe, intent.power);
        break;
      case "shield":
        foe.shield += intent.amount;
        log(state, { kind: "shield", foe: foe.uid, amount: intent.amount, text: `${foe.name} raises a ${intent.amount}-point shield.` });
        break;
      case "stoke":
        foe.stoked = true;
        log(state, { kind: "stoke", foe: foe.uid, text: `${foe.name} stokes its fire. Its next strike hits twice as hard.` });
        break;
      case "heal": {
        const healed = Math.min(foe.max - foe.hp, intent.amount);
        foe.hp += healed;
        log(state, { kind: "heal", foe: foe.uid, amount: healed, text: `${foe.name} mends ${healed} HP.` });
        break;
      }
    }
    if (state.integrity <= 0) return;
  }
}

function hitMaintainer(state: ShardrunState, battle: BattleState, foe: FoeState, power: number): void {
  const blocked = Math.min(battle.block, power);
  battle.block -= blocked;
  const damage = power - blocked;
  state.integrity = Math.max(0, state.integrity - damage);
  const blockNote = blocked > 0 ? ` (${blocked} blocked)` : "";
  log(state, { kind: "enemy", foe: foe.uid, amount: damage, text: `${foe.name} hits you for ${damage}${blockNote}.` });
}

function newTurn(state: ShardrunState, battle: BattleState, catalog: ShardrunCatalog): void {
  battle.turn += 1;
  battle.mana = manaPerTurn(state, catalog);
  battle.block = relicModifiers(state, catalog).turnBlock;
  battle.cast = [];
  for (const foe of battle.foes) foe.intentIndex = (foe.intentIndex + 1) % foe.intents.length;
  beginTurn(battle);
  state.stats.turns += 1;
  log(state, { kind: "turn", amount: battle.turn, text: `Turn ${battle.turn}.` });
}

/** Per-turn traits: a shifting weakness moves on, a pattern ward changes its element, nullify is ready again. */
function beginTurn(battle: BattleState): void {
  for (const foe of battle.foes) {
    foe.nullified = false;
    const trait = foe.trait;
    if (trait?.kind === "shifting-weakness") foe.weak = elementAt(trait.cycle, battle.turn);
    if (trait?.kind === "pattern-ward") {
      const [element] = elementAt(trait.pattern, battle.turn);
      if (element) foe.pattern = element;
    }
  }
}

function elementAt(cycle: readonly Element[], turn: number): Element[] {
  const element = cycle[(turn - 1) % cycle.length];
  return element ? [element] : [];
}

function win(state: ShardrunState, battle: BattleState, catalog: ShardrunCatalog): void {
  delete state.battle;
  const { balance } = catalog;
  const heal = relicModifiers(state, catalog).healAfterFight;
  if (heal > 0) {
    const healed = Math.min(state.integrityMax - state.integrity, heal);
    state.integrity += healed;
    if (healed > 0) log(state, { kind: "heal", amount: healed, text: `Your patch kit restores ${healed} Integrity.` });
  }
  log(state, {
    kind: "victory",
    text: battle.kind === "boss" ? "The guardian falls. The way down opens." : "The way is clear. Shards scatter across the floor.",
  });

  const reward: RewardState = {};
  const shards = draftShards(state, battle.kind, catalog);
  if (shards.length > 0) reward.shards = shards;
  const relicCount = battle.kind === "boss" ? balance.boss_relic_choices : battle.kind === "elite" ? balance.elite_relic_choices : 0;
  if (relicCount > 0 && battle.kind !== "fight") {
    const relics = draftRelics(state, battle.kind, relicCount, catalog);
    if (relics.length > 0) reward.relics = relics;
  }
  const bossSpell = layerOf(state, catalog).boss_spell;
  if (battle.kind === "boss" && bossSpell && state.spells.length < balance.max_spells) reward.spell = { ...bossSpell };

  if (!reward.shards && !reward.relics && !reward.spell) {
    afterRoom(state, catalog);
    return;
  }
  state.reward = reward;
  state.status = "reward";
}

function lose(state: ShardrunState): void {
  state.status = "lost";
  log(state, { kind: "loss", text: "Kernel panic. The Salvage keeps what you carried." });
}

/** Distinct draftable shards for a reward, rarity by the fight's weights, drawn from the run's seed. */
function draftShards(state: ShardrunState, kind: BattleKind, catalog: ShardrunCatalog): string[] {
  const weights = catalog.config.rewards.shards[kind];
  const rng = createRng(state.seed, `reward:${state.layer}:${state.visited.length}`);
  const pool = [...catalog.shards.values()].filter((shard) => shard.draftable).sort((a, b) => a.id.localeCompare(b.id));
  const choices: string[] = [];
  for (let attempt = 0; choices.length < catalog.balance.reward_choices && attempt < 60; attempt++) {
    const rarity = pickWeighted(
      SHARD_RARITIES.map((candidate) => ({ rarity: candidate, weight: weights[candidate] })),
      rng(),
    )?.rarity;
    const candidates = pool.filter((shard) => shard.rarity === rarity && !choices.includes(shard.id));
    const pick = candidates[Math.floor(rng() * candidates.length)];
    if (pick) choices.push(pick.id);
  }
  return choices;
}

/** Distinct relics the run does not hold yet, rarity by where they are found, drawn from the run's seed. */
function draftRelics(state: ShardrunState, where: "elite" | "treasure" | "boss", count: number, catalog: ShardrunCatalog): string[] {
  const weights = catalog.config.rewards.relics[where];
  const rng = createRng(state.seed, `relic:${where}:${state.layer}:${state.visited.length}`);
  const pool = [...catalog.relics.values()].filter((relic) => !state.relics.includes(relic.id)).sort((a, b) => a.id.localeCompare(b.id));
  const choices: string[] = [];
  for (let attempt = 0; choices.length < count && attempt < 60; attempt++) {
    const rarity = pickWeighted(
      RELIC_RARITIES.map((candidate) => ({ rarity: candidate, weight: weights[candidate] })),
      rng(),
    )?.rarity;
    const candidates = pool.filter((relic) => relic.rarity === rarity && !choices.includes(relic.id));
    const pick = candidates[Math.floor(rng() * candidates.length)];
    if (pick) choices.push(pick.id);
  }
  return choices;
}

function discounted(state: ShardrunState, cost: number, catalog: ShardrunCatalog): number {
  const first = (state.battle?.cast.length ?? 0) === 0;
  return first ? Math.max(0, cost - relicModifiers(state, catalog).firstCastDiscount) : cost;
}

function clampPower(power: number, balance: ShardrunBalance): number {
  return Math.max(0, Math.min(balance.max_bolt_power, Math.round(power)));
}

function log(state: ShardrunState, entry: LogEntry): void {
  state.log.push(entry);
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const item of a) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of b) {
    const left = (counts.get(item) ?? 0) - 1;
    if (left < 0) return false;
    counts.set(item, left);
  }
  return true;
}
