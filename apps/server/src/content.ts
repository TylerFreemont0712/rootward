import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import type { Balance } from "@rootward/content-schema";
import { type ContentIndex, formatDiagnostic, loadBalance, loadContent, localizeIndex } from "@rootward/content-tools";

export interface GameContent {
  /**
   * The content, in the locale of the request being served (ADR-0018). Outside a request — at startup, in a
   * background job, in a test — it is English.
   */
  readonly index: ContentIndex;
  /** The content in a named locale, for the rare caller that needs one explicitly. Unknown locales are English. */
  indexFor: (locale: string | undefined) => ContentIndex;
  /** Locales this content has translations for, English aside. */
  readonly locales: readonly string[];
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

// LEARN: AsyncLocalStorage is request-scoped context. A value put in here is visible to everything that runs inside
// the callback, however deep and however many awaits down, without being passed as an argument — Node keeps it
// attached to the async call tree. That is what lets `content.index` answer in the caller's language while every
// service, view builder and route keeps the signature it had before locales existed (ADR-0018). The alternative was
// threading a `locale` parameter through about thirty call sites, which is more code and more places to forget it.
const requestLocale = new AsyncLocalStorage<string>();

/** The language of the request being served, or undefined outside one. */
export function currentLocale(): string | undefined {
  return requestLocale.getStore();
}

/** Run `body` with `locale` as the language of `content.index`. The server wraps every request in this. */
export function withLocale<T>(locale: string | undefined, body: () => T): T {
  return locale === undefined ? body() : requestLocale.run(locale, body);
}

/** Load all packs and config/balance.yaml. The server refuses to start on any content error. */
export async function loadGameContent(rootDir: string): Promise<GameContent> {
  const { index, diagnostics } = await loadContent({ contentDir: path.join(rootDir, "content"), rootDir });
  const balance = await loadBalance(path.join(rootDir, "config"), diagnostics, rootDir);
  if (diagnostics.hasErrors() || !balance) {
    const problems = diagnostics.errors.map(formatDiagnostic);
    throw new ContentLoadError(problems.length > 0 ? problems : ["config/balance.yaml could not be loaded"]);
  }

  // Each locale is built once, at startup, rather than per request: an index is a few hundred small records, and a
  // request should never pay for a language.
  const localized = new Map<string, ContentIndex>();
  for (const [locale, overlay] of index.locales) localized.set(locale, localizeIndex(index, overlay));

  const indexFor = (locale: string | undefined): ContentIndex =>
    (locale === undefined ? undefined : localized.get(locale)) ?? index;

  return {
    get index() {
      return indexFor(requestLocale.getStore());
    },
    indexFor,
    locales: [...localized.keys()],
    balance,
    warnings: diagnostics.warnings.map(formatDiagnostic),
  };
}
