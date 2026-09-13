import { isLanguageNode, LANGUAGE_TRACKS, trackOf } from "../planner/tracks.ts";
import type { PlannerNode } from "../planner/types.ts";

/**
 * The skill nodes a fight counts for (ADR-0009). Played in the challenge's own track, each concept is credited as
 * tagged. Played in another language, a concept goes to that language's node for the same topic and concept when one
 * exists (`py.collections.dict` played in JavaScript credits `js.collections.dict`), and otherwise to the shared
 * concept (`concept.mappings`), which is where the other language's track reads its progress.
 */
export function creditedNodes(
  concepts: readonly string[],
  language: string,
  nodes: ReadonlyMap<string, PlannerNode>,
): string[] {
  const track = LANGUAGE_TRACKS[language];
  const credited = new Set<string>();
  for (const concept of concepts) {
    if (!isLanguageNode(concept) || trackOf(concept) === track) {
      credited.add(concept);
      continue;
    }
    const counterpart = track === undefined ? undefined : `${track}${concept.slice(trackOf(concept).length)}`;
    if (counterpart !== undefined && nodes.has(counterpart)) credited.add(counterpart);
    else credited.add(nodes.get(concept)?.transfersTo ?? concept);
  }
  return [...credited];
}
