/**
 * Runs at most `max` tasks at once and queues the rest in arrival order (PROMPT.md section 12.5: "at most N
 * sandboxes at once").
 * LEARN: a semaphore in a few lines. JavaScript runs one callback at a time, so `active` never needs a lock; the
 * queue holds the `resolve` functions of promises that callers are awaiting.
 */
export class ConcurrencyLimiter {
  readonly max: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error(`concurrency limit must be a positive integer, got ${max}`);
    this.max = max;
  }

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
