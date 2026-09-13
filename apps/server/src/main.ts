import path from "node:path";
import { WasmJsRunner } from "@rootward/runners";
import { buildApp } from "./app.ts";
import { ContentLoadError, loadGameContent } from "./content.ts";
import { defaultRootDir, loadDotEnv, readEnv } from "./env.ts";
import { RunService } from "./runs/service.ts";
import { InMemoryEventStore } from "./runs/store.ts";
import { Sandbox } from "./sandbox.ts";

async function main(): Promise<void> {
  loadDotEnv(defaultRootDir());
  const env = readEnv();
  const content = await loadGameContent(env.rootDir);
  for (const warning of content.warnings) console.warn(warning);

  const sandbox = new Sandbox(content.balance, [new WasmJsRunner()]);
  const service = new RunService({ content, sandbox, store: new InMemoryEventStore() });
  const app = await buildApp({ service, sandbox, clientDir: path.join(env.rootDir, "apps/client/dist"), logger: true });

  const shutdown = (signal: string): void => {
    app.log.info(`${signal} received, shutting down`);
    app.close().then(
      () => process.exit(0),
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
