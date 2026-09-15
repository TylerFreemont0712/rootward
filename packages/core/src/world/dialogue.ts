import type { Dialogue, DialogueChoice, DialogueNode, WorldCondition } from "@rootward/content-schema";

export type ConditionCheck = (condition: WorldCondition) => boolean;

/** The node a conversation opens on: the first opening whose condition holds, or undefined when none does. */
export function openingNode(dialogue: Dialogue, check: ConditionCheck): string | undefined {
  return dialogue.start.find((opening) => opening.if === undefined || check(opening.if))?.goto;
}

export interface OfferedChoice {
  /** The choice's position in the file, which is how a pick is named and re-checked later. */
  index: number;
  choice: DialogueChoice;
}

/** The choices a node offers right now; ones whose condition fails are hidden rather than shown disabled. */
export function offeredChoices(node: DialogueNode, check: ConditionCheck): OfferedChoice[] {
  return node.choices.flatMap((choice, index) => (choice.if === undefined || check(choice.if) ? [{ index, choice }] : []));
}

/**
 * Quests this conversation could hand out right now: every `start_quest` on a choice reachable from the opening node
 * through choices currently offered. It is what puts a "!" over someone's head. Effects along the way are not applied,
 * so this looks ahead at the conversation as it stands, which is what the player would find by talking.
 */
export function questsOffered(dialogue: Dialogue, check: ConditionCheck): Set<string> {
  const offered = new Set<string>();
  const opening = openingNode(dialogue, check);
  const seen = new Set<string>();
  const queue = opening === undefined ? [] : [opening];
  for (const nodeId of queue) {
    const node = dialogue.nodes[nodeId];
    if (seen.has(nodeId) || !node) continue;
    seen.add(nodeId);
    for (const { choice } of offeredChoices(node, check)) {
      for (const effect of choice.effects) if ("start_quest" in effect) offered.add(effect.start_quest);
      if (choice.goto !== undefined) queue.push(choice.goto);
    }
  }
  return offered;
}
