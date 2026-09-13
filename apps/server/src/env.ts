import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Environment variables are an I/O boundary like any other, so they are parsed with zod. Empty strings (as in a
// freshly copied .env.example) count as "not set".
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const EnvSchema = z.object({
  ROOTWARD_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(7331)),
  // Local only by default: the server runs player code and must not be reachable from the network.
  ROOTWARD_HOST: z.preprocess(emptyToUndefined, z.string().default("127.0.0.1")),
  ROOTWARD_ROOT: z.preprocess(emptyToUndefined, z.string().optional()),
  ROOTWARD_DATA_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  XDG_DATA_HOME: z.preprocess(emptyToUndefined, z.string().optional()),
});

export interface ServerEnv {
  port: number;
  host: string;
  /** Repository root: content/, config/, and apps/client/dist live under it. */
  rootDir: string;
  /** Where the SQLite database lives (ADR-0006). */
  dataDir: string;
}

/** The repository root, found from this file's location. */
export function defaultRootDir(): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../..");
}

/**
 * Load `<root>/.env` into process.env when the file exists. Variables already set in the environment win.
 * LEARN: `node --env-file-if-exists` would be simpler, but combined with `--watch` Node 26 tries to watch the env file
 * and crashes when it does not exist, which is the normal case for a fresh clone.
 */
export function loadDotEnv(rootDir: string): void {
  const file = path.join(rootDir, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) throw new Error(`invalid environment:\n${z.prettifyError(parsed.error)}`);
  const xdgData = parsed.data.XDG_DATA_HOME;
  const defaultDataDir = xdgData === undefined ? path.join(homedir(), ".local", "share", "rootward") : path.join(xdgData, "rootward");
  return {
    port: parsed.data.ROOTWARD_PORT,
    host: parsed.data.ROOTWARD_HOST,
    rootDir: path.resolve(parsed.data.ROOTWARD_ROOT ?? defaultRootDir()),
    dataDir: path.resolve(parsed.data.ROOTWARD_DATA_DIR ?? defaultDataDir),
  };
}
