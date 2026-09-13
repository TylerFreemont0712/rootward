import type { FileMap } from "@rootward/content-tools";
import type { RunResult, TestResult } from "@rootward/runners";

/**
 * Per-run data that is not game state: what the player last submitted and the full runner output. It includes
 * hidden-test details, so it never leaves the server except through views.ts, which redacts it.
 * M0 keeps it in memory; M1 persists it as the `attempts` table.
 */
export interface RunArtifacts {
  /** Most recently submitted files, or the starter files before the first Probe or Cast. */
  files: FileMap;
  /** Latest full result per test id. */
  latest: Map<string, TestResult>;
  lastRun?: {
    kind: "probe" | "cast";
    result: RunResult;
    /** Ids of visible tests in this run; only their output may be shown. */
    visibleIds: ReadonlySet<string>;
  };
}
