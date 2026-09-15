import type { ContentIndex, LoadedChallenge } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";
import { validateChallenge } from "./challenges.ts";
import { type ExecutionOptions, type ExecutionReport, validateExecution } from "./execute.ts";
import { type EngineRegistries, validateReferences } from "./references.ts";
import { validateWorld } from "./world.ts";

export type { EngineRegistries } from "./references.ts";
export type { ExecutionOptions, ExecutionReport } from "./execute.ts";

export interface ValidateOptions {
  /** Engine registries (enemy moves) to check references against. */
  engine?: EngineRegistries;
  /** Run reference solutions. Omit to validate statically only. */
  execution?: ExecutionOptions;
  /** Limit challenge checks and execution to one pack; references are always checked across all packs. */
  packId?: string;
}

/** Every check after loading: references, graph, per-challenge rules, and (optionally) execution. */
export async function validateContent(
  index: ContentIndex,
  diagnostics: Diagnostics,
  options: ValidateOptions = {},
): Promise<ExecutionReport> {
  validateReferences(index, diagnostics, options.engine);
  validateWorld(index, diagnostics);

  const challenges: LoadedChallenge[] = [...index.challenges.values()].filter(
    (challenge) => options.packId === undefined || challenge.packId === options.packId,
  );
  for (const challenge of challenges) validateChallenge(challenge, diagnostics);

  for (const challenge of challenges) {
    const visible = challenge.visibleTests?.normalize;
    const hidden = challenge.hiddenTests?.normalize;
    if (visible && hidden && JSON.stringify(visible) !== JSON.stringify(hidden)) {
      diagnostics.error("normalize-mismatch", "tests/io.yaml and hidden/io.yaml must use the same normalize settings", {
        file: `${challenge.dir}/challenge.yaml`,
      });
    }
  }

  if (!options.execution) return { executed: [], skipped: [] };
  return validateExecution(challenges, diagnostics, options.execution);
}
