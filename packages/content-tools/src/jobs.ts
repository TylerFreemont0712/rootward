import { type IoCase, type Language, resolveStdin } from "@rootward/content-schema";
import type { IoTestCaseSpec, RunJob, RunLimits } from "@rootward/runners";
import type { FileMap, LoadedChallenge } from "./content-index.ts";

export interface IoCaseSelection {
  visible: boolean;
  /** Non-reserve hidden cases. */
  hidden: boolean;
  /** Reserve cases to include (revealed by Edge Case); every reserve case when "all". */
  reserve: readonly string[] | "all";
}

/** The io cases a job should run, in file order: visible, hidden, then the selected reserve cases. */
export function selectIoCases(challenge: LoadedChallenge, selection: IoCaseSelection): IoCase[] {
  const visible = selection.visible ? (challenge.visibleTests?.cases ?? []) : [];
  const hiddenCases = challenge.hiddenTests?.cases ?? [];
  const hidden = selection.hidden ? hiddenCases.filter((c) => !c.reserve) : [];
  const reserve = hiddenCases.filter(
    (c) => c.reserve && (selection.reserve === "all" || selection.reserve.includes(c.id)),
  );
  return [...visible, ...hidden, ...reserve];
}

/**
 * Build a runner job that executes `files` against io cases of a challenge. Used both by content validation (with
 * the reference solution) and by the server (with the player's code). Returns undefined for non-io challenges or a
 * language without an entry file.
 */
export function buildIoJob(
  challenge: LoadedChallenge,
  language: Language,
  files: FileMap,
  cases: readonly IoCase[],
  limits: RunLimits,
): RunJob | undefined {
  const entry = challenge.manifest.tests.entry[language];
  if (challenge.manifest.tests.form !== "io" || entry === undefined) return undefined;
  const normalize = challenge.visibleTests?.normalize ?? challenge.hiddenTests?.normalize;
  return {
    language,
    kind: "tests",
    entry,
    files,
    limits,
    testSpec: {
      form: "io",
      normalize: {
        trailingWhitespace: normalize?.trailing_whitespace ?? true,
        newlines: normalize?.newlines ?? true,
      },
      cases: cases.map(
        (c): IoTestCaseSpec => ({ id: c.id, name: c.name, stdin: resolveStdin(c), expectedStdout: c.expected_stdout }),
      ),
    },
  };
}
