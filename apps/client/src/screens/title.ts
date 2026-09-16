import type { ProfileSummaryView, ProfileView } from "@rootward/shared";
import type { MessageKey } from "../i18n/index.ts";

/** The character played last comes first, then the newest. */
export function orderProfiles(profiles: readonly ProfileView[], lastProfileId: string | undefined): ProfileView[] {
  return [...profiles].sort(
    (a, b) => Number(b.id === lastProfileId) - Number(a.id === lastProfileId) || b.createdAt.localeCompare(a.createdAt),
  );
}

type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

/**
 * One line about where a character is and what they are doing there.
 *
 * The plural forms are two keys and a ternary rather than ICU `{n, plural, ...}` (ADR-0017): English is the only
 * locale here that inflects, Japanese translates both keys to the same string, and two keys cost less than a message
 * syntax. `Intl.PluralRules` is the answer when a locale with more than two forms arrives.
 */
export function whereabouts(summary: ProfileSummaryView | undefined, t: Translate): string {
  if (!summary) return "";
  const fights = t(summary.fights === 1 ? "title.fights.one" : "title.fights.many", { count: summary.fights });
  if (summary.zoneName === undefined) return t("title.notArrived", { fights });
  const quests =
    summary.questsActive === 0
      ? t("title.quests.none")
      : t(summary.questsActive === 1 ? "title.quests.one" : "title.quests.many", { count: summary.questsActive });
  return t("title.where", { zone: summary.zoneName, quests, fights });
}
