import path from "node:path";
import { Balance } from "@rootward/content-schema";
import type { Diagnostics } from "./diagnostics.ts";
import { displayPath } from "./loader/context.ts";
import { readYamlFile } from "./yaml.ts";

/** Load and validate `config/balance.yaml`. */
export async function loadBalance(
  configDir: string,
  diagnostics: Diagnostics,
  rootDir: string = path.dirname(configDir),
): Promise<Balance | undefined> {
  const file = path.join(configDir, "balance.yaml");
  return readYamlFile(file, displayPath({ diagnostics, rootDir }, file), Balance, diagnostics);
}
