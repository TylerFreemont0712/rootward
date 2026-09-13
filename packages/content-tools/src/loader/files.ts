import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { FileMap } from "../content-index.ts";

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** Names of subdirectories, sorted. A missing directory is an empty list, not an error. */
export async function listDirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** Names of regular files with the given extension, sorted. A missing directory is an empty list. */
export async function listFiles(dir: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(extension))
      .map((e) => e.name)
      .sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** Contents of an optional text file, or undefined when it does not exist. */
export async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Every regular file under `dir`, keyed by a forward-slash path relative to `dir`.
 * Symlinks are skipped on purpose: content is data and must not reach outside its folder.
 */
export async function readFileMap(dir: string): Promise<FileMap> {
  const files: FileMap = {};
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if (isNotFound(error)) return files;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, absolute).split(path.sep).join("/");
    files[relative] = await readFile(absolute, "utf8");
  }
  return files;
}
