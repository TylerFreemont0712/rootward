import { shuffled } from "../rng.ts";
import { type ChallengePick, rankChallenges, type RankedNode, rankFrontier, rankPractice } from "./select.ts";
import { isLanguageNode, type TrackView } from "./tracks.ts";
import type { PlanRequest, RationaleEntry, RoomKind, RoomPurpose } from "./types.ts";

// The spine is the dungeon's main line: one room per floor, in teaching order. Branches (branches.ts) only ever add
// same-floor alternatives that are safe substitutes, so every path through the map keeps the spine's ordering.

export interface Slot {
  kind: RoomKind;
  purpose: RoomPurpose;
  nodeId?: string;
  pick?: ChallengePick;
  targetSuccess?: number;
  cardIds?: string[];
  puzzleIds?: string[];
}

export interface Spine {
  slots: Slot[];
  boss: Slot;
  nodes: RankedNode[];
}

const REST_CARDS = 5;
const PUZZLE_ITEMS = { min: 3, max: 5 };

const percent = (p: number) => `${Math.round(p * 100)}%`;

export function buildSpine(
  request: PlanRequest,
  view: TrackView,
  rng: () => number,
  rationale: RationaleEntry[],
): Spine | undefined {
  const { planner } = request.balance;
  const targets = planner.target_success;
  const capacity = planner.session_rooms[request.length] - 1;
  const used = new Set<string>();
  const hasEncounter = (ranked: RankedNode) =>
    rankChallenges(request, view, { nodeId: ranked.node.id, kind: "encounter", target: targets.frontier, exclude: used })
      .length > 0;

  // Frontier concepts that have something to fight. Fall back to any concept with content rather than an empty run.
  let nodes = rankFrontier(request, view, rng).filter(hasEncounter);
  if (nodes.length === 0) {
    nodes = rankPractice(request, view, rng).filter(hasEncounter);
    if (nodes.length > 0) {
      rationale.push({
        kind: "fallback",
        text: `No frontier concept has a ${request.language} challenge yet, so this dungeon practices concepts that do.`,
      });
    }
  }
  nodes = nodes.slice(0, planner.frontier_nodes_per_run.max);

  const blocks: Slot[][] = [];
  const chosen: RankedNode[] = [];
  for (const ranked of nodes) {
    const id = ranked.node.id;
    const pick = rankChallenges(request, view, { nodeId: id, kind: "encounter", target: targets.frontier, exclude: used })[0];
    if (!pick) continue;
    used.add(pick.challenge.id);
    chosen.push(ranked);
    const block: Slot[] = [];
    if (ranked.progress.mastery === 0) {
      // A Shrine always precedes the first Encounter of a brand-new concept (PROMPT.md section 8).
      if (request.catalog.lessons.has(id)) block.push({ kind: "shrine", purpose: "frontier", nodeId: id });
      else rationale.push({ kind: "fallback", nodeId: id, text: `${id} is new to you, but it has no Shrine lesson yet.` });
    }
    block.push({ kind: "encounter", purpose: "frontier", nodeId: id, pick, targetSuccess: targets.frontier });
    blocks.push(block);
    rationale.push({
      kind: "frontier",
      nodeId: id,
      text: `Frontier: ${id} (mastery ${ranked.progress.mastery}, rating ${Math.round(ranked.progress.rating)}) with "${pick.challenge.id}" at difficulty ${pick.challenge.difficulty}, about ${percent(pick.expected)} expected success.`,
    });
  }
  if (blocks.length === 0) return undefined;

  const reviews = reviewSlots(request, view, used, rationale);
  const puzzle = interleaveSlot(request, view, chosen, rng, rationale);
  const ordered: Slot[] = [
    ...(blocks[0] ?? []),
    ...(puzzle ? [puzzle] : []),
    ...(blocks[1] ?? []),
    ...reviews,
    ...blocks.slice(2).flat(),
  ];

  // Spaced practice fills the remaining floors: another, slightly harder fight for each concept in turn.
  let practiced = 0;
  for (let round = 1; ordered.length < capacity; round++) {
    let added = false;
    for (const ranked of chosen) {
      if (ordered.length >= capacity) break;
      const target = Math.max(0.05, targets.frontier - 0.1 * round);
      const pick = rankChallenges(request, view, { nodeId: ranked.node.id, kind: "encounter", target, exclude: used })[0];
      if (!pick) continue;
      used.add(pick.challenge.id);
      ordered.push({ kind: "encounter", purpose: "practice", nodeId: ranked.node.id, pick, targetSuccess: target });
      practiced += 1;
      added = true;
    }
    if (!added) break;
  }
  if (practiced > 0) {
    rationale.push({ kind: "frontier", text: `${practiced} practice fight(s) revisit this run's concepts at a harder level.` });
  }

  // Too many rooms: drop from the end, never leaving a Shrine without the Encounter it introduces.
  while (ordered.length > capacity) {
    ordered.pop();
    while (ordered.at(-1)?.kind === "shrine") ordered.pop();
  }
  // Never open with a Rest.
  if (ordered[0]?.kind === "rest" && ordered.length > 1) {
    const [first, second] = [ordered[0], ordered[1]];
    if (second) ordered.splice(0, 2, second, first);
  }
  if (ordered.length < capacity) {
    rationale.push({
      kind: "fallback",
      text: `Only ${ordered.length + 1} rooms of content fit, so this ${request.length} expedition is shorter than usual.`,
    });
  }

  const boss = bossSlot(request, view, chosen, used, rationale);
  return boss ? { slots: ordered, boss, nodes: chosen } : undefined;
}

/** A Rest with due cards, plus an easy review fight for the most urgent concept (PROMPT.md section 10, step 1). */
function reviewSlots(request: PlanRequest, view: TrackView, used: Set<string>, rationale: RationaleEntry[]): Slot[] {
  const applicable = new Set(view.applicable.map((node) => node.id));
  const reviewable = (id: string) => applicable.has(id) || !isLanguageNode(id);
  const cards = request.learner.dueCards.filter((card) => reviewable(card.nodeId)).slice(0, REST_CARDS);
  const rotting = view.applicable.filter((node) => view.progress(node.id).rotting).map((node) => node.id);
  const slots: Slot[] = [];

  if (cards.length > 0) {
    slots.push({ kind: "rest", purpose: "review", cardIds: cards.map((card) => card.cardId) });
    const nodes = [...new Set(cards.map((card) => card.nodeId))];
    rationale.push({ kind: "review", text: `Due for review: ${cards.length} card(s) on ${nodes.join(", ")}, answered at a Rest.` });
  }
  const urgent = rotting[0] ?? cards[0]?.nodeId;
  if (urgent !== undefined) {
    const target = request.balance.planner.target_success.review;
    const pick = rankChallenges(request, view, { nodeId: urgent, kind: "encounter", target, exclude: used })[0];
    if (pick) {
      used.add(pick.challenge.id);
      slots.push({ kind: "encounter", purpose: "review", nodeId: urgent, pick, targetSuccess: target });
      const why = rotting.includes(urgent) ? "is rotting" : "is due";
      rationale.push({ kind: "review", nodeId: urgent, text: `${urgent} ${why}, so an easier fight ("${pick.challenge.id}") keeps it fresh.` });
    }
  }
  return slots;
}

/** One room of quick puzzles on concepts at mastery 2-4 and this run's concepts (PROMPT.md section 10, step 5). */
function interleaveSlot(
  request: PlanRequest,
  view: TrackView,
  chosen: readonly RankedNode[],
  rng: () => number,
  rationale: RationaleEntry[],
): Slot | undefined {
  const concepts = new Set<string>();
  const include = (id: string) => {
    for (const equivalent of view.equivalents(id)) concepts.add(equivalent);
  };
  for (const node of view.applicable) {
    const mastery = view.progress(node.id).mastery;
    if (mastery >= 2 && mastery <= 4) include(node.id);
  }
  for (const ranked of chosen) include(ranked.node.id);

  const candidates = request.catalog.puzzles
    .filter((puzzle) => puzzle.concepts.some((concept) => concepts.has(concept)))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length < PUZZLE_ITEMS.min) {
    rationale.push({ kind: "fallback", text: "Not enough puzzles exist yet for an interleaving Puzzle room." });
    return undefined;
  }
  const puzzleIds = shuffled(candidates, rng)
    .slice(0, PUZZLE_ITEMS.max)
    .map((puzzle) => puzzle.id);
  rationale.push({ kind: "interleave", text: `A Puzzle room mixes ${puzzleIds.length} quick items from concepts you are consolidating.` });
  return { kind: "puzzle", purpose: "interleave", puzzleIds };
}

/**
 * The Legacy System (PROMPT.md section 10, step 6): a boss whose concepts this run and your mastered nodes cover. With
 * none available, the hardest unused fight stands in; with nothing unused, a fight repeats (and the rationale says so).
 */
function bossSlot(
  request: PlanRequest,
  view: TrackView,
  chosen: readonly RankedNode[],
  used: Set<string>,
  rationale: RationaleEntry[],
): Slot | undefined {
  const primary = chosen[0];
  if (!primary) return undefined;
  const target = request.balance.planner.target_success.elite;
  const runConcepts = new Set(chosen.flatMap((ranked) => [...view.equivalents(ranked.node.id)]));
  const covered = new Set(runConcepts);
  for (const node of view.applicable) {
    if (view.progress(node.id).mastery >= 3) for (const id of view.equivalents(node.id)) covered.add(id);
  }

  const boss = request.catalog.challenges
    .filter(
      (c) => c.kind === "boss" && c.languages.includes(request.language) && !used.has(c.id) && c.concepts.every((id) => covered.has(id)),
    )
    .map((challenge) => ({ challenge, overlap: challenge.concepts.filter((id) => runConcepts.has(id)).length }))
    .sort((a, b) => b.overlap - a.overlap || a.challenge.id.localeCompare(b.challenge.id))[0];
  if (boss) {
    used.add(boss.challenge.id);
    const pick = rankChallenges(request, view, { nodeId: primary.node.id, kind: "boss", target, exclude: new Set() }).find(
      (candidate) => candidate.challenge.id === boss.challenge.id,
    ) ?? { challenge: boss.challenge, expected: 0.5, fresh: true };
    rationale.push({ kind: "boss", text: `Boss: "${boss.challenge.id}" brings together ${boss.challenge.concepts.join(", ")}.` });
    return { kind: "boss", purpose: "boss", nodeId: primary.node.id, pick, targetSuccess: target };
  }

  for (const ranked of chosen) {
    const pick = rankChallenges(request, view, { nodeId: ranked.node.id, kind: "encounter", target, exclude: used })[0];
    if (!pick) continue;
    used.add(pick.challenge.id);
    rationale.push({
      kind: "boss",
      text: `No boss challenge fits this run yet, so "${pick.challenge.id}" stands in as the Legacy System.`,
    });
    return { kind: "boss", purpose: "boss", nodeId: ranked.node.id, pick, targetSuccess: target };
  }

  const repeat = rankChallenges(request, view, { nodeId: primary.node.id, kind: "encounter", target, exclude: new Set() })[0];
  if (!repeat) return undefined;
  rationale.push({
    kind: "fallback",
    text: `Content is thin: the boss repeats "${repeat.challenge.id}" because no other fight is available.`,
  });
  return { kind: "boss", purpose: "boss", nodeId: primary.node.id, pick: repeat, targetSuccess: target };
}
