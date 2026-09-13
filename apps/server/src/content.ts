import path from "node:path";
import type { Balance } from "@rootward/content-schema";
import { type ContentIndex, formatDiagnostic, loadBalance, loadContent } from "@rootward/content-tools";

export interface GameContent {
  index: ContentIndex;
  balance: Balance;
  /** Non-fatal diagnostics, printed at startup. */
  warnings: string[];
}

export class ContentLoadError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`content failed to load:\n${problems.join("\n")}\nRun \`pnpm content:validate\` for details.`);
    this.name = "ContentLoadError";
    this.problems = problems;
  }
}

/** Load all packs and config/balance.yaml. The server refuses to start on any content error. */
export async function loadGameContent(rootDir: string): Promise<GameContent> {
  const { index, diagnostics } = await loadContent({ contentDir: path.join(rootDir, "content"), rootDir });
  const balance = await loadBalance(path.join(rootDir, "config"), diagnostics, rootDir);
  if (diagnostics.hasErrors() || !balance) {
    const problems = diagnostics.errors.map(formatDiagnostic);
    throw new ContentLoadError(problems.length > 0 ? problems : ["config/balance.yaml could not be loaded"]);
  }
  return { index, balance, warnings: diagnostics.warnings.map(formatDiagnostic) };
}
