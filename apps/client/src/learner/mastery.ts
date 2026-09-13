/** Mastery levels by number (PROMPT.md section 9.2). */
export const MASTERY_NAMES = ["Unseen", "Seen", "Assisted", "Unaided", "Retained", "Mastered"] as const;

export function masteryName(level: number): string {
  return MASTERY_NAMES[level] ?? `level ${level}`;
}

/** Width of a mastery bar, as a CSS percentage. */
export function masteryWidth(level: number): string {
  return `${Math.max(0, Math.min(100, (level / (MASTERY_NAMES.length - 1)) * 100))}%`;
}
