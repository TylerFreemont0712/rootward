import { z } from "zod";
import { Id, NonEmptyString, Semver, SemverRange } from "./primitives.ts";

export const PackDependency = z.strictObject({
  id: Id,
  range: SemverRange,
});
export type PackDependency = z.infer<typeof PackDependency>;

/** `pack.yaml`: identity, version, and engine compatibility of one content pack. */
export const PackManifest = z.strictObject({
  id: Id,
  name: NonEmptyString,
  version: Semver,
  engine_range: SemverRange,
  dependencies: z.array(PackDependency).default([]),
  description: NonEmptyString,
});
export type PackManifest = z.infer<typeof PackManifest>;
