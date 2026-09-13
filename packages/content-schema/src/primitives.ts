import { z } from "zod";

// LEARN: every content id is lowercase segments joined by "." or "-" (py.collections.dict, tally-wisp). One shape for
// all ids keeps references greppable, safe to use as file names, and cheap to validate across packs.
export const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const Id = z.string().regex(ID_PATTERN, {
  error: "ids are lowercase letters and digits separated by '.' or '-'",
});

// Tags are looser than ids because error tags such as "n+1-query" need "+".
export const TAG_PATTERN = /^[a-z0-9][a-z0-9+#.-]*$/;
export const Tag = z.string().regex(TAG_PATTERN, {
  error: "tags are lowercase; allowed separators are '-', '.', '+', '#'",
});

export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
export const Semver = z.string().regex(SEMVER_PATTERN, { error: "must be a semantic version such as 1.2.3" });

// A deliberately small range grammar; content-tools/src/semver.ts implements matching for exactly these forms.
export const SEMVER_RANGE_PATTERN = /^(?:\*|(?:>=|\^|~)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;
export const SemverRange = z.string().regex(SEMVER_RANGE_PATTERN, {
  error: 'must be "*", "1.2.3", ">=1.2.3", "^1.2.3", or "~1.2.3"',
});

// Paths inside a content folder: relative, forward slashes, no "." or ".." segments. Runners receive file *contents*
// keyed by these paths, never host paths (PROMPT.md section 12.5).
export const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_\-./]+$/;
export const RelativePath = z.string().regex(RELATIVE_PATH_PATTERN, {
  error: "must be a relative path without '.' or '..' segments",
});

export const NonEmptyString = z.string().min(1);

/** Curriculum tier: 0 apprentice .. 4 master. */
export const Tier = z.int().min(0).max(4);
