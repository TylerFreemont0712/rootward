export type Severity = "error" | "warning";

export interface Location {
  /** Path relative to the repository root when possible. */
  file?: string;
  line?: number;
  column?: number;
}

export interface Diagnostic extends Location {
  severity: Severity;
  /** Stable machine-readable code such as "schema", "missing-reference", or "cycle". */
  code: string;
  message: string;
}

/** Collects problems instead of throwing, so one validation run reports every issue at once. */
export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(code: string, message: string, where: Location = {}): void {
    this.items.push({ severity: "error", code, message, ...where });
  }

  warn(code: string, message: string, where: Location = {}): void {
    this.items.push({ severity: "warning", code, message, ...where });
  }

  get errors(): Diagnostic[] {
    return this.items.filter((d) => d.severity === "error");
  }

  get warnings(): Diagnostic[] {
    return this.items.filter((d) => d.severity === "warning");
  }

  hasErrors(): boolean {
    return this.items.some((d) => d.severity === "error");
  }
}

export function formatLocation(where: Location): string {
  if (where.file === undefined) return "";
  if (where.line === undefined) return where.file;
  return where.column === undefined ? `${where.file}:${where.line}` : `${where.file}:${where.line}:${where.column}`;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = formatLocation(d);
  return `${d.severity}${where ? ` ${where}` : ""} [${d.code}] ${d.message}`;
}

/** A Location for a file that may be unknown. */
export function at(file: string | undefined): Location {
  return file === undefined ? {} : { file };
}

/** Build a Location without `undefined` members (required under exactOptionalPropertyTypes). */
export function location(file: string, line?: number, column?: number): Location {
  const where: Location = { file };
  if (line !== undefined) where.line = line;
  if (column !== undefined) where.column = column;
  return where;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
