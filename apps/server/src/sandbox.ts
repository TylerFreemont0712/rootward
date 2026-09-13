import type { Balance, IoCase, Language } from "@rootward/content-schema";
import { buildIoJob, type FileMap, type LoadedChallenge } from "@rootward/content-tools";
import {
  ConcurrencyLimiter,
  type Runner,
  RunnerRegistry,
  type RunLimits,
  type RunResult,
} from "@rootward/runners";
import { ServiceError } from "./errors.ts";

/** The category that marks io cases used for the efficiency band. */
export const LARGE_INPUT_CATEGORY = "large-input";

/** Server-side access to runners: picks the best runner, caps concurrency, and measures reference timings. */
export class Sandbox {
  readonly registry = new RunnerRegistry();
  readonly limits: RunLimits;
  private readonly limiter: ConcurrencyLimiter;
  private readonly referenceTimes = new Map<string, Promise<number | undefined>>();

  constructor(balance: Balance, runners: readonly Runner[]) {
    const defaults = balance.sandbox_defaults;
    this.limits = {
      wallMs: defaults.wall_ms,
      cpuMs: defaults.cpu_ms,
      memMb: defaults.mem_mb,
      pids: defaults.pids,
      outputKb: defaults.output_kb,
    };
    this.limiter = new ConcurrencyLimiter(defaults.max_concurrent);
    for (const runner of runners) this.registry.register(runner);
  }

  async canRun(language: string): Promise<boolean> {
    return (await this.registry.pick(language, "tests")) !== undefined;
  }

  /** Run `files` against the given io cases of a challenge. */
  async runIo(challenge: LoadedChallenge, language: Language, files: FileMap, cases: readonly IoCase[]): Promise<RunResult> {
    const runner = await this.registry.pick(language, "tests");
    if (!runner) throw new ServiceError(409, "no-runner", `No sandbox can run ${language} on this machine yet.`);
    const job = buildIoJob(challenge, language, files, cases, this.limits);
    if (!job) throw new ServiceError(400, "unsupported-challenge", "Only io-form challenges can be played so far.");
    // The generous abort is a backstop; runners enforce their own wall-clock limit first.
    return this.limiter.run(() => runner.run(job, AbortSignal.timeout(this.limits.wallMs * 3)));
  }

  /**
   * The slowest large-input case of the reference solution on this machine's runner, measured once per challenge
   * version and language. Efficiency bonuses compare the player against this (ADR-0004).
   */
  referenceLargeInputMs(challenge: LoadedChallenge, language: Language): Promise<number | undefined> {
    const key = `${challenge.manifest.id}@${challenge.manifest.version}:${language}`;
    let measurement = this.referenceTimes.get(key);
    if (!measurement) {
      measurement = this.measureReference(challenge, language);
      this.referenceTimes.set(key, measurement);
    }
    return measurement;
  }

  private async measureReference(challenge: LoadedChallenge, language: Language): Promise<number | undefined> {
    const cases = (challenge.hiddenTests?.cases ?? []).filter((c) => c.category === LARGE_INPUT_CATEGORY);
    if (cases.length === 0) return undefined;
    const result = await this.runIo(challenge, language, challenge.solution[language] ?? {}, cases);
    const tests = result.tests ?? [];
    if (tests.length !== cases.length || tests.some((t) => !t.passed)) return undefined;
    return Math.max(...tests.map((t) => t.durationMs));
  }
}
