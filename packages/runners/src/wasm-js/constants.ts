// LEARN: QuickJS checks its own stack limit, but the WebAssembly calls behind each JavaScript frame also use the
// thread's native stack. If the native stack runs out first, the whole thread dies instead of QuickJS throwing a
// catchable "stack overflow". Giving the worker a native stack far larger than QuickJS's limit makes QuickJS's check
// always fire first (verified by the deep-recursion test in test/wasm-js.test.ts).

/** QuickJS's own stack limit: roughly 10k nested calls of a small function. */
export const QUICKJS_STACK_BYTES = 1024 * 1024;

/** Native stack of the worker thread that hosts QuickJS. */
export const WORKER_STACK_MB = 32;

/** V8 heap for the worker's own JavaScript (not the QuickJS WASM memory, which setMemoryLimit bounds). */
export const WORKER_HEAP_MB = 128;

/** Time allowed for a worker to start and load QuickJS on top of a job's wall-clock limit. */
export const WORKER_STARTUP_GRACE_MS = 1000;
