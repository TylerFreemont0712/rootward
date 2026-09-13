import { shuffled } from "../rng.ts";
import { rankChallenges } from "./select.ts";
import type { Slot, Spine } from "./spine.ts";
import type { TrackView } from "./tracks.ts";
import type { PlanRequest, PlanRoom, RationaleEntry } from "./types.ts";

// Branching (PROMPT.md section 10, step 7). Only Encounter floors get alternatives, and only for the same concept:
// a different fight, or an optional harder Elite. Shrine, Rest, Puzzle, and Boss floors keep one room. Because every
// alternative is a safe substitute for its floor, every path satisfies the spine's ordering by construction.

export interface FloorLayout {
  rooms: PlanRoom[];
  floors: string[][];
  edges: [string, string][];
}

const MAX_CHOICES = 3;

export function roomId(floor: number, index: number): string {
  return `f${floor}-r${index}`;
}

export function branchFloors(
  request: PlanRequest,
  view: TrackView,
  spine: Spine,
  rng: () => number,
  rationale: RationaleEntry[],
): FloorLayout {
  const targets = request.balance.planner.target_success;
  const used = new Set(
    [...spine.slots, spine.boss].flatMap((slot) => (slot.pick ? [slot.pick.challenge.id] : [])),
  );
  let stretchPlaced = false;

  const choicesPerFloor: Slot[][] = spine.slots.map((slot) => {
    const choices: Slot[] = [slot];
    const nodeId = slot.nodeId;
    if (slot.kind !== "encounter" || nodeId === undefined || !slot.pick) return choices;
    if (slot.purpose !== "frontier" && slot.purpose !== "practice") return choices;
    // Alternatives may use exactly the concepts the fight they replace could use.
    const familiar = slot.familiar ?? new Set<string>();

    if (!stretchPlaced && rng() < request.balance.planner.stretch_probability) {
      const elite = rankChallenges(request, view, { nodeId, kind: "encounter", target: targets.elite, exclude: used, familiar })[0];
      // An Elite has to be a real step up from the fight it sits beside.
      if (elite && elite.expected < slot.pick.expected) {
        used.add(elite.challenge.id);
        choices.push({ kind: "elite", purpose: "stretch", nodeId, pick: elite, targetSuccess: targets.elite, familiar });
        stretchPlaced = true;
        rationale.push({
          kind: "stretch",
          nodeId,
          text: `Stretch: an optional Elite ("${elite.challenge.id}", about ${Math.round(elite.expected * 100)}% expected success) pays better and hurts more.`,
        });
      }
    }
    if (choices.length < MAX_CHOICES) {
      const target = slot.targetSuccess ?? targets.frontier;
      const other = rankChallenges(request, view, { nodeId, kind: "encounter", target, exclude: used, familiar })[0];
      if (other) {
        used.add(other.challenge.id);
        choices.push({ kind: "encounter", purpose: slot.purpose, nodeId, pick: other, targetSuccess: target, familiar });
      }
    }
    return shuffled(choices, rng);
  });
  choicesPerFloor.push([spine.boss]);

  const rooms = choicesPerFloor.flatMap((choices, floor) => choices.map((slot, index) => toRoom(slot, floor, index)));
  const floors = choicesPerFloor.map((choices, floor) => choices.map((_, index) => roomId(floor, index)));
  const edges = floors.slice(1).flatMap((lower, index) => connect(floors[index] ?? [], lower));
  return { rooms, floors, edges };
}

/**
 * Connect two consecutive floors by relative position: a room links to rooms below it whose position across the floor
 * is within half the width. For floors of one to three rooms, every room gets at least one link in and out.
 */
export function connect(upper: readonly string[], lower: readonly string[]): [string, string][] {
  const position = (index: number, count: number) => (index + 0.5) / count;
  const edges: [string, string][] = [];
  upper.forEach((from, i) => {
    lower.forEach((to, j) => {
      if (Math.abs(position(i, upper.length) - position(j, lower.length)) <= 0.5) edges.push([from, to]);
    });
  });
  return edges;
}

function toRoom(slot: Slot, floor: number, index: number): PlanRoom {
  const room: PlanRoom = { id: roomId(floor, index), floor, kind: slot.kind, purpose: slot.purpose };
  if (slot.nodeId !== undefined) room.nodeId = slot.nodeId;
  if (slot.pick) {
    room.challengeId = slot.pick.challenge.id;
    room.expectedSuccess = Math.round(slot.pick.expected * 1000) / 1000;
  }
  if (slot.targetSuccess !== undefined) room.targetSuccess = Math.round(slot.targetSuccess * 1000) / 1000;
  if (slot.cardIds) room.cardIds = [...slot.cardIds];
  if (slot.puzzleIds) room.puzzleIds = [...slot.puzzleIds];
  return room;
}
