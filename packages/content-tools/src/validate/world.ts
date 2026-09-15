import { type Dialogue, type GridPoint, type WorldCondition, type WorldEffect, zoneRows } from "@rootward/content-schema";
import type { ContentIndex } from "../content-index.ts";
import { at, type Diagnostics } from "../diagnostics.ts";

/**
 * World checks (ADR-0011): references between zones, terrain, props, NPCs, and quests; conversations whose every step
 * leads somewhere; and zones where every marker, portal, and person can actually be walked to from the entry.
 */
export function validateWorld(index: ContentIndex, diagnostics: Diagnostics): void {
  const missing = (file: string, field: string, kind: string, id: string) => {
    diagnostics.error("missing-reference", `${field} refers to unknown ${kind} "${id}"`, { file });
  };
  const flagsSet = new Set<string>();
  const flagsRead: { flag: string; file: string }[] = [];
  const questsStarted = new Set<string>();

  const checkMarkerRef = (ref: string, file: string, field: string) => {
    const [zoneId = "", markerId = ""] = ref.split("/");
    const zone = index.zones.get(zoneId)?.value;
    if (!zone) missing(file, field, "zone", zoneId);
    else if (!zone.markers.some((marker) => marker.id === markerId)) missing(file, field, `marker in ${zoneId}`, markerId);
  };

  const checkCondition = (condition: WorldCondition | undefined, file: string, field: string): void => {
    if (condition === undefined) return;
    if ("all" in condition) for (const part of condition.all) checkCondition(part, file, field);
    else if ("any" in condition) for (const part of condition.any) checkCondition(part, file, field);
    else if ("not" in condition) checkCondition(condition.not, file, field);
    else if ("quest" in condition) {
      if (!index.quests.has(condition.quest)) missing(file, field, "quest", condition.quest);
    } else if ("flag" in condition) flagsRead.push({ flag: condition.flag, file });
    else if ("cleared" in condition) checkMarkerRef(condition.cleared, file, field);
    else if ("cleared_in" in condition) {
      if (!index.zones.has(condition.cleared_in)) missing(file, field, "zone", condition.cleared_in);
    } else if (!index.skills.has(condition.mastery)) missing(file, field, "skill node", condition.mastery);
  };

  const checkEffects = (effects: readonly WorldEffect[], file: string, field: string) => {
    for (const effect of effects) {
      if ("start_quest" in effect) {
        questsStarted.add(effect.start_quest);
        if (!index.quests.has(effect.start_quest)) missing(file, field, "quest", effect.start_quest);
      } else if ("complete_quest" in effect) {
        if (!index.quests.has(effect.complete_quest)) missing(file, field, "quest", effect.complete_quest);
      } else if ("set_flag" in effect) {
        flagsSet.add(effect.set_flag);
      }
    }
  };

  const checkDialogue = (npcId: string, dialogue: Dialogue, file: string) => {
    const nodes = new Set(Object.keys(dialogue.nodes));
    const reached = new Set<string>();
    const follow = (target: string | undefined, field: string) => {
      if (target === undefined) return;
      reached.add(target);
      if (!nodes.has(target)) missing(file, field, "dialogue node", target);
    };
    dialogue.start.forEach((opening, i) => {
      const field = `npc ${npcId}: start[${i}]`;
      checkCondition(opening.if, file, field);
      follow(opening.goto, field);
    });
    if (dialogue.start.at(-1)?.if !== undefined) {
      diagnostics.warn("dialogue-fallback", `npc ${npcId}: the last start entry has an "if", so talking can fail`, { file });
    }
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      if (node.speaker !== undefined && !index.npcs.has(node.speaker)) {
        missing(file, `npc ${npcId}: node ${nodeId} speaker`, "npc", node.speaker);
      }
      node.choices.forEach((choice, i) => {
        const field = `npc ${npcId}: node ${nodeId} choice ${i}`;
        checkCondition(choice.if, file, field);
        checkEffects(choice.effects, file, field);
        follow(choice.goto, field);
      });
    }
    for (const nodeId of nodes) {
      if (!reached.has(nodeId)) diagnostics.warn("unreachable-dialogue", `npc ${npcId}: node "${nodeId}" is never reached`, { file });
    }
  };

  const starts = [...index.zones.values()].filter(({ value }) => value.start);
  if (index.zones.size > 0 && starts.length !== 1) {
    diagnostics.error(
      "start-zone",
      `exactly one zone must have "start: true"; found ${starts.length}`,
      at(starts[1]?.file ?? [...index.zones.values()][0]?.file),
    );
  }

  for (const { value: zone, file } of index.zones.values()) {
    const rows = zoneRows(zone);
    const width = rows[0]?.length ?? 0;
    const height = rows.length;
    const where = (point: GridPoint) => `(${point.x}, ${point.y})`;
    const zoneError = (code: string, message: string) => {
      diagnostics.error(code, `zone ${zone.id}: ${message}`, { file });
    };

    if (zone.realm !== undefined && !index.realms.has(zone.realm)) missing(file, `zone ${zone.id}: realm`, "realm", zone.realm);
    for (const [char, terrainId] of Object.entries(zone.legend)) {
      if (!index.terrain.has(terrainId)) missing(file, `zone ${zone.id}: legend "${char}"`, "terrain", terrainId);
    }

    // `true` where movement stops. Conditional props are left out, so this is the zone at its most open: a gate
    // that opens later must not make what lies behind it count as unreachable.
    const blocked = rows.map((row) =>
      Array.from(row, (char) => {
        const terrainId = zone.legend[char];
        return terrainId === undefined || index.terrain.get(terrainId)?.value.walkable !== true;
      }),
    );
    const isBlocked = (point: GridPoint) => blocked[point.y]?.[point.x] ?? true;
    const block = (point: GridPoint) => {
      const row = blocked[point.y];
      if (row && point.x < row.length) row[point.x] = true;
    };

    zone.props.forEach((placement, i) => {
      const field = `zone ${zone.id}: props[${i}]`;
      checkCondition(placement.if, file, field);
      const prop = index.props.get(placement.prop)?.value;
      if (!prop) {
        missing(file, field, "prop", placement.prop);
        return;
      }
      if (placement.x + prop.footprint.w > width || placement.y + prop.footprint.h > height) {
        zoneError("prop-bounds", `${prop.id} at ${where(placement)} does not fit inside the zone`);
      }
      if (!prop.blocking || placement.if !== undefined) return;
      for (let dy = 0; dy < prop.footprint.h; dy++) {
        for (let dx = 0; dx < prop.footprint.w; dx++) block({ x: placement.x + dx, y: placement.y + dy });
      }
    });

    const occupied = new Map<string, string>();
    const occupy = (point: GridPoint, what: string) => {
      const key = `${point.x},${point.y}`;
      const other = occupied.get(key);
      if (other !== undefined) zoneError("overlap", `${what} and ${other} share the tile ${where(point)}`);
      occupied.set(key, what);
    };
    const npcTiles: GridPoint[] = [];
    zone.npcs.forEach((placement, i) => {
      const field = `zone ${zone.id}: npcs[${i}]`;
      checkCondition(placement.if, file, field);
      if (!index.npcs.has(placement.npc)) missing(file, field, "npc", placement.npc);
      if (isBlocked(placement)) zoneError("blocked-placement", `npc ${placement.npc} stands on a blocked tile ${where(placement)}`);
      occupy(placement, `npc ${placement.npc}`);
      npcTiles.push(placement);
    });
    // People stop movement too; they are only blocked after their own tiles were checked above.
    for (const tile of npcTiles) block(tile);

    const ids = new Set<string>();
    for (const thing of [...zone.features, ...zone.portals, ...zone.markers]) {
      if (ids.has(thing.id)) zoneError("duplicate-id", `the id "${thing.id}" is used twice`);
      ids.add(thing.id);
    }

    const reachable = flood(blocked, zone.entry);
    const reachableTile = (point: GridPoint) => reachable.has(`${point.x},${point.y}`);
    const reachableBeside = (point: GridPoint) =>
      [point, { x: point.x + 1, y: point.y }, { x: point.x - 1, y: point.y }, { x: point.x, y: point.y + 1 }, { x: point.x, y: point.y - 1 }].some(
        (candidate) => candidate.x >= 0 && candidate.y >= 0 && reachableTile(candidate),
      );
    const standable = (point: GridPoint, what: string) => {
      if (isBlocked(point)) zoneError("blocked-placement", `${what} is on a blocked tile ${where(point)}`);
      else if (!reachableTile(point)) zoneError("unreachable", `${what} at ${where(point)} cannot be walked to from the entry`);
    };

    if (isBlocked(zone.entry)) zoneError("blocked-placement", `the entry ${where(zone.entry)} is on a blocked tile`);
    for (const marker of zone.markers) {
      const field = `zone ${zone.id}: marker ${marker.id}`;
      checkCondition(marker.if, file, field);
      if (!index.skills.has(marker.node)) missing(file, field, "skill node", marker.node);
      for (const challenge of marker.challenges) {
        if (!index.challenges.has(challenge)) missing(file, field, "challenge", challenge);
      }
      standable(marker, `marker ${marker.id}`);
      occupy(marker, `marker ${marker.id}`);
    }
    for (const portal of zone.portals) {
      const field = `zone ${zone.id}: portal ${portal.id}`;
      checkCondition(portal.if, file, field);
      const destination = index.zones.get(portal.to.zone)?.value;
      if (!destination) missing(file, `${field} to.zone`, "zone", portal.to.zone);
      else if (!destination.portals.some((other) => other.id === portal.to.portal)) {
        missing(file, `${field} to.portal`, `portal in ${portal.to.zone}`, portal.to.portal);
      }
      standable(portal, `portal ${portal.id}`);
      standable(portal.arrive, `portal ${portal.id}'s arrive point`);
      if (portal.arrive.x === portal.x && portal.arrive.y === portal.y) {
        zoneError("portal-arrive", `portal ${portal.id} arrives on itself, which would travel straight back`);
      }
      occupy(portal, `portal ${portal.id}`);
    }
    for (const feature of zone.features) {
      const field = `zone ${zone.id}: feature ${feature.id}`;
      checkCondition(feature.if, file, field);
      checkEffects(feature.effects, file, field);
      if (!reachableBeside(feature)) zoneError("unreachable", `feature ${feature.id} at ${where(feature)} has no reachable tile beside it`);
    }
    for (const tile of npcTiles) {
      if (!reachableBeside(tile)) zoneError("unreachable", `nobody can walk up to the npc at ${where(tile)}`);
    }
  }

  for (const { value: npc, file } of index.npcs.values()) checkDialogue(npc.id, npc.dialogue, file);

  for (const { value: quest, file } of index.quests.values()) {
    if (!index.npcs.has(quest.giver)) missing(file, `quest ${quest.id}: giver`, "npc", quest.giver);
    quest.objectives.forEach((objective, i) => {
      const field = `quest ${quest.id}: objectives[${i}]`;
      if ("cleared" in objective) checkMarkerRef(objective.cleared, file, field);
      else if ("cleared_in" in objective) {
        if (!index.zones.has(objective.cleared_in)) missing(file, field, "zone", objective.cleared_in);
      } else if ("mastery" in objective) {
        if (!index.skills.has(objective.mastery)) missing(file, field, "skill node", objective.mastery);
      } else flagsRead.push({ flag: objective.flag, file });
    });
    for (const flag of quest.rewards.flags) flagsSet.add(flag);
  }

  for (const { flag, file } of flagsRead) {
    if (!flagsSet.has(flag)) diagnostics.warn("unset-flag", `flag "${flag}" is checked, but no effect or quest reward sets it`, { file });
  }
  for (const { value: quest, file } of index.quests.values()) {
    if (!questsStarted.has(quest.id)) {
      diagnostics.warn("unstarted-quest", `quest ${quest.id} is never started by a dialogue choice or feature`, { file });
    }
  }
}

/** Every tile reachable from `from` moving in four directions over unblocked tiles, as "x,y" keys. */
function flood(blocked: readonly (readonly boolean[])[], from: GridPoint): Set<string> {
  const seen = new Set<string>();
  if (blocked[from.y]?.[from.x] !== false) return seen;
  seen.add(`${from.x},${from.y}`);
  const queue: GridPoint[] = [from];
  for (const point of queue) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: point.x + dx, y: point.y + dy };
      const key = `${next.x},${next.y}`;
      if (blocked[next.y]?.[next.x] === false && !seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen;
}
