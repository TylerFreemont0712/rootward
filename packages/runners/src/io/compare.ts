export interface NormalizeOptions {
  /** Ignore spaces and tabs at line ends and blank lines at the end of the output. */
  trailingWhitespace: boolean;
  /** Treat \r\n and \r as \n. */
  newlines: boolean;
}

export function normalizeOutput(text: string, options: NormalizeOptions): string {
  let result = options.newlines ? text.replace(/\r\n?/g, "\n") : text;
  if (options.trailingWhitespace) {
    result = result
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n+$/, "");
  }
  return result;
}

export interface OutputComparison {
  passed: boolean;
  /** Normalized expected output. */
  expected: string;
  /** Normalized actual output. */
  actual: string;
  /** 1-based line where the outputs first differ, when they differ. */
  firstDifferentLine?: number;
}

export function compareOutput(actual: string, expected: string, options: NormalizeOptions): OutputComparison {
  const normalizedActual = normalizeOutput(actual, options);
  const normalizedExpected = normalizeOutput(expected, options);
  if (normalizedActual === normalizedExpected) {
    return { passed: true, expected: normalizedExpected, actual: normalizedActual };
  }
  const actualLines = normalizedActual.split("\n");
  const expectedLines = normalizedExpected.split("\n");
  let line = 0;
  while (line < Math.max(actualLines.length, expectedLines.length) && actualLines[line] === expectedLines[line]) {
    line += 1;
  }
  return { passed: false, expected: normalizedExpected, actual: normalizedActual, firstDifferentLine: line + 1 };
}
