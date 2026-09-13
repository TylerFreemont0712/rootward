import { describe, expect, it } from "vitest";
import type { DungeonPlan, LearnerSnapshot, PlannerCatalog, SessionLength } from "../src/index.ts";
import { planDungeon } from "../src/planner/plan.ts";
import { viewForLanguage } from "../src/planner/tracks.ts";
import { balance } from "./fixtures.ts";
import { planRequest, syntheticCatalog, syntheticLearner } from "./planner-fixtures.ts";

// Property tests (ideas/solutions/procedural-generation.md): plan many random dungeons and check the rules that
// must hold for every one of them, instead of a few hand-picked examples.
const SEEDS = 1000;
const LENGTHS: SessionLength[] = ["short", "standard", "long"];

function violations(plan: DungeonPlan, catalog: PlannerCatalog, learner: LearnerSnapshot): string[] {
  const problems: string[] = [];
  const rooms = new Map(plan.rooms.map((room) => [room.id, room]));
  const challenges = new Map(catalog.challenges.map((challenge) => [challenge.id, challenge]));
  const lastFloor = plan.floors.length - 1;

  if (plan.floors.length > balance.planner.session_rooms[plan.length]) problems.push("more floors than the session length");
  plan.floors.forEach((ids, floor) => {
    if (ids.length < 1 || ids.length > 3) problems.push(`floor ${floor} has ${ids.length} rooms`);
    for (const id of ids) if (rooms.get(id)?.floor !== floor) problems.push(`room ${id} is filed under the wrong floor`);
  });
  const bosses = plan.rooms.filter((room) => room.kind === "boss");
  if (bosses.length !== 1 || plan.floors[lastFloor]?.length !== 1 || bosses[0]?.floor !== lastFloor) {
    problems.push("the boss must be alone on the last floor");
  }
  if ((plan.floors[0] ?? []).some((id) => rooms.get(id)?.kind === "rest")) problems.push("a Rest opens the dungeon");

  for (const [from, to] of plan.edges) {
    const a = rooms.get(from);
    const b = rooms.get(to);
    if (a === undefined || b?.floor !== a.floor + 1) problems.push(`edge ${from}->${to} does not join consecutive floors`);
  }
  for (const room of plan.rooms) {
    if (room.floor < lastFloor && !plan.edges.some(([from]) => from === room.id)) problems.push(`${room.id} is a dead end`);
    if (room.floor > 0 && !plan.edges.some(([, to]) => to === room.id)) problems.push(`${room.id} is unreachable`);
  }

  for (const shrine of plan.rooms.filter((room) => room.kind === "shrine")) {
    if (plan.floors[shrine.floor]?.length !== 1) problems.push(`the Shrine on floor ${shrine.floor} can be skipped`);
    const fights = plan.rooms.filter((r) => r.nodeId === shrine.nodeId && (r.kind === "encounter" || r.kind === "elite"));
    if (!fights.some((r) => r.floor > shrine.floor)) problems.push(`the Shrine for ${shrine.nodeId} introduces nothing`);
    if (fights.some((r) => r.floor < shrine.floor && r.purpose === "frontier")) {
      problems.push(`${shrine.nodeId} is fought before its Shrine`);
    }
  }

  // A concept is never introduced before a prerequisite that the same dungeon introduces.
  const nodes = new Map(catalog.nodes.map((node) => [node.id, node]));
  const introduced = new Map<string, number>();
  for (const room of plan.rooms) {
    if (room.purpose !== "frontier" || room.nodeId === undefined) continue;
    introduced.set(room.nodeId, Math.min(introduced.get(room.nodeId) ?? Number.POSITIVE_INFINITY, room.floor));
  }
  for (const [nodeId, floor] of introduced) {
    for (const prerequisite of nodes.get(nodeId)?.prerequisites ?? []) {
      const before = introduced.get(prerequisite);
      if (before !== undefined && before >= floor) problems.push(`${nodeId} is introduced before its prerequisite ${prerequisite}`);
    }
  }

  // Fights never lean on a concept the player has not met: every concept of a fight's challenge is the room's own
  // concept, one at mastery 1 or more, or one this dungeon introduced by that floor.
  const view = viewForLanguage(catalog, learner, plan.language, balance.rating.initial_player);
  for (const room of plan.rooms) {
    const challenge = room.challengeId === undefined ? undefined : challenges.get(room.challengeId);
    if (!challenge || room.nodeId === undefined) continue;
    const familiar = new Set(view.equivalents(room.nodeId));
    for (const [nodeId, floor] of introduced) {
      if (floor <= room.floor) for (const id of view.equivalents(nodeId)) familiar.add(id);
    }
    for (const concept of challenge.concepts) {
      if (!familiar.has(concept) && view.mastery(concept) < 1) problems.push(`${room.id} needs ${concept}, which the player has not met`);
    }
  }

  const seen = new Set<string>();
  const repeatsAllowed = plan.rationale.some((entry) => entry.kind === "fallback" && entry.text.includes("repeats"));
  for (const room of plan.rooms) {
    if (room.kind !== "encounter" && room.kind !== "elite" && room.kind !== "boss") continue;
    const challenge = room.challengeId === undefined ? undefined : challenges.get(room.challengeId);
    if (!challenge) {
      problems.push(`${room.id} has no valid challenge`);
      continue;
    }
    if (!challenge.languages.includes(plan.language)) problems.push(`${room.id} uses a challenge without ${plan.language}`);
    if (room.kind !== "boss" && challenge.kind !== "encounter") problems.push(`${room.id} uses a boss challenge as a fight`);
    if (seen.has(challenge.id) && !repeatsAllowed) problems.push(`challenge ${challenge.id} appears twice`);
    seen.add(challenge.id);
  }
  const elites = plan.rooms.filter((room) => room.kind === "elite");
  if (elites.length > 1) problems.push("more than one Elite");
  for (const elite of elites) {
    const beside = plan.floors[elite.floor]?.map((id) => rooms.get(id)) ?? [];
    if (!beside.some((r) => r?.kind === "encounter" && r.nodeId === elite.nodeId)) problems.push("an Elite has no normal fight beside it");
  }
  return problems;
}

describe("planner properties", () => {
  it(`produces well-formed, correctly ordered dungeons for ${SEEDS} random catalogs and learners`, { timeout: 60_000 }, () => {
    const failures: string[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const seed = `property-${i}`;
      const catalog = syntheticCatalog(seed);
      const learner = syntheticLearner(seed, catalog);
      const result = planDungeon(planRequest({ seed, catalog, learner, length: LENGTHS[i % LENGTHS.length] ?? "long" }));
      if (!result.ok) {
        failures.push(`${seed}: ${result.error.message}`);
        continue;
      }
      for (const problem of violations(result.plan, catalog, learner)) failures.push(`${seed}: ${problem}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it("uses the full session length when content is plentiful", () => {
    const catalog = syntheticCatalog("plentiful", 30);
    const result = planDungeon(planRequest({ seed: "plentiful", catalog, learner: syntheticLearner("plentiful", catalog) }));
    expect(result.ok && result.plan.floors.length).toBe(balance.planner.session_rooms.long);
  });

  it("varies with the seed", () => {
    const catalog = syntheticCatalog("variety", 20);
    const learner = syntheticLearner("variety", catalog);
    const shapes = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const result = planDungeon(planRequest({ seed: `variety-${i}`, catalog, learner }));
        return result.ok ? JSON.stringify(result.plan.floors) + JSON.stringify(result.plan.rooms.map((r) => r.challengeId)) : "";
      }),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });
});
