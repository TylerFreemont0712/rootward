import path from "node:path";
import { WasmJsRunner, WasmPythonRunner } from "@rootward/runners";
import { buildApp } from "./app.ts";
import { ContentLoadError, loadGameContent } from "./content.ts";
import { openDatabase } from "./db/database.ts";
import { defaultRootDir, loadDotEnv, readEnv } from "./env.ts";
import { ProfileService } from "./profiles/service.ts";
import { SqliteAttemptStore } from "./runs/attempts.ts";
import { RunServiceRegistry } from "./runs/registry.ts";
import { RunService } from "./runs/service.ts";
import { SqliteEventStore } from "./runs/sqlite-event-store.ts";
import { Sandbox } from "./sandbox.ts";
import { WorldService } from "./world/service.ts";

async function main(): Promise<void> {
  loadDotEnv(defaultRootDir());
  const env = readEnv();
  const content = await loadGameContent(env.rootDir);
  for (const warning of content.warnings) console.warn(warning);

  const databaseFile = path.join(env.dataDir, "rootward.db");
  const db = openDatabase(databaseFile);

  const python = new WasmPythonRunner({ warm: true });
  // Load one Python sandbox now so the first Python Probe does not wait for Pyodide.
  python.prewarm();
  const sandbox = new Sandbox(content.balance, [new WasmJsRunner(), python]);
  const service = new RunService({
    content,
    sandbox,
    store: new SqliteEventStore(db),
    attempts: new SqliteAttemptStore(db),
  });
  // Characters (ADR-0010): profile-scoped run routes and the world (ADR-0011), alongside the unscoped `service` above,
  // which stays exactly as it was before profiles existed.
  const registry = new RunServiceRegistry({ content, sandbox, db });
  const profiles = {
    profileService: new ProfileService({ db }),
    registry,
    world: new WorldService({ db, content, registry }),
  };
  const app = await buildApp({
    service,
    sandbox,
    clientDir: path.join(env.rootDir, "apps/client/dist"),
    logger: true,
    profiles,
  });
  app.log.info(`runs are saved in ${databaseFile}`);

  const shutdown = (signal: string): void => {
    app.log.info(`${signal} received, shutting down`);
    Promise.all([app.close(), sandbox.dispose()]).then(
      () => {
        db.close();
        process.exit(0);
      },
      (error: unknown) => {
        app.log.error(error);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    // A failed listen (for example EADDRINUSE) must not leave the process running on its sandboxes and database.
    await Promise.allSettled([app.close(), sandbox.dispose()]);
    db.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  // Content errors are the most likely startup failure, and their message already lists every problem.
  console.error(error instanceof ContentLoadError ? error.message : error);
  process.exitCode = 1;
  // Nothing should be left running after a failed start. If something still is (a sandbox child), exit anyway;
  // unref() keeps this timer from being the thing that holds the process open.
  setTimeout(() => process.exit(1), 5000).unref();
});
