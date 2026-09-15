import type { Quest, QuestObjective, QuestStatus, WorldCondition } from "@rootward/content-schema";

// The world's rules (ADR-0011) as pure functions over a snapshot of the Maintainer's progress. The server builds the
// snapshot from SQLite and the learner model; nothing here reads the clock, the database, or the network.

/** What is stored per quest. `ready` is never stored: it is derived from the objectives each time. */
export type QuestState = "active" | "done";

export interface WorldProgress {
  flags: ReadonlySet<string>;
  quests: ReadonlyMap<string, QuestState>;
  /** Zone id -> ids of the markers won there. */
  cleared: ReadonlyMap<string, ReadonlySet<string>>;
  /** Mastery level (0-5) on a skill node; 0 when the node has no evidence yet. */
  mastery: (nodeId: string) => number;
}

/** Every quest in content, by id. */
export type QuestBook = ReadonlyMap<string, Quest>;

/** Whether the marker named by a `<zone id>/<marker id>` reference has been won. */
export function isCleared(progress: WorldProgress, ref: string): boolean {
  const [zoneId = "", markerId = ""] = ref.split("/");
  return progress.cleared.get(zoneId)?.has(markerId) ?? false;
}

export function holds(condition: WorldCondition, progress: WorldProgress, quests: QuestBook): boolean {
  // LEARN: `"all" in condition` is a type guard: inside the branch TypeScript knows which member of the union this
  // is, so `condition.all` type-checks without a cast.
  if ("all" in condition) return condition.all.every((part) => holds(part, progress, quests));
  if ("any" in condition) return condition.any.some((part) => holds(part, progress, quests));
  if ("not" in condition) return !holds(condition.not, progress, quests);
  if ("quest" in condition) {
    const quest = quests.get(condition.quest);
    return quest !== undefined && questStatus(quest, progress) === condition.status;
  }
  if ("flag" in condition) return progress.flags.has(condition.flag);
  if ("cleared" in condition) return isCleared(progress, condition.cleared);
  if ("cleared_in" in condition) return (progress.cleared.get(condition.cleared_in)?.size ?? 0) >= condition.at_least;
  return progress.mastery(condition.mastery) >= condition.at_least;
}

export interface ObjectiveProgress {
  done: boolean;
  /** Capped at `target`, so a journal never shows "4 of 3". */
  current: number;
  target: number;
}

/** How far along one objective is. Progress counts from the world as it is, not from when the quest started. */
export function objectiveProgress(objective: QuestObjective, progress: WorldProgress): ObjectiveProgress {
  const count = (current: number, target: number): ObjectiveProgress => ({
    done: current >= target,
    current: Math.min(current, target),
    target,
  });
  if ("cleared" in objective) return count(isCleared(progress, objective.cleared) ? 1 : 0, 1);
  if ("cleared_in" in objective) return count(progress.cleared.get(objective.cleared_in)?.size ?? 0, objective.at_least);
  if ("mastery" in objective) return count(progress.mastery(objective.mastery), objective.at_least);
  return count(progress.flags.has(objective.flag) ? 1 : 0, 1);
}

export function questStatus(quest: Quest, progress: WorldProgress): QuestStatus {
  const state = progress.quests.get(quest.id);
  if (state === undefined) return "not-started";
  if (state === "done") return "done";
  return quest.objectives.every((objective) => objectiveProgress(objective, progress).done) ? "ready" : "active";
}
