import type { WorldEffect, WorldScreen } from "@rootward/content-schema";
import type { DomainError } from "../result.ts";
import { type QuestBook, type QuestState, questStatus, type WorldProgress } from "./conditions.ts";

export interface EffectOutcome {
  flags: ReadonlySet<string>;
  quests: ReadonlyMap<string, QuestState>;
  /** A screen for the client to open, when an effect asked for one. */
  open?: WorldScreen;
  /** One line per change the player should hear about, such as "Quest started: The Foundry Cools". */
  notices: string[];
}

export type EffectResult = { ok: true; outcome: EffectOutcome } | { ok: false; error: DomainError };

/**
 * Apply effects in order, each one seeing the changes before it, without touching `progress`. Content can ask for
 * something impossible (finishing a quest whose objectives are not met); that is refused, not thrown, because a
 * choice's `if` normally prevents it and the player should see a message rather than a crash.
 */
export function applyEffects(effects: readonly WorldEffect[], progress: WorldProgress, quests: QuestBook): EffectResult {
  const flags = new Set(progress.flags);
  const states = new Map(progress.quests);
  const notices: string[] = [];
  let open: WorldScreen | undefined;
  const refuse = (code: string, message: string): EffectResult => ({ ok: false, error: { code, message } });

  for (const effect of effects) {
    if ("start_quest" in effect) {
      const quest = quests.get(effect.start_quest);
      if (!quest) return refuse("unknown-quest", `There is no quest "${effect.start_quest}".`);
      if (states.has(quest.id)) return refuse("quest-already-started", `${quest.name} is already in your journal.`);
      states.set(quest.id, "active");
      notices.push(`Quest started: ${quest.name}`);
    } else if ("complete_quest" in effect) {
      const quest = quests.get(effect.complete_quest);
      if (!quest) return refuse("unknown-quest", `There is no quest "${effect.complete_quest}".`);
      const status = questStatus(quest, { ...progress, flags, quests: states });
      if (status !== "ready") {
        return refuse("quest-not-ready", status === "done" ? `${quest.name} is already done.` : `${quest.name} is not finished yet.`);
      }
      states.set(quest.id, "done");
      for (const flag of quest.rewards.flags) flags.add(flag);
      notices.push(`Quest complete: ${quest.name}`);
    } else if ("set_flag" in effect) {
      flags.add(effect.set_flag);
    } else {
      open = effect.open;
    }
  }
  return { ok: true, outcome: { flags, quests: states, notices, ...(open !== undefined ? { open } : {}) } };
}
