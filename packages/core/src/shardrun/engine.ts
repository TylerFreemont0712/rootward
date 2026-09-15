import {
  type Balance,
  Bolt,
  type Element,
  SHARD_RARITIES,
  type Shard,
  type ShardBattle,
  type ShardrunConfig,
  type ShardrunFoe,
} from "@rootward/content-schema";
import type { DomainError } from "../result.ts";
import { createRng, pickWeighted, randomFor } from "../rng.ts";
import type { BattleKind, BattleState, FoeState, LogEntry, MapNode, ShardrunState, SpellState } from "./types.ts";

// The rules of Shardrun (ADR-0012), as pure functions. A spell's shards run in a sandbox first; what comes back is only a
// list of candidate bolts, which these rules validate, pay for, and resolve. No number a shard computes is trusted as
// damage: power is clamped, bolts past the cap fizzle, and every bolt a shard handles costs mana.

export type ShardrunBalance = Balance["shardrun"];

/** Everything from content and config the rules read. */
export interface ShardrunCatalog {
  config: ShardrunConfig;
  shards: ReadonlyMap<string, Shard>;
  foes: ReadonlyMap<string, ShardrunFoe>;
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
  | { type: "rest" }
  | { type: "forge"; shardId: string | null }
  | { type: "abandon" };

export type StepResult = { ok: true; state: ShardrunState } | { ok: false; error: DomainError };

const ARRANGEABLE = new Set<ShardrunState["status"]>(["map", "reward", "rest", "forge"]);
const ENDED = new Set<ShardrunState["status"]>(["won", "lost", "abandoned"]);

export function startShardrun(catalog: ShardrunCatalog, seed: string, language: string): ShardrunState {
  const { config, balance } = catalog;
  return {
    version: 1,
    seed,
    language,
    status: "map",
    integrity: balance.integrity_start,
    integrityMax: balance.integrity_start,
    floors: config.floors.map((kinds, floor) => kinds.map((kind, index): MapNode => ({ id: `f${floor}-${index}`, floor, kind }))),
    path: [],
    spells: config.start.spells.map(
      (spell, index): SpellState => ({ id: `spell-${index + 1}`, name: spell.name, capacity: spell.capacity, shards: [...spell.shards] }),
    ),
    inventory: [...config.start.inventory],
    log: [{ kind: "note", text: "The Salvage opens. Shards of old code glitter in the dark." }],
    stats: { fights: 0, turns: 0, casts: 0, damage: 0, shards: 0 },
  };
}

/** Apply one command. The input state is never modified: a refused command leaves it exactly as it was. */
export function stepShardrun(state: ShardrunState, command: ShardrunCommand, catalog: ShardrunCatalog): StepResult {
  // LEARN: structuredClone deep-copies plain data, so every rule below can mutate `next` freely; if a rule refuses
  // halfway through, the half-changed copy is simply thrown away.
  const next = structuredClone(state);
  next.log = [];
  const refuse = (code: string, message: string): StepResult => ({ ok: false, error: { code, message } });
  const accept = (): StepResult => ({ ok: true, state: next });

  if (ENDED.has(next.status)) return refuse("run-over", "This run is over. Start a new one.");

  switch (command.type) {
    case "enter": {
      if (next.status !== "map") return refuse("not-on-map", "Finish the room you are in first.");
      const node = next.floors[next.path.length]?.find((candidate) => candidate.id === command.nodeId);
      if (!node) return refuse("unreachable-node", "That way is not open from here.");
      next.path.push(node.id);
      if (node.kind === "rest") {
        next.status = "rest";
        log(next, { kind: "enter", text: "A quiet alcove. The hum of the Machine is almost soothing." });
      } else if (node.kind === "forge") {
        next.status = "forge";
        log(next, { kind: "enter", text: "An abandoned forge, still warm. Shards can be reworked here." });
      } else {
        startBattle(next, node, node.kind, catalog);
      }
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
      if (next.status !== "reward" || !reward) return refuse("no-reward", "There is nothing to take.");
      if (command.shardId === null) {
        log(next, { kind: "note", text: "You leave the shards where they lie." });
      } else {
        if (!reward.choices.includes(command.shardId)) return refuse("not-offered", "That shard was not offered.");
        next.inventory.push(command.shardId);
        next.stats.shards += 1;
        log(next, { kind: "reward", text: `You salvage ${catalog.shards.get(command.shardId)?.name ?? command.shardId}.` });
      }
      delete next.reward;
      afterRoom(next);
      return accept();
    }

    case "rest": {
      if (next.status !== "rest") return refuse("not-resting", "There is nowhere to rest here.");
      const healed = Math.min(next.integrityMax - next.integrity, Math.ceil(next.integrityMax * catalog.balance.rest_heal_fraction));
      next.integrity += healed;
      log(next, { kind: "rest", amount: healed, text: `You rest and recover ${healed} Integrity.` });
      afterRoom(next);
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
      afterRoom(next);
      return accept();
    }

    case "abandon": {
      next.status = "abandoned";
      log(next, { kind: "loss", text: "You climb back out of the Salvage. The shards stay behind." });
      return accept();
    }
  }
}

/** Mana a cast costs: the base, every shard's own cost, and the work its shards did. */
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
    bolts.push({ ...parsed.data, power: Math.max(0, Math.min(balance.max_bolt_power, Math.round(parsed.data.power))) });
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
    const cost = catalog.balance.spell_base_cost;
    return { cost, affordable: !spent && cost <= battle.mana, bolts: 0, damage: 0, block: 0, misfire: outcome.reason };
  }
  const cost = spellCost(spell, outcome.work, catalog);
  const copy = structuredClone(state);
  const copyBattle = copy.battle;
  if (!copyBattle) return undefined;
  const { bolts } = normalizeBolts(outcome.bolts, catalog.balance);
  const damage = resolveBolts(copy, copyBattle, bolts, catalog.balance);
  return { cost, affordable: !spent && cost <= battle.mana, bolts: bolts.length, damage, block: copyBattle.block - battle.block };
}

// --- Battles --------------------------------------------------------------------------------------------------------

/** The foes waiting in a battle room, fixed by the run's seed so the map can show them before the room is entered. */
export function encounterFor(seed: string, node: MapNode, config: ShardrunConfig): readonly string[] {
  if (node.kind !== "fight" && node.kind !== "elite" && node.kind !== "boss") return [];
  const groups = config.encounters[node.kind];
  return groups[Math.floor(randomFor(seed, `encounter:${node.id}`, 0) * groups.length)] ?? groups[0] ?? [];
}

function startBattle(state: ShardrunState, node: MapNode, kind: BattleKind, catalog: ShardrunCatalog): void {
  const group = encounterFor(state.seed, node, catalog.config);
  const foes = group.flatMap((foeId, index): FoeState[] => {
    const def = catalog.foes.get(foeId);
    if (!def) return [];
    return [
      {
        uid: `${node.id}-${index}`,
        id: def.id,
        name: def.name,
        sprite: def.sprite,
        hp: def.hp,
        max: def.hp,
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
    afterRoom(state);
    return;
  }
  const battle: BattleState = { kind, turn: 1, mana: catalog.balance.mana_per_turn, block: 0, foes, cast: [] };
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
    if (balance.spell_base_cost > battle.mana) return { code: "not-enough-mana", message: `${spell.name} needs mana you do not have.` };
    battle.mana -= balance.spell_base_cost;
    battle.cast.push(spell.id);
    state.stats.casts += 1;
    log(state, { kind: "fizzle", spell: spell.id, text: `${spell.name} fizzles: ${outcome.reason}` });
    return undefined;
  }
  const cost = spellCost(spell, outcome.work, catalog);
  if (cost > battle.mana) {
    return { code: "not-enough-mana", message: `${spell.name} needs ${cost} mana and you have ${battle.mana}.` };
  }
  battle.mana -= cost;
  battle.cast.push(spell.id);
  state.stats.casts += 1;

  const { bolts, fizzled } = normalizeBolts(outcome.bolts, balance);
  log(state, {
    kind: "cast",
    spell: spell.id,
    amount: cost,
    text: `${spell.name}: ${bolts.length} ${bolts.length === 1 ? "bolt" : "bolts"} for ${cost} mana.`,
  });
  if (fizzled > 0) log(state, { kind: "fizzle", spell: spell.id, amount: fizzled, text: `${fizzled} ${fizzled === 1 ? "bolt" : "bolts"} fizzled.` });

  const curse = spell.shards.reduce((sum, id) => sum + (catalog.shards.get(id)?.curse?.integrity ?? 0), 0);
  if (curse > 0) {
    state.integrity = Math.max(0, state.integrity - curse);
    log(state, { kind: "curse", amount: curse, text: `Cursed code burns you for ${curse} Integrity.` });
  }

  state.stats.damage += resolveBolts(state, battle, bolts, balance);
  if (state.integrity <= 0) lose(state);
  else if (battle.foes.every((foe) => foe.hp === 0)) win(state, battle, catalog);
  return undefined;
}

/** Fire bolts in order and return the damage dealt. Logs every hit so the client can animate it. */
function resolveBolts(state: ShardrunState, battle: BattleState, bolts: readonly Bolt[], balance: ShardrunBalance): number {
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
      let multiplier = 1;
      if (foe.trait?.kind === "pattern-ward" && bolt.element !== foe.pattern) multiplier *= balance.pattern_off_multiplier;
      if (foe.weak.includes(bolt.element)) multiplier *= balance.weak_multiplier;
      else if (foe.resist.includes(bolt.element)) multiplier *= balance.resist_multiplier;
      let damage = Math.floor(power * multiplier);
      let blocked = 0;
      if (!bolt.pierce) {
        blocked = Math.min(foe.shield, damage);
        foe.shield -= blocked;
        damage -= blocked;
      }
      foe.hp = Math.max(0, foe.hp - damage);
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
  battle.mana = catalog.balance.mana_per_turn;
  battle.block = 0;
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
  if (battle.kind === "boss" || state.path.length >= state.floors.length) {
    state.status = "won";
    log(state, { kind: "victory", text: "The last guardian falls. The Salvage is yours." });
    return;
  }
  log(state, { kind: "victory", text: "The way is clear. Shards scatter across the floor." });
  const choices = draftChoices(state, battle.kind, catalog);
  if (choices.length === 0) {
    afterRoom(state);
    return;
  }
  state.reward = { choices };
  state.status = "reward";
}

function lose(state: ShardrunState): void {
  state.status = "lost";
  log(state, { kind: "loss", text: "Kernel panic. The Salvage keeps what you carried." });
}

function afterRoom(state: ShardrunState): void {
  if (state.path.length >= state.floors.length) {
    state.status = "won";
    log(state, { kind: "victory", text: "You reach the bottom of the Salvage." });
  } else {
    state.status = "map";
  }
}

/** Distinct draftable shards for a reward, rarity by the fight's weights, drawn from the run's seed. */
function draftChoices(state: ShardrunState, kind: BattleKind, catalog: ShardrunCatalog): string[] {
  const weights = catalog.config.rewards[kind];
  const rng = createRng(state.seed, `reward:${state.path.length}`);
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
