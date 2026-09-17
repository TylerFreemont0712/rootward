import { Bolt, DEFAULT_SHARD_BATTLE } from "@rootward/content-schema";
import type { ContentIndex } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";
import { readSpellRuns, SHARDRUN_LANGUAGES, spellsJob } from "../shardrun.ts";
import type { ExecutionOptions, ExecutionReport } from "./execute.ts";

// Shardrun content checks (ADR-0012, ADR-0013): the run names shards, foes, and relics that exist, every shard has code
// in every Shardrun language, and every shard's worked examples really produce what they claim in a sandbox.

/** Examples check what a shard does, not the run's bolt cap, so they get room well past any balance setting. */
const EXAMPLE_BOLT_LIMIT = 256;

export function validateShardrun(index: ContentIndex, diagnostics: Diagnostics): void {
  for (const { value: shard, file } of index.shards.values()) {
    for (const language of SHARDRUN_LANGUAGES) {
      if (shard.code[language] === undefined) {
        diagnostics.error("shard-language", `shard "${shard.id}" has no ${language} code; Shardrun can be played in either`, { file });
      }
    }
    if (shard.forge) {
      if (shard.forge.into === shard.id) diagnostics.error("shard-forge", `shard "${shard.id}" cannot forge into itself`, { file });
      else if (!index.shards.has(shard.forge.into)) {
        diagnostics.error("unknown-shard", `shard "${shard.id}" forges into unknown shard "${shard.forge.into}"`, { file });
      }
    }
  }

  const run = index.shardrun;
  if (!run) {
    if (index.shards.size > 0 || index.shardrunFoes.size > 0) {
      diagnostics.warn("shardrun-unused", "shards or Shardrun foes exist, but no pack declares shardrun/run.yaml");
    }
    return;
  }
  const { file } = run;
  const config = run.value;
  const shardRef = (id: string, where: string): void => {
    if (!index.shards.has(id)) diagnostics.error("unknown-shard", `${where} names unknown shard "${id}"`, { file });
  };
  for (const spell of config.start.spells) {
    if (spell.shards.length > spell.capacity) {
      diagnostics.error("spell-capacity", `starting spell "${spell.name}" holds ${spell.shards.length} shards but has room for ${spell.capacity}`, { file });
    }
    for (const id of spell.shards) shardRef(id, `starting spell "${spell.name}"`);
  }
  for (const id of config.start.inventory) shardRef(id, "the starting inventory");
  for (const id of config.deck?.cards ?? []) shardRef(id, "the deck playstyle's starting cards");
  for (const id of config.start.relics) {
    if (!index.shardrunRelics.has(id)) diagnostics.error("unknown-relic", `the starting relics name unknown relic "${id}"`, { file });
  }
  const difficultyIds = new Set<string>();
  for (const difficulty of config.difficulties) {
    if (difficultyIds.has(difficulty.id)) diagnostics.error("duplicate-id", `difficulty "${difficulty.id}" is listed twice`, { file });
    difficultyIds.add(difficulty.id);
  }

  for (const act of config.layers) {
    for (const kind of ["fight", "elite", "boss"] as const) {
      for (const group of act.encounters[kind]) {
        for (const foe of group) {
          if (!index.shardrunFoes.has(foe)) {
            diagnostics.error("unknown-foe", `layer "${act.id}": a ${kind} encounter names unknown foe "${foe}"`, { file });
          }
        }
      }
    }
    if (act.paths > act.columns * 2) {
      diagnostics.warn("shardrun-crowded-map", `layer "${act.id}" draws ${act.paths} paths across only ${act.columns} columns`, { file });
    }
  }
  for (const kind of ["fight", "elite"] as const) {
    const weights = config.rewards.shards[kind];
    const offered = [...index.shards.values()].some(({ value }) => value.draftable && weights[value.rarity] > 0);
    if (!offered) diagnostics.warn("shardrun-no-rewards", `${kind} rewards can never offer a shard: no draftable shard has a weighted rarity`, { file });
  }
  for (const kind of ["elite", "treasure", "boss"] as const) {
    const weights = config.rewards.relics[kind];
    const offered = [...index.shardrunRelics.values()].some(({ value }) => weights[value.rarity] > 0);
    if (!offered) diagnostics.warn("shardrun-no-relics", `${kind} rewards can never offer a relic: no relic has a weighted rarity`, { file });
  }
}

/** Run every shard's examples in every Shardrun language that has a runner, one job per shard and language. */
export async function executeShards(
  index: ContentIndex,
  diagnostics: Diagnostics,
  options: ExecutionOptions,
  report: ExecutionReport,
  packId?: string,
): Promise<void> {
  const shards = [...index.shards.values()].filter((shard) => packId === undefined || shard.packId === packId);
  if (shards.length === 0) return;
  for (const language of SHARDRUN_LANGUAGES) {
    const runner = await options.registry.pick(language, "tests");
    if (!runner) {
      report.skipped.push(`shards (${language}): no runner for ${language} yet`);
      diagnostics.warn("not-executed", `shard examples not executed: no runner available for ${language}`);
      continue;
    }
    for (const { value: shard, file } of shards) {
      const cases = shard.examples.map((example) => ({
        spells: [{ id: "example", shards: [shard] }],
        input: { bolts: example.bolts, battle: example.battle ?? DEFAULT_SHARD_BATTLE, limit: EXAMPLE_BOLT_LIMIT, traceLimit: 1 },
      }));
      const job = spellsJob(language, cases, options.limits);
      if (!job) continue;
      const result = await runner.run(job, AbortSignal.timeout(options.limits.wallMs * 2));
      const label = `shard ${shard.id} (${language})`;
      report.executed.push(label);
      shard.examples.forEach((example, i) => {
        const run = readSpellRuns(result, i, ["example"]).get("example");
        if (!run?.ok) {
          diagnostics.error("shard-example", `${label}: example "${example.name}" failed: ${run?.reason ?? "no result"}`, { file });
        } else if (!sameBolts(run.bolts, example.expect)) {
          diagnostics.error(
            "shard-example",
            `${label}: example "${example.name}" expected ${JSON.stringify(example.expect)} but got ${JSON.stringify(run.bolts)}`,
            { file },
          );
        }
      });
    }
  }
}

function sameBolts(actual: readonly unknown[], expected: readonly Bolt[]): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every((want, i) => {
    const got = Bolt.safeParse(actual[i]);
    // LEARN: 4 * 0.6 is 2.4000000000000004 in both Python and JavaScript (IEEE 754 doubles), so power is compared with a
    // tolerance instead of exactly; every other field must match.
    return (
      got.success &&
      Math.abs(got.data.power - want.power) < 1e-6 &&
      Math.abs(got.data.mult - want.mult) < 1e-6 &&
      got.data.element === want.element &&
      got.data.target === want.target &&
      got.data.pierce === want.pierce &&
      got.data.ward === want.ward
    );
  });
}
