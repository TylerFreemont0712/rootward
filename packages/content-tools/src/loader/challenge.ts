import path from "node:path";
import { ChallengeManifest, IoTestFile, type Language, splitHintLadder } from "@rootward/content-schema";
import type { FileMap, LoadedChallenge } from "../content-index.ts";
import { readText, readYamlFile } from "../yaml.ts";
import { displayPath, type LoadContext } from "./context.ts";
import { readFileMap, readOptionalText } from "./files.ts";

/**
 * Load one challenge folder (PROMPT.md section 13.1). Missing required files are reported as diagnostics; semantic
 * checks such as test-count drift live in validate/challenges.ts so loading stays simple.
 */
export async function loadChallenge(
  ctx: LoadContext,
  packId: string,
  absoluteDir: string,
): Promise<LoadedChallenge | undefined> {
  const dir = displayPath(ctx, absoluteDir);
  const at = (file: string) => [path.join(absoluteDir, file), `${dir}/${file}`] as const;

  const manifest = await readYamlFile(...at("challenge.yaml"), ChallengeManifest, ctx.diagnostics);
  if (!manifest) return undefined;

  const prompt = await readText(...at("prompt.md"), ctx.diagnostics);
  const hintsText = await readText(...at("hints.md"), ctx.diagnostics);
  if (prompt === undefined || hintsText === undefined) return undefined;

  const starter: Partial<Record<Language, FileMap>> = {};
  const solution: Partial<Record<Language, FileMap>> = {};
  for (const language of manifest.languages) {
    starter[language] = await readFileMap(path.join(absoluteDir, "starter", language));
    solution[language] = await readFileMap(path.join(absoluteDir, "solution", language));
  }

  const challenge: LoadedChallenge = {
    manifest,
    packId,
    dir,
    prompt,
    hints: splitHintLadder(hintsText),
    starter,
    solution,
  };

  const lesson = await readOptionalText(path.join(absoluteDir, "lesson.md"));
  if (lesson !== undefined) challenge.lesson = lesson;
  const explanation = await readOptionalText(path.join(absoluteDir, "explanation.md"));
  if (explanation !== undefined) challenge.explanation = explanation;

  if (manifest.tests.form === "io") {
    const visible = await readYamlFile(...at("tests/io.yaml"), IoTestFile, ctx.diagnostics);
    const hidden = await readYamlFile(...at("hidden/io.yaml"), IoTestFile, ctx.diagnostics);
    if (visible) challenge.visibleTests = visible;
    if (hidden) challenge.hiddenTests = hidden;
  } else {
    ctx.diagnostics.warn("unsupported-test-form", `test form "${manifest.tests.form}" is not supported yet`, {
      file: `${dir}/challenge.yaml`,
    });
  }
  return challenge;
}
