import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter, type Runner, RunnerRegistry, type RunnerTier } from "../src/index.ts";

function fakeRunner(id: string, tier: RunnerTier, available = true): Runner {
  return {
    id,
    tier,
    languages: ["javascript"],
    kinds: ["tests"],
    isAvailable: () => Promise.resolve(available),
    run: () => Promise.reject(new Error("fake runners do not run code")),
  };
}

describe("RunnerRegistry", () => {
  it("prefers the safest available tier", async () => {
    const registry = new RunnerRegistry();
    registry.register(fakeRunner("process-js", "process"));
    registry.register(fakeRunner("docker-js", "container"));
    registry.register(fakeRunner("wasm-js", "wasm"));
    expect((await registry.pick("javascript", "tests"))?.id).toBe("wasm-js");
  });

  it("skips unavailable runners and returns undefined when nothing fits", async () => {
    const registry = new RunnerRegistry();
    registry.register(fakeRunner("wasm-js", "wasm", false));
    registry.register(fakeRunner("docker-js", "container"));
    expect((await registry.pick("javascript", "tests"))?.id).toBe("docker-js");
    expect(await registry.pick("python", "tests")).toBeUndefined();
    expect(await registry.pick("javascript", "terminal-check")).toBeUndefined();
  });

  it("rejects duplicate runner ids", () => {
    const registry = new RunnerRegistry();
    registry.register(fakeRunner("wasm-js", "wasm"));
    expect(() => {
      registry.register(fakeRunner("wasm-js", "wasm"));
    }).toThrow("already registered");
  });
});

describe("ConcurrencyLimiter", () => {
  it("never runs more than the limit at once", async () => {
    const limiter = new ConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    };
    await Promise.all(Array.from({ length: 6 }, () => limiter.run(task)));
    expect(peak).toBe(2);
    expect(limiter.running).toBe(0);
    expect(limiter.queued).toBe(0);
  });

  it("frees the slot when a task fails", async () => {
    const limiter = new ConcurrencyLimiter(1);
    await expect(limiter.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limiter.run(() => Promise.resolve(7))).resolves.toBe(7);
  });
});
