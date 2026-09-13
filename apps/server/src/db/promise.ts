/**
 * Run synchronous work (node:sqlite is synchronous) behind a Promise-returning interface, turning a thrown error into
 * a rejection. Store interfaces stay asynchronous so a future implementation may do real I/O.
 */
export function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}
