import { HINT_LEVELS } from "@rootward/content-schema";
import { countCodeLines, findBannedTokens } from "@rootward/runners";
import type { LoadedChallenge } from "../content-index.ts";
import type { Diagnostics } from "../diagnostics.ts";

const MAX_PROMPT_WORDS = 150;

/**
 * Semantic checks for one challenge folder that do not need to run code: hint ladder, per-language files, test
 * counts, reserve cases, and whether the reference solution satisfies the challenge's own static constraints.
 * Quality rules come from ideas/solutions/content-pipeline.md.
 */
export function validateChallenge(challenge: LoadedChallenge, diagnostics: Diagnostics): void {
  const { manifest, dir } = challenge;
  const manifestFile = `${dir}/challenge.yaml`;

  if (challenge.hints.length !== HINT_LEVELS) {
    diagnostics.error(
      "hints",
      `hints.md has ${challenge.hints.length} levels; it needs exactly ${HINT_LEVELS} separated by lines containing only ---`,
      { file: `${dir}/hints.md` },
    );
  } else {
    challenge.hints.forEach((hint, level) => {
      if (hint.length === 0) diagnostics.error("hints", `hint level ${level + 1} is empty`, { file: `${dir}/hints.md` });
    });
  }

  const words = challenge.prompt.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
  if (words > MAX_PROMPT_WORDS) {
    diagnostics.warn("prompt-length", `prompt.md has ${words} words outside code blocks; aim for ${MAX_PROMPT_WORDS}`, {
      file: `${dir}/prompt.md`,
    });
  }
  if (challenge.explanation === undefined) {
    diagnostics.warn("explanation", "no explanation.md; Retreat will show the reference solution without one", {
      file: dir,
    });
  }

  for (const language of manifest.languages) {
    const entry = manifest.tests.entry[language];
    const folders = [
      ["starter", challenge.starter[language]],
      ["solution", challenge.solution[language]],
    ] as const;
    for (const [folder, files] of folders) {
      if (!files || Object.keys(files).length === 0) {
        diagnostics.error("missing-files", `${folder}/${language}/ is missing or empty`, { file: dir });
      } else if (entry !== undefined && files[entry] === undefined) {
        diagnostics.error("missing-entry", `${folder}/${language}/${entry} (tests.entry.${language}) does not exist`, {
          file: manifestFile,
        });
      }
    }

    const solution = Object.values(challenge.solution[language] ?? {});
    const { max_lines: maxLines, banned_tokens: bannedTokens } = manifest.constraints;
    if (maxLines !== undefined) {
      const lines = solution.reduce((sum, source) => sum + countCodeLines(source, language), 0);
      if (lines > maxLines) {
        diagnostics.error(
          "constraint-unsatisfiable",
          `the ${language} reference solution has ${lines} code lines but constraints.max_lines is ${maxLines}`,
          { file: manifestFile },
        );
      }
    }
    const banned = [...new Set(solution.flatMap((source) => findBannedTokens(source, language, bannedTokens)))];
    if (banned.length > 0) {
      diagnostics.error(
        "constraint-unsatisfiable",
        `the ${language} reference solution uses banned tokens: ${banned.join(", ")}`,
        { file: manifestFile },
      );
    }
  }

  if (manifest.tests.form === "io") validateIoTests(challenge, diagnostics);
}

function validateIoTests(challenge: LoadedChallenge, diagnostics: Diagnostics): void {
  const { manifest, dir, visibleTests, hiddenTests } = challenge;
  const manifestFile = `${dir}/challenge.yaml`;

  if (visibleTests) {
    if (visibleTests.cases.some((c) => c.reserve)) {
      diagnostics.error("reserve-visible", "reserve cases belong in hidden/io.yaml", { file: `${dir}/tests/io.yaml` });
    }
    if (visibleTests.cases.length !== manifest.tests.visible) {
      diagnostics.error(
        "test-count",
        `tests.visible is ${manifest.tests.visible} but tests/io.yaml has ${visibleTests.cases.length} cases`,
        { file: manifestFile },
      );
    }
  }

  if (hiddenTests) {
    const active = hiddenTests.cases.filter((c) => !c.reserve);
    if (active.length !== manifest.tests.hidden) {
      diagnostics.error(
        "test-count",
        `tests.hidden is ${manifest.tests.hidden} but hidden/io.yaml has ${active.length} non-reserve cases`,
        { file: manifestFile },
      );
    }
    for (const testCase of hiddenTests.cases) {
      if (testCase.category !== undefined) continue;
      if (testCase.reserve) {
        diagnostics.error("reserve-category", `reserve case ${testCase.id} needs a category for Edge Case to find it`, {
          file: `${dir}/hidden/io.yaml`,
        });
      } else {
        diagnostics.warn("hidden-category", `hidden case ${testCase.id} has no category; players will see "hidden"`, {
          file: `${dir}/hidden/io.yaml`,
        });
      }
    }
  }

  const ids = [...(visibleTests?.cases ?? []), ...(hiddenTests?.cases ?? [])].map((c) => c.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    diagnostics.error("duplicate-test-id", `test ids must be unique across tests/ and hidden/: ${duplicates.join(", ")}`, {
      file: manifestFile,
    });
  }
}
