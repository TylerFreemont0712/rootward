import { readFile } from "node:fs/promises";
import { type Document, isMap, isNode, isScalar, LineCounter, parseDocument } from "yaml";
import type { z } from "zod";
import { type Diagnostics, errorMessage, location } from "./diagnostics.ts";

export async function readText(
  absolutePath: string,
  displayPath: string,
  diagnostics: Diagnostics,
): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    diagnostics.error("read", `cannot read file: ${errorMessage(error)}`, { file: displayPath });
    return undefined;
  }
}

/** Read, parse, and validate a YAML file. Problems become diagnostics with line numbers; the result is undefined. */
export async function readYamlFile<T extends z.ZodType>(
  absolutePath: string,
  displayPath: string,
  schema: T,
  diagnostics: Diagnostics,
): Promise<z.output<T> | undefined> {
  const text = await readText(absolutePath, displayPath, diagnostics);
  return text === undefined ? undefined : parseYaml(text, displayPath, schema, diagnostics);
}

export function parseYaml<T extends z.ZodType>(
  text: string,
  displayPath: string,
  schema: T,
  diagnostics: Diagnostics,
): z.output<T> | undefined {
  // LEARN: parseDocument keeps source positions for every node, unlike YAML.parse. That is what lets a schema error
  // say "skills/concepts.yaml:7:5" instead of just "nodes[3] is invalid".
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, uniqueKeys: true, prettyErrors: false });
  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      const { line, col } = lineCounter.linePos(error.pos[0]);
      diagnostics.error("yaml", firstLine(error.message), location(displayPath, line, col));
    }
    return undefined;
  }

  const result = schema.safeParse(doc.toJS());
  if (result.success) return result.data;

  for (const issue of result.error.issues) {
    const path = issue.path.filter((part): part is string | number => typeof part !== "symbol");
    const offset = offsetForIssue(doc, path, issue);
    const position = offset === undefined ? undefined : lineCounter.linePos(offset);
    const prefix = path.length > 0 ? `${formatPath(path)}: ` : "";
    diagnostics.error("schema", `${prefix}${issue.message}`, location(displayPath, position?.line, position?.col));
  }
  return undefined;
}

export function formatPath(path: readonly (string | number)[]): string {
  return path
    .map((part, index) => (typeof part === "number" ? `[${part}]` : index === 0 ? part : `.${part}`))
    .join("");
}

function offsetForIssue(doc: Document, path: (string | number)[], issue: z.core.$ZodIssue): number | undefined {
  if (issue.code === "unrecognized_keys") {
    const container = path.length === 0 ? doc.contents : doc.getIn(path, true);
    if (isMap(container)) {
      const pair = container.items.find((item) => isScalar(item.key) && issue.keys.includes(String(item.key.value)));
      if (pair && isNode(pair.key) && pair.key.range) return pair.key.range[0];
    }
  }
  // Walk up the path until a node exists: a missing key has no node, but its parent object does.
  for (let depth = path.length; depth >= 0; depth--) {
    const node: unknown = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth), true);
    if (isNode(node) && node.range) return node.range[0];
  }
  return undefined;
}

function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}
