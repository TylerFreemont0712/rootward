import type { RunLimits, RunnerRegistry, TestResult } from "@rootward/runners";
import type { LoadedChallenge } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";
import { buildIoJob, selectIoCases } from "../jobs.ts";

export interface ExecutionOptions {
  registry: RunnerRegistry;
  limits: RunLimits;
}

export interface ExecutionReport {
  /** `<challenge id> (<language>)` pairs whose reference solution ran. */
  executed: string[];
  /** Pairs that could not run, with the reason. Every skip is also a warning diagnostic. */
  skipped: string[];
}

const SNIPPET = 160;

/**
 * Run every reference solution against all of its tests, including reserve cases, and run the starter code as a
 * sanity check (PROMPT.md section 13.3). Languages without an available runner are skipped with a warning, never
 * silently.
 */
export async function validateExecution(
  challenges: Iterable<LoadedChallenge>,
  diagnostics: Diagnostics,
  options: ExecutionOptions,
): Promise<ExecutionReport> {
  const report: ExecutionReport = { executed: [], skipped: [] };
  for (const challenge of challenges) {
    if (challenge.manifest.tests.form !== "io") continue;
    const file = `${challenge.dir}/challenge.yaml`;
    const cases = selectIoCases(challenge, { visible: true, hidden: true, reserve: "all" });

    for (const language of challenge.manifest.languages) {
      const label = `${challenge.manifest.id} (${language})`;
      const runner = await options.registry.pick(language, "tests");
      if (!runner) {
        report.skipped.push(`${label}: no runner for ${language} yet`);
        diagnostics.warn("not-executed", `reference solution not executed: no runner available for ${language}`, {
          file,
        });
        continue;
      }

      const solutionJob = buildIoJob(challenge, language, challenge.solution[language] ?? {}, cases, options.limits);
      if (!solutionJob) continue;
      const solution = await runner.run(solutionJob, AbortSignal.timeout(options.limits.wallMs * 2));
      report.executed.push(label);
      if (solution.status !== "ok" && solution.status !== "compile-error") {
        diagnostics.error("reference-run", `${label}: the reference solution run ended with ${solution.status}`, {
          file,
        });
      }
      for (const test of solution.tests ?? []) {
        if (!test.passed) {
          diagnostics.error("reference-fails", `${label}: reference solution fails ${describeFailure(test)}`, { file });
        }
      }

      const nonReserve = selectIoCases(challenge, { visible: true, hidden: true, reserve: [] });
      const starterJob = buildIoJob(challenge, language, challenge.starter[language] ?? {}, nonReserve, options.limits);
      if (!starterJob) continue;
      const starter = await runner.run(starterJob, AbortSignal.timeout(options.limits.wallMs * 2));
      if (starter.tests && starter.tests.length > 0 && starter.tests.every((t) => t.passed)) {
        diagnostics.warn("starter-passes", `${label}: the starter code already passes every test`, { file });
      }
    }
  }
  return report;
}

function describeFailure(test: TestResult): string {
  const details = [test.message, test.status !== "ok" ? `status ${test.status}` : undefined]
    .filter((part): part is string => part !== undefined)
    .join("; ");
  const diff =
    test.expected !== undefined && test.actual !== undefined
      ? ` expected ${JSON.stringify(test.expected.slice(0, SNIPPET))} got ${JSON.stringify(test.actual.slice(0, SNIPPET))}`
      : "";
  return `${test.id} "${test.name}"${details ? ` (${details})` : ""}${diff}`;
}
