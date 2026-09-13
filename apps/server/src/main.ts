import path from "node:path";
import { WasmJsRunner, WasmPythonRunner } from "@rootward/runners";
import { buildApp } from "./app.ts";
import { ContentLoadError, loadGameContent } from "./content.ts";
import { openDatabase } from "./db/database.ts";
import { defaultRootDir, loadDotEnv, readEnv } from "./env.ts";
import { SqliteAttemptStore } from "./runs/attempts.ts";
import { RunService } from "./runs/service.ts";
import { SqliteEventStore } from "./runs/sqlite-event-store.ts";
import { Sandbox } from "./sandbox.ts";

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
  const app = await buildApp({ service, sandbox, clientDir: path.join(env.rootDir, "apps/client/dist"), logger: true });
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

  await app.listen({ host: env.host, port: env.port });
}

main().catch((error: unknown) => {
  // Content errors are the most likely startup failure, and their message already lists every problem.
  console.error(error instanceof ContentLoadError ? error.message : error);
  process.exitCode = 1;
});
