import path from "node:path";
import type { Diagnostics } from "../diagnostics.ts";

export interface LoadContext {
  diagnostics: Diagnostics;
  /** Absolute repository root; diagnostics print paths relative to it. */
  rootDir: string;
}

export function displayPath(ctx: LoadContext, absolute: string): string {
  const relative = path.relative(ctx.rootDir, absolute);
  return relative === "" ? "." : relative.split(path.sep).join("/");
}
