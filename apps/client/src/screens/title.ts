import type { ProfileSummaryView, ProfileView } from "@rootward/shared";

/** The character played last comes first, then the newest. */
export function orderProfiles(profiles: readonly ProfileView[], lastProfileId: string | undefined): ProfileView[] {
  return [...profiles].sort(
    (a, b) => Number(b.id === lastProfileId) - Number(a.id === lastProfileId) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** One line about where a character is and what they are doing there. */
export function whereabouts(summary: ProfileSummaryView | undefined): string {
  if (!summary) return "";
  const fights = `${summary.fights} ${summary.fights === 1 ? "fight" : "fights"}`;
  if (summary.zoneName === undefined) return `${fights} · has not arrived in the Bastion yet`;
  const quests = summary.questsActive === 0 ? "no quests under way" : `${summary.questsActive} ${summary.questsActive === 1 ? "quest" : "quests"} under way`;
  return `In ${summary.zoneName} · ${quests} · ${fights}`;
}
