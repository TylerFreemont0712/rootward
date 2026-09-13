import type { RunKind, Runner, RunnerTier } from "./contract.ts";

// Safest and cheapest first: WASM needs no setup, containers need Docker, and the process runner is unsandboxed.
const TIER_ORDER: Readonly<Record<RunnerTier, number>> = { wasm: 0, container: 1, process: 2 };

/** Runners register once at startup; the engine asks for the best available one per language and kind. */
export class RunnerRegistry {
  private readonly runners: Runner[] = [];
  private readonly availability = new Map<string, Promise<boolean>>();

  register(runner: Runner): void {
    if (this.runners.some((existing) => existing.id === runner.id)) {
      throw new Error(`a runner with id "${runner.id}" is already registered`);
    }
    this.runners.push(runner);
  }

  list(): readonly Runner[] {
    return this.runners;
  }

  /** The preferred available runner for a language and job kind, or undefined when none can run it. */
  async pick(language: string, kind: RunKind): Promise<Runner | undefined> {
    const candidates = this.runners
      .filter((runner) => runner.languages.includes(language) && runner.kinds.includes(kind))
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    for (const runner of candidates) {
      if (await this.isAvailable(runner)) return runner;
    }
    return undefined;
  }

  private isAvailable(runner: Runner): Promise<boolean> {
    // Detection (for example "is Docker running?") can be slow, so each runner is checked once and cached.
    let check = this.availability.get(runner.id);
    if (!check) {
      check = runner.isAvailable();
      this.availability.set(runner.id, check);
    }
    return check;
  }
}
