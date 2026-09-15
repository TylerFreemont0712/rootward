import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { FoeIntent, FoeTrait, Shard } from "@rootward/content-schema";
import {
  baseBolt,
  encounterFor,
  type FoeState,
  type MapNode,
  type PipelineOutcome,
  previewCast,
  type ShardrunCatalog,
  type ShardrunCommand,
  ShardrunState,
  shardBattle,
  type SpellState,
  startShardrun,
  stepShardrun,
} from "@rootward/core";
import {
  isShardrunLanguage,
  type PipelineRun,
  pipelineJob,
  readPipelineRuns,
  SHARDRUN_LANGUAGES,
  shardFunctionName,
  type ShardrunLanguage,
} from "@rootward/content-tools";
import type {
  ShardrunCommandRequest,
  ShardrunFoeView,
  ShardrunNodeView,
  ShardrunView,
  ShardView,
  SpellView,
} from "@rootward/shared";
import { z } from "zod";
import type { GameContent } from "../content.ts";
import { settle } from "../db/promise.ts";
import { ServiceError } from "../errors.ts";
import type { Sandbox } from "../sandbox.ts";

// Shardrun on the server (ADR-0012): runs are JSON snapshots in SQLite, spells run in the sandbox, and the pure rules in
// @rootward/core decide what a cast does. A spell's pipeline result is cached by its exact input, so the preview the
// player sees and the cast they then make come from the same run of the same code, even if a shard is random.

const RunRow = z.object({ id: z.string(), state: z.string() });
const ENDED = ["won", "lost", "abandoned"] as const;
/** Distinct spell inputs remembered; a battle only ever needs a handful. */
const PIPELINE_CACHE_LIMIT = 256;

export interface ShardrunDeps {
  db: DatabaseSync;
  content: GameContent;
  sandbox: Sandbox;
}

export class ShardrunService {
  private readonly db: DatabaseSync;
  private readonly sandbox: Sandbox;
  private readonly catalog: ShardrunCatalog | undefined;
  private readonly pipelines = new Map<string, Promise<PipelineRun>>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(deps: ShardrunDeps) {
    this.db = deps.db;
    this.sandbox = deps.sandbox;
    const { index, balance } = deps.content;
    const run = index.shardrun;
    this.catalog = run && {
      config: run.value,
      shards: new Map([...index.shards].map(([id, shard]) => [id, shard.value])),
      foes: new Map([...index.shardrunFoes].map(([id, foe]) => [id, foe.value])),
      balance: balance.shardrun,
    };
  }

  /** Languages a new run can be played in: the Shardrun languages this machine has a sandbox for. */
  async languages(): Promise<string[]> {
    const usable = await Promise.all(SHARDRUN_LANGUAGES.map(async (language) => ((await this.sandbox.canRun(language)) ? [language] : [])));
    return usable.flat();
  }

  /** The profile's latest run, finished or not; null before their first. */
  async latest(profileId: string): Promise<ShardrunView | null> {
    this.requireProfile(profileId);
    const row = await settle(() => this.db.prepare("SELECT id, state FROM shardrun_runs WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(profileId));
    if (row === undefined) return null;
    const { id, state } = RunRow.parse(row);
    return this.view(id, parseState(state));
  }

  async start(profileId: string, language: string): Promise<ShardrunView> {
    return this.serialize(profileId, async () => {
      const catalog = this.requireCatalog();
      this.requireProfile(profileId);
      if (!isShardrunLanguage(language) || !(await this.sandbox.canRun(language))) {
        throw new ServiceError(400, "unsupported-language", `Shardrun cannot be played in ${language} on this machine.`);
      }
      if (this.activeRow(profileId)) {
        throw new ServiceError(409, "run-in-progress", "A run is already underway. Finish or abandon it first.");
      }
      const id = randomUUID();
      const state = startShardrun(catalog, randomUUID(), language);
      const now = new Date().toISOString();
      this.db
        .prepare("INSERT INTO shardrun_runs (id, profile_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, profileId, state.status, JSON.stringify(state), now, now);
      return this.view(id, state);
    });
  }

  async command(profileId: string, request: ShardrunCommandRequest): Promise<ShardrunView> {
    return this.serialize(profileId, async () => {
      const catalog = this.requireCatalog();
      this.requireProfile(profileId);
      const row = this.activeRow(profileId);
      if (!row) throw new ServiceError(404, "no-run", "There is no run underway.");
      const state = parseState(row.state);

      let command: ShardrunCommand;
      if (request.type === "cast") {
        const spell = state.spells.find((candidate) => candidate.id === request.spellId);
        // Without a battle or the spell, the rules refuse before they look at the outcome, so nothing needs to run.
        const outcome: PipelineOutcome = spell && state.battle ? toOutcome(await this.pipeline(state, spell)) : { ok: false, reason: "" };
        command = { type: "cast", spellId: request.spellId, outcome };
      } else {
        command = request;
      }
      const result = stepShardrun(state, command, catalog);
      if (!result.ok) throw new ServiceError(409, result.error.code, result.error.message);
      this.db
        .prepare("UPDATE shardrun_runs SET status = ?, state = ?, updated_at = ? WHERE id = ?")
        .run(result.state.status, JSON.stringify(result.state), new Date().toISOString(), row.id);
      return this.view(row.id, result.state);
    });
  }

  // --- Views ------------------------------------------------------------------------------------------------------

  private async view(id: string, state: ShardrunState): Promise<ShardrunView> {
    const catalog = this.requireCatalog();
    const language = isShardrunLanguage(state.language) ? state.language : "python";
    const battle = state.battle;

    const mentioned = new Set([...state.spells.flatMap((spell) => spell.shards), ...state.inventory, ...(state.reward?.choices ?? [])]);
    for (const shardId of [...mentioned]) {
      const into = catalog.shards.get(shardId)?.forge?.into;
      if (into !== undefined) mentioned.add(into);
    }
    const shards: Record<string, ShardView> = {};
    for (const shardId of mentioned) {
      const shard = catalog.shards.get(shardId);
      if (shard) shards[shardId] = shardView(shard, language, catalog);
    }

    const spells = await Promise.all(
      state.spells.map(async (spell): Promise<SpellView> => {
        const view: SpellView = { id: spell.id, name: spell.name, capacity: spell.capacity, shards: [...spell.shards], spent: battle?.cast.includes(spell.id) ?? false };
        if (state.status !== "battle" || !battle) return view;
        const run = await this.pipeline(state, spell);
        const preview = previewCast(state, spell.id, toOutcome(run), catalog);
        if (!preview) return view;
        return {
          ...view,
          preview: {
            ...preview,
            trace: run.ok ? run.trace : [],
            console: run.console,
          },
        };
      }),
    );

    const floors = state.floors.map((nodes) => nodes.map((node) => this.nodeView(state, node)));
    const owned = [...new Set([...state.spells.flatMap((spell) => spell.shards), ...state.inventory])];
    const balance = catalog.balance;
    return {
      id,
      status: state.status,
      language: state.language,
      integrity: state.integrity,
      integrityMax: state.integrityMax,
      floors,
      spells,
      inventory: [...state.inventory],
      shards,
      ...(battle
        ? {
            battle: {
              kind: battle.kind,
              turn: battle.turn,
              mana: battle.mana,
              manaMax: balance.mana_per_turn,
              block: battle.block,
              foes: battle.foes.map(foeView),
            },
          }
        : {}),
      ...(state.reward ? { reward: { choices: [...state.reward.choices] } } : {}),
      forgeable: state.status === "forge" ? owned.filter((shardId) => catalog.shards.get(shardId)?.forge !== undefined) : [],
      ...(state.status === "rest"
        ? { restHeal: Math.min(state.integrityMax - state.integrity, Math.ceil(state.integrityMax * balance.rest_heal_fraction)) }
        : {}),
      log: state.log.map((entry) => ({ ...entry })),
      stats: { ...state.stats },
      rules: {
        spellBaseCost: balance.spell_base_cost,
        workPerMana: balance.work_per_mana,
        maxBolts: balance.max_bolts,
        baseBoltPower: balance.base_bolt_power,
      },
    };
  }

  private nodeView(state: ShardrunState, node: MapNode): ShardrunNodeView {
    const catalog = this.requireCatalog();
    const taken = state.path[node.floor];
    const nodeState: ShardrunNodeView["state"] =
      taken === node.id
        ? "visited"
        : taken !== undefined
          ? "passed"
          : node.floor === state.path.length && state.status === "map"
            ? "open"
            : "ahead";
    const foes = encounterFor(state.seed, node, catalog.config).flatMap((foeId) => {
      const foe = catalog.foes.get(foeId);
      return foe ? [{ name: foe.name, sprite: foe.sprite }] : [];
    });
    return { id: node.id, floor: node.floor, kind: node.kind, state: nodeState, foes };
  }

  // --- Running spells ---------------------------------------------------------------------------------------------

  /** Run a spell's shards against the current battle, or reuse the run for this exact input. */
  private pipeline(state: ShardrunState, spell: SpellState): Promise<PipelineRun> {
    const catalog = this.requireCatalog();
    const battle = state.battle;
    if (!battle) return Promise.resolve({ ok: false, reason: "there is no battle", console: "" });
    const input = { bolts: [baseBolt(catalog.balance)], battle: shardBattle(state, battle), limit: catalog.balance.max_pipeline_bolts };
    if (spell.shards.length === 0) {
      return Promise.resolve({ ok: true, bolts: [...input.bolts], trace: [], work: 0, console: "" });
    }
    const key = JSON.stringify([state.language, spell.shards, input]);
    const cached = this.pipelines.get(key);
    if (cached) return cached;

    const shards: Shard[] = [];
    for (const shardId of spell.shards) {
      const shard = catalog.shards.get(shardId);
      if (!shard) return Promise.resolve({ ok: false, reason: `the shard ${shardId} no longer exists`, console: "" });
      shards.push(shard);
    }
    const language = isShardrunLanguage(state.language) ? state.language : "python";
    const job = pipelineJob(language, shards, [input], this.sandbox.limits);
    if (!job) return Promise.resolve({ ok: false, reason: `a shard has no ${language} code`, console: "" });

    const run = this.sandbox.runJob(job).then((result) => readPipelineRuns(result, 1)[0] ?? { ok: false as const, reason: "the spell produced nothing", console: "" });
    this.pipelines.set(key, run);
    // A failure may be the machine's fault (a busy sandbox timing out), so only successful runs stay cached.
    run.then(
      (outcome) => {
        if (!outcome.ok) this.pipelines.delete(key);
      },
      () => this.pipelines.delete(key),
    );
    // LEARN: a Map iterates in insertion order, so its first key is the oldest entry: a tiny first-in, first-out cache.
    if (this.pipelines.size > PIPELINE_CACHE_LIMIT) {
      const oldest = this.pipelines.keys().next().value;
      if (oldest !== undefined) this.pipelines.delete(oldest);
    }
    return run;
  }

  // --- Helpers ----------------------------------------------------------------------------------------------------

  /**
   * Run one profile's commands one at a time. A cast waits on the sandbox between reading the run and saving it, and
   * without this, two quick clicks could both read the same state and the second save would undo the first.
   */
  private serialize<T>(profileId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(profileId) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(profileId, settled);
    void settled.then(() => {
      if (this.queues.get(profileId) === settled) this.queues.delete(profileId);
    });
    return next;
  }

  private activeRow(profileId: string): z.infer<typeof RunRow> | undefined {
    const placeholders = ENDED.map(() => "?").join(", ");
    const row = this.db
      .prepare(`SELECT id, state FROM shardrun_runs WHERE profile_id = ? AND status NOT IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`)
      .get(profileId, ...ENDED);
    return row === undefined ? undefined : RunRow.parse(row);
  }

  private requireProfile(profileId: string): void {
    if (this.db.prepare("SELECT 1 FROM profiles WHERE id = ?").get(profileId) === undefined) {
      throw new ServiceError(404, "profile-not-found", "There is no such character.");
    }
  }

  private requireCatalog(): ShardrunCatalog {
    if (!this.catalog) throw new ServiceError(404, "shardrun-unavailable", "No content pack defines Shardrun.");
    return this.catalog;
  }
}

function parseState(json: string): ShardrunState {
  return ShardrunState.parse(JSON.parse(json));
}

function toOutcome(run: PipelineRun): PipelineOutcome {
  return run.ok ? { ok: true, bolts: run.bolts, work: run.work } : { ok: false, reason: run.reason };
}

function shardView(shard: Shard, language: ShardrunLanguage, catalog: ShardrunCatalog): ShardView {
  const into = shard.forge && catalog.shards.get(shard.forge.into);
  return {
    id: shard.id,
    name: shard.name,
    rarity: shard.rarity,
    cost: shard.cost,
    summary: shard.summary,
    function: shardFunctionName(shard, language),
    code: shard.code[language] ?? "",
    tags: [...shard.tags],
    ...(shard.curse ? { curse: shard.curse.integrity } : {}),
    ...(shard.forge && into ? { forge: { into: into.id, intoName: into.name, verb: shard.forge.verb } } : {}),
  };
}

function foeView(foe: FoeState): ShardrunFoeView {
  const intent = foe.intents[foe.intentIndex % foe.intents.length];
  return {
    uid: foe.uid,
    name: foe.name,
    sprite: foe.sprite,
    hp: foe.hp,
    max: foe.max,
    shield: foe.shield,
    weak: [...foe.weak],
    resist: [...foe.resist],
    ...(foe.trait ? { trait: traitView(foe.trait) } : {}),
    ...(foe.pattern ? { pattern: foe.pattern } : {}),
    intent: intent ? { kind: intent.kind, text: intentText(intent, foe.stoked) } : { kind: "strike", text: "Watching" },
    stoked: foe.stoked,
    flavor: foe.flavor,
  };
}

function intentText(intent: FoeIntent, stoked: boolean): string {
  switch (intent.kind) {
    case "strike":
      return `Strike for ${intent.power * (stoked ? 2 : 1)}`;
    case "multi":
      return `Strike ${intent.times} times for ${intent.power}`;
    case "shield":
      return `Shield ${intent.amount}`;
    case "stoke":
      return "Stoke: its next strike doubles";
    case "heal":
      return `Heal ${intent.amount}`;
  }
}

function traitView(trait: FoeTrait): { kind: string; name: string; text: string } {
  switch (trait.kind) {
    case "nullify-first":
      return { kind: trait.kind, name: "Nullify", text: "The first bolt that hits it each turn does nothing." };
    case "thick-hide":
      return { kind: trait.kind, name: "Thick hide", text: `Bolts under ${trait.threshold} power glance off.` };
    case "shifting-weakness":
      return { kind: trait.kind, name: "Shifting", text: `Its weakness moves each turn: ${trait.cycle.join(", then ")}.` };
    case "pattern-ward":
      return { kind: trait.kind, name: "Pattern ward", text: `Only this turn's element in ${trait.pattern.join(", ")} hits at full strength.` };
  }
}
