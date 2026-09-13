// A deliberately tiny semver implementation for pack compatibility checks. It supports exactly the range forms the
// schema allows ("*", "1.2.3", ">=1.2.3", "^1.2.3", "~1.2.3") and ignores prerelease tags when comparing.
// LEARN: pulling in the full `semver` package would work too; this is small enough to read in one sitting and shows
// what "^" and "~" actually mean.

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const RANGE = /^(>=|\^|~)?(\d+\.\d+\.\d+)$/;

export function parseVersion(text: string): Version | undefined {
  const match = VERSION.exec(text);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function satisfies(versionText: string, range: string): boolean {
  if (range === "*") return true;
  const version = parseVersion(versionText);
  const match = RANGE.exec(range);
  const base = match?.[2] === undefined ? undefined : parseVersion(match[2]);
  if (!version || !match || !base) return false;
  const atLeast = compareVersions(version, base) >= 0;
  switch (match[1]) {
    case ">=":
      return atLeast;
    case "^":
      // ^1.2.3 := >=1.2.3 <2.0.0; ^0.2.3 := >=0.2.3 <0.3.0; ^0.0.3 := exactly 0.0.3
      if (base.major > 0) return atLeast && version.major === base.major;
      if (base.minor > 0) return atLeast && version.major === 0 && version.minor === base.minor;
      return compareVersions(version, base) === 0;
    case "~":
      return atLeast && version.major === base.major && version.minor === base.minor;
    default:
      return compareVersions(version, base) === 0;
  }
}
