import { Bolt, DEFAULT_SHARD_BATTLE } from "@rootward/content-schema";
import type { ContentIndex } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";
import { pipelineJob, readPipelineRuns, SHARDRUN_LANGUAGES } from "../shardrun.ts";
import type { ExecutionOptions, ExecutionReport } from "./execute.ts";

// Shardrun content checks (ADR-0012): the run names shards and foes that exist, every shard has code in every Shardrun
// language, and every shard's worked examples really produce what they claim when run in a sandbox.

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
  const shardRef = (id: string, where: string): void => {
    if (!index.shards.has(id)) diagnostics.error("unknown-shard", `${where} names unknown shard "${id}"`, { file });
  };
  for (const spell of run.value.start.spells) {
    if (spell.shards.length > spell.capacity) {
      diagnostics.error("spell-capacity", `starting spell "${spell.name}" holds ${spell.shards.length} shards but has room for ${spell.capacity}`, { file });
    }
    for (const id of spell.shards) shardRef(id, `starting spell "${spell.name}"`);
  }
  for (const id of run.value.start.inventory) shardRef(id, "the starting inventory");

  for (const kind of ["fight", "elite", "boss"] as const) {
    for (const group of run.value.encounters[kind]) {
      for (const foe of group) {
        if (!index.shardrunFoes.has(foe)) diagnostics.error("unknown-foe", `a ${kind} encounter names unknown foe "${foe}"`, { file });
      }
    }
  }
  if (!run.value.floors.at(-1)?.includes("boss")) {
    diagnostics.warn("shardrun-no-boss", "the last Shardrun floor has no boss room, so a run ends without a final fight", { file });
  }
  for (const kind of ["fight", "elite"] as const) {
    const weights = run.value.rewards[kind];
    const offered = [...index.shards.values()].some(({ value }) => value.draftable && weights[value.rarity] > 0);
    if (!offered) diagnostics.warn("shardrun-no-rewards", `${kind} rewards can never offer a shard: no draftable shard has a weighted rarity`, { file });
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
      const inputs = shard.examples.map((example) => ({
        bolts: example.bolts,
        battle: example.battle ?? DEFAULT_SHARD_BATTLE,
        limit: EXAMPLE_BOLT_LIMIT,
      }));
      const job = pipelineJob(language, [shard], inputs, options.limits);
      if (!job) continue;
      const result = await runner.run(job, AbortSignal.timeout(options.limits.wallMs * 2));
      const label = `shard ${shard.id} (${language})`;
      report.executed.push(label);
      readPipelineRuns(result, inputs.length).forEach((run, i) => {
        const example = shard.examples[i];
        if (!example) return;
        if (!run.ok) {
          diagnostics.error("shard-example", `${label}: example "${example.name}" failed: ${run.reason}`, { file });
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
      got.data.element === want.element &&
      got.data.target === want.target &&
      got.data.pierce === want.pierce &&
      got.data.ward === want.ward
    );
  });
}
