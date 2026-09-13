// Static checks that run before any code executes: line counts and banned tokens (PROMPT.md section 7.3, Constraint
// Curse). They ignore comments and the contents of string literals, so `# no for loops here` does not trip `for`.
//
// LEARN: this is a tiny lexer, not a parser. It walks the source one character at a time in one of four states
// (code, line comment, block comment, string) and blanks out everything that is not code while keeping every
// newline, so line numbers stay correct. Known limits: expressions inside JS template literals are treated as string
// text, and language-specific literals (Python raw strings, SQL '' escapes) are approximated.

interface Syntax {
  lineComment: readonly string[];
  blockComment?: readonly [string, string];
  quotes: readonly string[];
  /** Python-style '''...''' and """...""" strings. */
  tripleQuotes?: boolean;
}

const C_LIKE: Syntax = { lineComment: ["//"], blockComment: ["/*", "*/"], quotes: ['"', "'"] };

const SYNTAX: Readonly<Record<string, Syntax>> = {
  python: { lineComment: ["#"], quotes: ['"', "'"], tripleQuotes: true },
  javascript: { ...C_LIKE, quotes: ['"', "'", "`"] },
  typescript: { ...C_LIKE, quotes: ['"', "'", "`"] },
  c: C_LIKE,
  cpp: C_LIKE,
  go: { ...C_LIKE, quotes: ['"', "'", "`"] },
  rust: { lineComment: ["//"], blockComment: ["/*", "*/"], quotes: ['"'] },
  bash: { lineComment: ["#"], quotes: ['"', "'"] },
  sql: { lineComment: ["--"], blockComment: ["/*", "*/"], quotes: ["'"] },
};

/** Source with comments and string contents replaced by spaces. Quotes and newlines are kept. */
export function stripCommentsAndStrings(source: string, language: string): string {
  const syntax = SYNTAX[language];
  if (!syntax) return source;
  const out: string[] = [];
  let i = 0;
  const blank = (text: string) => {
    for (const ch of text) out.push(ch === "\n" ? "\n" : " ");
  };

  while (i < source.length) {
    const rest = source.slice(i, i + 3);
    const lineComment = syntax.lineComment.find((marker) => source.startsWith(marker, i));
    if (lineComment) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (syntax.blockComment && source.startsWith(syntax.blockComment[0], i)) {
      const end = source.indexOf(syntax.blockComment[1], i + syntax.blockComment[0].length);
      const stop = end === -1 ? source.length : end + syntax.blockComment[1].length;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    const triple = syntax.tripleQuotes && (rest === '"""' || rest === "'''") ? rest : undefined;
    const quote = triple ?? syntax.quotes.find((q) => source.startsWith(q, i));
    if (quote) {
      out.push(quote);
      i += quote.length;
      while (i < source.length && !source.startsWith(quote, i)) {
        // A newline ends an unterminated single-quoted string in most languages; triple quotes and backticks span.
        if (source[i] === "\n" && quote.length === 1 && quote !== "`") break;
        if (source[i] === "\\" && i + 1 < source.length) {
          blank(source.slice(i, i + 2));
          i += 2;
          continue;
        }
        blank(source[i] ?? "");
        i += 1;
      }
      if (source.startsWith(quote, i)) {
        out.push(quote);
        i += quote.length;
      }
      continue;
    }
    out.push(source[i] ?? "");
    i += 1;
  }
  return out.join("");
}

/** Lines that still contain code after comments and string contents are removed. */
export function countCodeLines(source: string, language: string): number {
  return stripCommentsAndStrings(source, language)
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

/** The banned tokens that appear in code (not comments or strings). Word tokens match whole words only. */
export function findBannedTokens(source: string, language: string, tokens: readonly string[]): string[] {
  const code = stripCommentsAndStrings(source, language);
  return tokens.filter((token) => {
    if (/^\w+$/.test(token)) return new RegExp(`\\b${token}\\b`).test(code);
    return code.includes(token);
  });
}
