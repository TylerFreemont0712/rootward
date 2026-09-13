/**
 * Runs tasks for the same key one after another. Two quick Casts on one run would otherwise both read the same event
 * log, both run the sandbox, and race to append.
 * LEARN: each key keeps the promise of its last queued task; a new task waits for that promise before starting.
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const { promise: done, resolve: release } = Promise.withResolvers<undefined>();
    const tail = previous.then(() => done);
    this.tails.set(key, tail);
    await previous;
    try {
      return await task();
    } finally {
      release(undefined);
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
