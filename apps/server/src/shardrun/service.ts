import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  type Balance,
  Bolt,
  type FoeIntent,
  type FoeTrait,
  RELIC_RARITIES,
  type Relic,
  type RelicEffect,
  SHARD_RARITIES,
  type Shard,
  type WorkCurve,
} from "@rootward/content-schema";

import {
  baseBolt,
  bindableSpell,
  boltCap,
  difficultyOf,
  encounterFor,
  type FoeState,
  layerOf,
  manaPerTurn,
  nextRooms,
  type PipelineOutcome,
  previewBolts,
  previewCast,
  relicModifiers,
  type ShardrunCatalog,
  type ShardrunCommand,
  ShardrunState,
  shardBattle,
  type SpellState,
  startShardrun,
  stepShardrun,
  workUnits,
  type WorkStep,
} from "@rootward/core";
import type { ContentIndex } from "@rootward/content-tools";
import {
  isShardrunLanguage,
  type PipelineInput,
  type PipelineRun,
  readSpellRuns,
  SHARDRUN_LANGUAGES,
  shardFunctionName,
  type ShardrunLanguage,
  spellsJob,
  stoppedEarly,
} from "@rootward/content-tools";
import type {
  BoltView,
  CodexFoeView,
  ShardrunDevRequest,
  RelicView,
  ShardrunCommandRequest,
  ShardrunDifficultyView,
  ShardrunFoeView,
  ShardrunMapNodeView,
  ShardrunCodexResponse,
  ShardrunModifierView,
  ShardrunPreviewsResponse,
  ShardrunRulesView,
  ShardrunView,
  ShardView,
  SpellRunView,
  SpellView,
  Translate,
} from "@rootward/shared";
import { z } from "zod";
import type { GameContent } from "../content.ts";
import { type MessageKey, t } from "../i18n/index.ts";
import { settle } from "../db/promise.ts";
import { ServiceError } from "../errors.ts";
import type { Sandbox } from "../sandbox.ts";

// Shardrun on the server (ADR-0012, ADR-0013): runs are JSON snapshots in SQLite, spells run in the sandbox, and the
// pure rules in @rootward/core decide what a cast does. Every spell of a turn runs in one sandbox job, and each result
// is cached by its exact input, so the preview a player reads and the cast they make come from the same run of the
// same code, even if a shard is random. A command answers without waiting for the next previews; they run afterwards.

const RunRow = z.object({ id: z.string(), state: z.string() });
const ENDED = ["won", "lost", "abandoned"] as const;
/** Finished spell runs remembered; a battle only ever needs a handful at a time. */
const RUN_CACHE_LIMIT = 256;
const NO_RESULT: PipelineRun = { ok: false, reason: "the spell produced nothing", trace: [], console: "" };

export interface ShardrunDeps {
  db: DatabaseSync;
  content: GameContent;
  sandbox: Sandbox;
  /** Whether dev tooling is allowed on this server (ROOTWARD_DEV). Sandbox runs and dev commands need it. */
  dev?: boolean;
  /** Where a failure of previews warmed in the background is reported. Defaults to the console. */
  onBackgroundError?: (error: unknown) => void;
}

interface LoadedRun {
  id: string;
  state: ShardrunState;
}

export class ShardrunService {
  private readonly db: DatabaseSync;
  private readonly sandbox: Sandbox;
  private readonly content: GameContent;
  private readonly catalog: ShardrunCatalog | undefined;
  /**
   * One catalog per locale, keyed by the index it was built from (ADR-0018). Each locale's index is built once at
   * startup and never replaced, so keying on the object itself is a per-locale cache that needs no locale strings —
   * and a WeakMap, so nothing is held alive that the content loader has let go of.
   */
  private readonly localizedCatalogs = new WeakMap<ContentIndex, ShardrunCatalog>();
  private readonly devEnabledFlag: boolean;
  private readonly onBackgroundError: (error: unknown) => void;
  /** Finished spell runs, by exact input. */
  private readonly runs = new Map<string, PipelineRun>();
  /** Spell runs still in the sandbox, by exact input. */
  private readonly inFlight = new Map<string, Promise<PipelineRun>>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(deps: ShardrunDeps) {
    this.db = deps.db;
    this.sandbox = deps.sandbox;
    this.content = deps.content;
    this.devEnabledFlag = deps.dev ?? false;
    this.onBackgroundError =
      deps.onBackgroundError ??
      ((error: unknown) => {
        console.error("Shardrun previews failed in the background:", error);
      });
    // The engine always runs on English content (ADR-0018). Foe names reach shard code through `battle`, and the
    // engine writes its log into the saved run, so a localized catalog here would make the rules and the save file
    // depend on the reader's language. Translation belongs to the views below, never to the rules.
    //
    // Services are built at startup, outside any request, so `content.index` is English here by construction.
    this.catalog = buildCatalog(deps.content.index, deps.content.balance);
  }

  /**
   * The catalog to *show*, in the language of the request being served. Identical to `this.catalog` except that every
   * name, summary and flavor is the reader's.
   */
  private viewCatalog(): ShardrunCatalog {
    const index = this.content.index;
    const cached = this.localizedCatalogs.get(index);
    if (cached) return cached;
    const built = buildCatalog(index, this.content.balance);
    if (!built) return this.requireCatalog();
    this.localizedCatalogs.set(index, built);
    return built;
  }

  /** Languages a new run can be played in: the Shardrun languages this machine has a sandbox for. */
  async languages(): Promise<string[]> {
    const usable = await Promise.all(
      SHARDRUN_LANGUAGES.map(async (language) => ((await this.sandbox.canRun(language)) ? [language] : [])),
    );
    return usable.flat();
  }

  /** Whether this server allows sandbox runs at all. */
  devEnabled(): boolean {
    return this.devEnabledFlag;
  }

  difficulties(): ShardrunDifficultyView[] {
    return (this.catalog ? this.viewCatalog().config.difficulties : []).map((difficulty) => ({
      id: difficulty.id,
      name: difficulty.name,
      summary: difficulty.summary,
    }));
  }

  /** The profile's latest run, finished or not; null before their first. */
  async latest(profileId: string): Promise<ShardrunView | null> {
    this.requireProfile(profileId);
    const row = await settle(() =>
      this.db
        .prepare(
          "SELECT id, state FROM shardrun_runs WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        )
        .get(profileId),
    );
    if (row === undefined) return null;
    const loaded = this.load(RunRow.parse(row));
    return loaded ? this.view(loaded) : null;
  }

  async start(
    profileId: string,
    language: string,
    difficulty: string,
    sandbox = false,
  ): Promise<ShardrunView> {
    return this.serialize(profileId, async () => {
      const catalog = this.requireCatalog();
      this.requireProfile(profileId);
      if (!isShardrunLanguage(language) || !(await this.sandbox.canRun(language))) {
        throw new ServiceError(
          400,
          "unsupported-language",
          `Shardrun cannot be played in ${language} on this machine.`,
        );
      }
      if (!catalog.config.difficulties.some((candidate) => candidate.id === difficulty)) {
        throw new ServiceError(400, "unknown-difficulty", `There is no ${difficulty} difficulty.`);
      }
      if (sandbox && !this.devEnabledFlag) {
        throw new ServiceError(
          403,
          "dev-disabled",
          "Sandbox runs need a server started with ROOTWARD_DEV=1.",
        );
      }
      if (this.active(profileId)) {
        throw new ServiceError(
          409,
          "run-in-progress",
          "A run is already underway. Finish or abandon it first.",
        );
      }
      const id = randomUUID();
      const state = startShardrun(catalog, { seed: randomUUID(), language, difficulty, sandbox });
      const now = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO shardrun_runs (id, profile_id, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(id, profileId, state.status, JSON.stringify(state), now, now);
      return this.view({ id, state });
    });
  }

  async command(profileId: string, request: ShardrunCommandRequest): Promise<ShardrunView> {
    return this.serialize(profileId, async () => {
      const catalog = this.requireCatalog();
      this.requireProfile(profileId);
      const run = this.active(profileId);
      if (!run) throw new ServiceError(404, "no-run", "There is no run underway.");
      const before = run.state;

      let command: ShardrunCommand;
      let cast: { spell: SpellState; run: PipelineRun } | undefined;
      if (request.type === "cast") {
        const spell = before.spells.find((candidate) => candidate.id === request.spellId);
        if (spell && before.battle && !before.battle.cast.includes(spell.id)) {
          const spellRun = (await this.spellRuns(before, [spell])).get(spell.id) ?? NO_RESULT;
          command = { type: "cast", spellId: spell.id, outcome: toOutcome(spellRun) };
          cast = { spell, run: spellRun };
        } else {
          // The rules refuse this cast before they look at the outcome, so nothing needs to run.
          command = { type: "cast", spellId: request.spellId, outcome: { ok: false, reason: "" } };
        }
      } else {
        command = request;
      }
      const result = stepShardrun(before, command, catalog);
      if (!result.ok) throw new ServiceError(409, result.error.code, result.error.message);
      this.db
        .prepare("UPDATE shardrun_runs SET status = ?, state = ?, updated_at = ? WHERE id = ?")
        .run(result.state.status, JSON.stringify(result.state), new Date().toISOString(), run.id);

      if (result.state.battle) this.warm(result.state);
      const replay = cast && {
        spellId: cast.spell.id,
        run: this.spellRunView(before, cast.spell, cast.run, true),
      };
      return this.view({ id: run.id, state: result.state }, replay);
    });
  }

  /** A dev command: only on a sandbox run, and only when this server allows dev tooling. */
  async dev(profileId: string, request: ShardrunDevRequest): Promise<ShardrunView> {
    return this.serialize(profileId, () => {
      const catalog = this.requireCatalog();
      this.requireProfile(profileId);
      if (!this.devEnabledFlag)
        throw new ServiceError(403, "dev-disabled", "This server was not started with ROOTWARD_DEV=1.");
      const run = this.active(profileId);
      if (!run) throw new ServiceError(404, "no-run", "There is no run underway.");
      if (!run.state.sandbox)
        throw new ServiceError(409, "not-a-sandbox", "Dev tools only work in a sandbox run.");
      const result = stepShardrun(run.state, devToCommand(request), catalog);
      if (!result.ok) throw new ServiceError(409, result.error.code, result.error.message);
      this.db
        .prepare("UPDATE shardrun_runs SET status = ?, state = ?, updated_at = ? WHERE id = ?")
        .run(result.state.status, JSON.stringify(result.state), new Date().toISOString(), run.id);
      if (result.state.battle) this.warm(result.state);
      return Promise.resolve(this.view({ id: run.id, state: result.state }));
    });
  }

  /** Spell previews for the active battle, waiting for any still running. */
  async previews(profileId: string): Promise<ShardrunPreviewsResponse> {
    const catalog = this.requireCatalog();
    this.requireProfile(profileId);
    const run = this.active(profileId);
    if (!run?.state.battle) return { revision: run?.state.revision ?? 0, spells: {} };
    const { state } = run;
    const reveal = difficultyOf(catalog, state.difficulty).show_predictions;
    const runs = await this.spellRuns(state, state.spells);
    return {
      revision: state.revision,
      spells: Object.fromEntries(
        state.spells.map((spell) => [
          spell.id,
          this.spellRunView(state, spell, runs.get(spell.id) ?? NO_RESULT, reveal),
        ]),
      ),
    };
  }

  /** Everything Shardrun content holds, for the Codex: shards, relics, foes, layers, and the rules they play by. */
  codex(language: string): ShardrunCodexResponse {
    const catalog = this.viewCatalog();
    const say = t();
    const lang = isShardrunLanguage(language) ? language : "python";
    const { config } = catalog;

    // Where each shard comes from: the rarities each kind of fight can offer, the forge, and the starting loadout.
    const sources = new Map<string, string[]>([...catalog.shards.keys()].map((id) => [id, []]));
    const fightLabels = { fight: "found.fights", elite: "found.elites", boss: "found.guardians" } as const;
    for (const shard of catalog.shards.values()) {
      if (!shard.draftable) continue;
      for (const kind of ["fight", "elite", "boss"] as const) {
        if (config.rewards.shards[kind][shard.rarity] > 0) sources.get(shard.id)?.push(say(fightLabels[kind]));
      }
    }
    for (const shard of catalog.shards.values()) {
      if (!shard.forge) continue;
      const key = shard.forge.verb === "repair" ? "found.forge.repair" : "found.forge.upgrade";
      sources.get(shard.forge.into)?.push(say(key, { shard: shard.name }));
    }
    for (const spell of config.start.spells) {
      for (const id of spell.shards) sources.get(id)?.push(say("found.startingSpell", { spell: spell.name }));
    }
    for (const id of config.start.inventory) sources.get(id)?.push(say("found.startingSpares"));

    const shards = [...catalog.shards.values()]
      .sort(
        (a, b) =>
          SHARD_RARITIES.indexOf(a.rarity) - SHARD_RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name),
      )
      .map((shard) => ({
        shard: shardView(shard, lang, catalog, true),
        draftable: shard.draftable,
        found: sources.get(shard.id) ?? [],
      }));

    const relicLabels = { elite: "found.elites", treasure: "found.treasure", boss: "found.guardians" } as const;
    const relics = [...catalog.relics.values()]
      .sort(
        (a, b) =>
          RELIC_RARITIES.indexOf(a.rarity) - RELIC_RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name),
      )
      .map((relic) => ({
        relic: relicView(relic),
        found: (["elite", "treasure", "boss"] as const).flatMap((where) =>
          config.rewards.relics[where][relic.rarity] > 0 ? [say(relicLabels[where])] : [],
        ),
      }));

    const foes: CodexFoeView[] = [...catalog.foes.values()]
      .map((foe) => ({
        id: foe.id,
        name: foe.name,
        sprite: foe.sprite,
        hp: foe.hp,
        weak: [...foe.weak],
        resist: [...foe.resist],
        ...(foe.trait ? { trait: traitView(foe.trait, say) } : {}),
        intents: foe.intents.map((intent) => ({ kind: intent.kind, text: intentText(intent, false, say) })),
        flavor: foe.flavor,
        layers: config.layers.flatMap((layer) =>
          (["fight", "elite", "boss"] as const).flatMap((role) =>
            layer.encounters[role].some((group) => group.includes(foe.id))
              ? [{ id: layer.id, name: layer.name, role }]
              : [],
          ),
        ),
      }))
      .sort((a, b) => a.hp - b.hp);

    const layers = config.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      flavor: layer.flavor,
      backdrop: layer.backdrop,
      rows: layer.rows,
      bosses: [...new Set(layer.encounters.boss.flat())].map((id) => catalog.foes.get(id)?.name ?? id),
    }));

    return { language: lang, shards, relics, foes, layers, rules: rulesView(catalog) };
  }

  // --- Views ------------------------------------------------------------------------------------------------------

  private view({ id, state }: LoadedRun, replay?: ShardrunView["replay"]): ShardrunView {
    // Views read the reader's catalog; the rules that produced this state read English (see the constructor).
    const catalog = this.viewCatalog();
    const say = t();
    const language = runLanguage(state);
    const difficulty = difficultyOf(catalog, state.difficulty);
    const layer = layerOf(state, catalog);
    const battle = state.battle;
    const reward = state.reward;
    const bind = bindableSpell(state, catalog);

    const mentioned = new Set([
      ...state.spells.flatMap((spell) => spell.shards),
      ...state.inventory,
      ...(reward?.shards ?? []),
    ]);
    for (const shardId of [...mentioned]) {
      const into = catalog.shards.get(shardId)?.forge?.into;
      if (into !== undefined) mentioned.add(into);
    }
    const shards: Record<string, ShardView> = {};
    for (const shardId of mentioned) {
      const shard = catalog.shards.get(shardId);
      if (shard) shards[shardId] = shardView(shard, language, catalog, difficulty.show_summaries);
    }
    const relicInfo: Record<string, RelicView> = {};
    for (const relicId of [...state.relics, ...(reward?.relics ?? [])]) {
      const relic = catalog.relics.get(relicId);
      if (relic) relicInfo[relicId] = relicView(relic);
    }

    const spells = state.spells.map((spell): SpellView => {
      const view: SpellView = {
        id: spell.id,
        name: spell.name,
        capacity: spell.capacity,
        shards: [...spell.shards],
        spent: battle?.cast.includes(spell.id) ?? false,
      };
      if (!battle) return view;
      const run = this.finishedRun(state, spell);
      if (!run) return view;
      return { ...view, preview: this.spellRunView(state, spell, run, difficulty.show_predictions) };
    });

    const open = new Set(
      state.status === "map" ? nextRooms(state.map, state.position).map((node) => node.id) : [],
    );
    const currentRow = state.map.nodes.find((node) => node.id === state.position)?.row ?? -1;
    const nodes = state.map.nodes.map((node): ShardrunMapNodeView => {
      const nodeState: ShardrunMapNodeView["state"] =
        node.id === state.position
          ? "current"
          : state.visited.includes(node.id)
            ? "visited"
            : open.has(node.id)
              ? "open"
              : node.row <= currentRow
                ? "passed"
                : "ahead";
      const foes = encounterFor(state.seed, node, layer).flatMap((foeId) => {
        const foe = catalog.foes.get(foeId);
        return foe ? [{ name: foe.name, sprite: foe.sprite }] : [];
      });
      return { id: node.id, row: node.row, col: node.col, kind: node.kind, state: nodeState, foes };
    });

    const { balance } = catalog;
    const owned = [...new Set([...state.spells.flatMap((spell) => spell.shards), ...state.inventory])];
    return {
      id,
      status: state.status,
      language: state.language,
      difficulty: {
        id: difficulty.id,
        name: difficulty.name,
        showSummaries: difficulty.show_summaries,
        showPredictions: difficulty.show_predictions,
      },
      revision: state.revision,
      integrity: state.integrity,
      integrityMax: state.integrityMax,
      layer: {
        index: state.layer,
        count: catalog.config.layers.length,
        id: layer.id,
        name: layer.name,
        flavor: layer.flavor,
        backdrop: layer.backdrop,
      },
      map: { nodes, edges: state.map.edges.map(([from, to]): [string, string] => [from, to]) },
      spells,
      inventory: [...state.inventory],
      relics: [...state.relics],
      shards,
      relicInfo,
      ...(battle
        ? {
            battle: {
              kind: battle.kind,
              turn: battle.turn,
              mana: battle.mana,
              manaMax: manaPerTurn(state, catalog),
              block: battle.block,
              foes: battle.foes.map((foe) => foeView(foe, catalog, say)),
            },
          }
        : {}),
      previews: battle && spells.some((spell) => spell.preview === undefined) ? "pending" : "ready",
      ...(reward
        ? {
            reward: {
              ...(reward.shards ? { shards: [...reward.shards] } : {}),
              ...(reward.relics ? { relics: [...reward.relics] } : {}),
              ...(reward.spell ? { spell: { ...reward.spell } } : {}),
            },
          }
        : {}),
      ...(state.status === "forge"
        ? {
            forge: {
              shards: owned.filter((shardId) => catalog.shards.get(shardId)?.forge !== undefined),
              spells: state.spells
                .filter((spell) => spell.capacity < balance.max_spell_capacity)
                .map((spell) => spell.id),
              ...(bind ? { bind } : {}),
            },
          }
        : {}),
      ...(state.status === "rest"
        ? {
            restHeal: Math.min(
              state.integrityMax - state.integrity,
              Math.ceil(state.integrityMax * balance.rest_heal_fraction),
            ),
          }
        : {}),
      ...(replay ? { replay } : {}),
      sandbox: state.sandbox,
      log: state.log.map((entry) => ({ ...entry })),
      stats: { ...state.stats, damageBySpell: { ...state.stats.damageBySpell } },
      rules: rulesView(catalog),
      modifiers: modifierViews(state, catalog, say),
    };
  }

  /**
   * A spell run for the client. With `reveal`, every step says what its bolts would do if the spell ended there, using
   * the rules' own resolution against this battle; without it, only the cost and any error are shown.
   */
  private spellRunView(
    state: ShardrunState,
    spell: SpellState,
    run: PipelineRun,
    reveal: boolean,
  ): SpellRunView {
    const catalog = this.requireCatalog();
    const base = baseBolt(catalog.balance);
    const preview = previewCast(state, spell.id, toOutcome(run), catalog);
    const view: SpellRunView = {
      cost: preview?.cost ?? 0,
      affordable: preview?.affordable ?? false,
      base: { bolts: [base] },
      steps: [],
      console: run.console,
    };
    if (!run.ok) {
      view.misfire = {
        reason: run.reason,
        ...(run.shard === undefined ? {} : { shard: run.shard }),
        ...(run.line === undefined ? {} : { line: run.line }),
      };
    }
    if (!reveal) return view;
    view.base = { bolts: [base], outcome: previewBolts(state, [base], catalog) };
    view.steps = run.trace.map((step) => ({
      shard: step.shard,
      given: step.given,
      returned: step.returned,
      work: workUnits(catalog.shards.get(step.shard)?.complexity ?? "linear", step.given),
      bolts: displayBolts(step.bolts),
      outcome: previewBolts(state, step.bolts, catalog),
    }));
    if (run.ok && preview)
      view.result = {
        bolts: preview.bolts,
        damage: preview.damage,
        potential: preview.potential,
        block: preview.block,
      };
    return view;
  }

  // --- Running spells ---------------------------------------------------------------------------------------------

  /** Start previews for a battle state without waiting; a failure is reported, and the previews route retries. */
  private warm(state: ShardrunState): void {
    this.spellRuns(state, state.spells).catch(this.onBackgroundError);
  }

  /** A finished run for this spell in this state, if the cache has one. */
  private finishedRun(state: ShardrunState, spell: SpellState): PipelineRun | undefined {
    const input = this.inputFor(state);
    if (!input) return undefined;
    if (spell.shards.length === 0) return emptyRun(input);
    return this.runs.get(runKey(state, spell, input));
  }

  /** Runs for these spells against the current battle: cached ones at once, running ones awaited, the rest in one job. */
  private async spellRuns(
    state: ShardrunState,
    spells: readonly SpellState[],
  ): Promise<Map<string, PipelineRun>> {
    const input = this.inputFor(state);
    const results = new Map<string, PipelineRun>();
    if (!input) return results;
    const waiting: Promise<void>[] = [];
    const missing: SpellState[] = [];
    for (const spell of spells) {
      if (spell.shards.length === 0) {
        results.set(spell.id, emptyRun(input));
        continue;
      }
      const key = runKey(state, spell, input);
      const done = this.runs.get(key);
      const flying = this.inFlight.get(key);
      if (done) results.set(spell.id, done);
      else if (flying) {
        waiting.push(
          flying.then((run) => {
            results.set(spell.id, run);
          }),
        );
      } else missing.push(spell);
    }
    if (missing.length > 0) {
      const batch = this.runBatch(runLanguage(state), missing, input);
      for (const spell of missing) {
        const key = runKey(state, spell, input);
        const promise = batch.then((runs) => runs.get(spell.id) ?? NO_RESULT);
        this.inFlight.set(key, promise);
        waiting.push(
          promise
            .then((run) => {
              this.remember(key, run);
              results.set(spell.id, run);
            })
            .finally(() => {
              if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
            }),
        );
      }
    }
    await Promise.all(waiting);
    return results;
  }

  /** Run spells together in one sandbox job. If the job stops early, each spell runs alone to find the one to blame. */
  private async runBatch(
    language: ShardrunLanguage,
    spells: readonly SpellState[],
    input: PipelineInput,
  ): Promise<Map<string, PipelineRun>> {
    const catalog = this.requireCatalog();
    const runs = new Map<string, PipelineRun>();
    const programs: { id: string; shards: Shard[] }[] = [];
    for (const spell of spells) {
      const shards = spell.shards.flatMap((shardId) => catalog.shards.get(shardId) ?? []);
      if (shards.length !== spell.shards.length)
        runs.set(spell.id, {
          ok: false,
          reason: "one of its shards no longer exists",
          trace: [],
          console: "",
        });
      else programs.push({ id: spell.id, shards });
    }
    if (programs.length === 0) return runs;
    const job = spellsJob(language, [{ spells: programs, input }], this.sandbox.limits);
    if (!job) {
      for (const program of programs)
        runs.set(program.id, {
          ok: false,
          reason: `a shard has no ${language} code`,
          trace: [],
          console: "",
        });
      return runs;
    }
    const result = await this.sandbox.runJob(job);
    if (stoppedEarly(result, 0) && programs.length > 1) {
      // LEARN: one endless loop stops the whole job, and the spells after it never report. Running each spell alone
      // costs more, but only in that rare case, and it pins the timeout on the spell that caused it.
      const alone = await Promise.all(
        programs.map((program) =>
          this.runBatch(
            language,
            spells.filter((spell) => spell.id === program.id),
            input,
          ),
        ),
      );
      for (const map of alone) for (const [spellId, run] of map) runs.set(spellId, run);
      return runs;
    }
    for (const [spellId, run] of readSpellRuns(
      result,
      0,
      programs.map((program) => program.id),
    ))
      runs.set(spellId, run);
    return runs;
  }

  private remember(key: string, run: PipelineRun): void {
    // A timeout or a sandbox failure may be the machine's fault rather than the code's, so only runs whose outcome the
    // code decided (it finished, or one of its shards raised) are kept.
    if (!run.ok && run.shard === undefined) return;
    this.runs.set(key, run);
    // LEARN: a Map iterates in insertion order, so its first key is the oldest entry: a tiny first-in, first-out cache.
    if (this.runs.size > RUN_CACHE_LIMIT) {
      const oldest = this.runs.keys().next().value;
      if (oldest !== undefined) this.runs.delete(oldest);
    }
  }

  private inputFor(state: ShardrunState): PipelineInput | undefined {
    const catalog = this.requireCatalog();
    const battle = state.battle;
    if (!battle) return undefined;
    return {
      bolts: [baseBolt(catalog.balance)],
      battle: shardBattle(state, battle),
      limit: catalog.balance.max_pipeline_bolts,
      traceLimit: catalog.balance.trace_bolts,
    };
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

  private active(profileId: string): LoadedRun | undefined {
    const placeholders = ENDED.map(() => "?").join(", ");
    const row = this.db
      .prepare(
        `SELECT id, state FROM shardrun_runs WHERE profile_id = ? AND status NOT IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
      )
      .get(profileId, ...ENDED);
    return row === undefined ? undefined : this.load(RunRow.parse(row));
  }

  /** Parse a saved run. A snapshot from older rules cannot continue, so it is closed as abandoned instead of failing forever. */
  private load(row: z.infer<typeof RunRow>): LoadedRun | undefined {
    const parsed = ShardrunState.safeParse(JSON.parse(row.state));
    if (parsed.success) return { id: row.id, state: parsed.data };
    this.db
      .prepare(
        "UPDATE shardrun_runs SET status = 'abandoned', updated_at = ? WHERE id = ? AND status NOT IN ('won', 'lost', 'abandoned')",
      )
      .run(new Date().toISOString(), row.id);
    return undefined;
  }

  private requireProfile(profileId: string): void {
    if (this.db.prepare("SELECT 1 FROM profiles WHERE id = ?").get(profileId) === undefined) {
      throw new ServiceError(404, "profile-not-found", "There is no such character.");
    }
  }

  private requireCatalog(): ShardrunCatalog {
    if (!this.catalog)
      throw new ServiceError(404, "shardrun-unavailable", "No content pack defines Shardrun.");
    return this.catalog;
  }
}

function buildCatalog(index: ContentIndex, balance: Balance): ShardrunCatalog | undefined {
  const run = index.shardrun;
  return (
    run && {
      config: run.value,
      shards: new Map([...index.shards].map(([id, shard]) => [id, shard.value])),
      foes: new Map([...index.shardrunFoes].map(([id, foe]) => [id, foe.value])),
      relics: new Map([...index.shardrunRelics].map(([id, relic]) => [id, relic.value])),
      balance: balance.shardrun,
    }
  );
}

/** The engine command behind each dev request; the engine refuses every one of them outside a sandbox run. */
function devToCommand(request: ShardrunDevRequest): ShardrunCommand {
  switch (request.type) {
    case "grant-shard":
      return { type: "dev-grant-shard", shardId: request.shardId };
    case "remove-shard":
      return { type: "dev-remove-shard", shardId: request.shardId };
    case "grant-relic":
      return { type: "dev-grant-relic", relicId: request.relicId };
    case "remove-relic":
      return { type: "dev-remove-relic", relicId: request.relicId };
    case "grant-spell":
      return { type: "dev-grant-spell", name: request.name, capacity: request.capacity };
    case "set":
      return {
        type: "dev-set",
        ...(request.integrity === undefined ? {} : { integrity: request.integrity }),
        ...(request.mana === undefined ? {} : { mana: request.mana }),
      };
    case "spawn":
      return { type: "dev-spawn", kind: request.kind, foes: request.foes };
    case "end-battle":
      return { type: "dev-end-battle", outcome: request.outcome };
    case "goto-layer":
      return { type: "dev-goto-layer", layer: request.layer };
  }
}

function runLanguage(state: ShardrunState): ShardrunLanguage {
  return isShardrunLanguage(state.language) ? state.language : "python";
}

function runKey(state: ShardrunState, spell: SpellState, input: PipelineInput): string {
  return JSON.stringify([state.language, spell.shards, input]);
}

function emptyRun(input: PipelineInput): PipelineRun {
  return { ok: true, bolts: [...input.bolts], trace: [], work: 0, console: "" };
}

function toOutcome(run: PipelineRun): PipelineOutcome {
  // The rules bill the work, so they get the steps rather than a total: only they know each shard's complexity class.
  return run.ok ? { ok: true, bolts: run.bolts, work: workSteps(run) } : { ok: false, reason: run.reason };
}

function workSteps(run: PipelineRun): WorkStep[] {
  return run.trace.map((step) => ({ shard: step.shard, given: step.given }));
}

/** Bolts as the code view shows them: well-formed ones only, power to two decimals. */
function displayBolts(raw: readonly unknown[]): BoltView[] {
  return raw.flatMap((candidate) => {
    const parsed = Bolt.safeParse(candidate);
    return parsed.success
      ? [
          {
            ...parsed.data,
            power: Math.round(parsed.data.power * 100) / 100,
            mult: Math.round(parsed.data.mult * 100) / 100,
          },
        ]
      : [];
  });
}

function shardView(
  shard: Shard,
  language: ShardrunLanguage,
  catalog: ShardrunCatalog,
  showSummary: boolean,
): ShardView {
  const into = shard.forge && catalog.shards.get(shard.forge.into);
  return {
    id: shard.id,
    name: shard.name,
    rarity: shard.rarity,
    cost: shard.cost,
    complexity: shard.complexity,
    ...(showSummary ? { summary: shard.summary } : {}),
    function: shardFunctionName(shard, language),
    code: shard.code[language] ?? "",
    tags: [...shard.tags],
    ...(shard.curse ? { curse: shard.curse.integrity } : {}),
    ...(shard.forge && into ? { forge: { into: into.id, intoName: into.name, verb: shard.forge.verb } } : {}),
  };
}

/** How much of a pipeline's work a cast actually pays for, in words (ADR-0015). */
const WORK_CURVE_KEYS: Record<WorkCurve, MessageKey> = {
  linear: "workCurve.linear",
  sqrt: "workCurve.sqrt",
  log: "workCurve.log",
};

/** Every rule as it stands now: what it started as, what it is, and which relics moved it (ADR-0013, the Stats panel). */
function modifierViews(state: ShardrunState, catalog: ShardrunCatalog, say: Translate<MessageKey>): ShardrunModifierView[] {
  const { balance } = catalog;
  const mods = relicModifiers(state, catalog);
  const from = (kind: RelicEffect["kind"]): string[] =>
    state.relics.flatMap((id) => {
      const relic = catalog.relics.get(id);
      return relic?.effects.some((effect) => effect.kind === kind) === true ? [relic.name] : [];
    });
  const capacityAdded = state.relics.reduce(
    (sum, id) =>
      sum +
      (catalog.relics
        .get(id)
        ?.effects.reduce((inner, effect) => inner + (effect.kind === "spell-capacity" ? effect.add : 0), 0) ??
        0),
    0,
  );
  const round = (value: number) => Math.round(value * 100) / 100;
  // Descending a layer raises the mana a turn gives and the bolts that land (ADR-0015), so it belongs in `from` too.
  const deeper = state.layer > 0 ? [say("modifier.from.layer", { layer: state.layer + 1 })] : [];
  return [
    {
      label: say("modifier.manaPerTurn"),
      base: `${balance.mana_per_turn.base}`,
      now: `${manaPerTurn(state, catalog)}`,
      from: [...from("mana-per-turn"), ...deeper],
    },
    {
      label: say("modifier.boltCap"),
      base: `${balance.bolt_cap.base}`,
      now: `${boltCap(state, catalog)}`,
      from: [...from("bolt-cap"), ...deeper],
    },
    {
      label: say("modifier.workBilling"),
      base: say(WORK_CURVE_KEYS[balance.work_billing.curve]),
      now: say(WORK_CURVE_KEYS[mods.workCurve]),
      from: from("work-billing"),
    },
    {
      label: say("modifier.boltPower"),
      base: "0",
      now: `${round(mods.boltPower)}`,
      from: from("bolt-power"),
    },
    {
      label: say("modifier.boltMult"),
      base: "0",
      now: `${round(mods.boltMult + mods.multPerCast * (state.battle?.casts ?? 0))}`,
      from: [...from("bolt-mult"), ...from("mult-per-cast")],
    },
    {
      label: say("modifier.boltMultFactor"),
      base: "×1",
      now: `×${round(mods.boltMultFactor)}`,
      from: from("bolt-mult-factor"),
    },
    {
      label: say("modifier.damageMultiplier"),
      base: "×1",
      now: `×${round(mods.damageMultiplier)}`,
      from: from("damage-multiplier"),
    },
    {
      label: say("modifier.weakMultiplier"),
      base: `×${balance.weak_multiplier}`,
      now: `×${round(balance.weak_multiplier + mods.weakBonus)}`,
      from: from("weak-bonus"),
    },
    { label: say("modifier.turnBlock"), base: "0", now: `${mods.turnBlock}`, from: from("turn-block") },
    {
      label: say("modifier.firstCastDiscount"),
      base: "0",
      now: `${mods.firstCastDiscount}`,
      from: from("first-cast-discount"),
    },
    {
      label: say("modifier.healAfterFight"),
      base: "0",
      now: `${mods.healAfterFight}`,
      from: from("heal-after-fight"),
    },
    {
      label: say("modifier.maxIntegrity"),
      base: `${balance.integrity_start}`,
      now: `${state.integrityMax}`,
      from: from("max-integrity"),
    },
    { label: say("modifier.spellCapacity"), base: "0", now: `${capacityAdded}`, from: from("spell-capacity") },
  ];
}

/** The numbers a run plays by, before any relic changes them. */
function rulesView(catalog: ShardrunCatalog): ShardrunRulesView {
  const { balance } = catalog;
  return {
    manaPerTurn: balance.mana_per_turn.base,
    baseBoltPower: balance.base_bolt_power,
    spellBaseCost: balance.spell_base_cost,
    manaPerLayer: balance.mana_per_turn.per_layer,
    workPerMana: balance.work_billing.per_mana,
    workCurve: balance.work_billing.curve,
    maxBolts: balance.bolt_cap.base,
    boltsPerLayer: balance.bolt_cap.per_layer,
    maxBoltsEver: balance.bolt_cap.max,
    maxBoltPower: balance.max_bolt_power,
    maxBoltMult: balance.max_bolt_mult,
    maxSpells: balance.max_spells,
    maxSpellCapacity: balance.max_spell_capacity,
    weakMultiplier: balance.weak_multiplier,
    resistMultiplier: balance.resist_multiplier,
    scatterMultiplier: balance.scatter_multiplier,
    patternOffMultiplier: balance.pattern_off_multiplier,
    restHealFraction: balance.rest_heal_fraction,
    layerHealFraction: balance.layer_heal_fraction,
  };
}

function relicView(relic: Relic): RelicView {
  return {
    id: relic.id,
    name: relic.name,
    rarity: relic.rarity,
    icon: relic.icon,
    summary: relic.summary,
    flavor: relic.flavor,
  };
}

/**
 * A foe as its card shows it. The rules of a fight in progress are the ones copied into `FoeState` when it spawned,
 * but the *name and flavor* are read back from the catalog by id, so they arrive in the reader's language. A foe that
 * no longer exists in content keeps the words it was spawned with.
 */
function foeView(foe: FoeState, catalog: ShardrunCatalog, say: Translate<MessageKey>): ShardrunFoeView {
  const intent = foe.intents[foe.intentIndex % foe.intents.length];
  const content = catalog.foes.get(foe.id);
  return {
    uid: foe.uid,
    name: content?.name ?? foe.name,
    sprite: foe.sprite,
    hp: foe.hp,
    max: foe.max,
    shield: foe.shield,
    weak: [...foe.weak],
    resist: [...foe.resist],
    ...(foe.trait ? { trait: traitView(foe.trait, say) } : {}),
    ...(foe.pattern ? { pattern: foe.pattern } : {}),
    intent: intent
      ? { kind: intent.kind, text: intentText(intent, foe.stoked, say) }
      : { kind: "strike", text: say("intent.watching") },
    stoked: foe.stoked,
    flavor: content?.flavor ?? foe.flavor,
  };
}

function intentText(intent: FoeIntent, stoked: boolean, say: Translate<MessageKey>): string {
  switch (intent.kind) {
    case "strike":
      return say("intent.strike", { power: intent.power * (stoked ? 2 : 1) });
    case "multi":
      return say("intent.multi", { times: intent.times, power: intent.power });
    case "shield":
      return say("intent.shield", { amount: intent.amount });
    case "stoke":
      return say("intent.stoke");
    case "heal":
      return say("intent.heal", { amount: intent.amount });
  }
}

function traitView(trait: FoeTrait, say: Translate<MessageKey>): { kind: string; name: string; text: string } {
  switch (trait.kind) {
    case "nullify-first":
      return { kind: trait.kind, name: say("trait.nullify.name"), text: say("trait.nullify.text") };
    case "thick-hide":
      return {
        kind: trait.kind,
        name: say("trait.thickHide.name"),
        text: say("trait.thickHide.text", { threshold: trait.threshold }),
      };
    case "shifting-weakness":
      return {
        kind: trait.kind,
        name: say("trait.shifting.name"),
        text: say("trait.shifting.text", { cycle: trait.cycle.join(", then ") }),
      };
    case "pattern-ward":
      return {
        kind: trait.kind,
        name: say("trait.patternWard.name"),
        text: say("trait.patternWard.text", { pattern: trait.pattern.join(", ") }),
      };
  }
}
