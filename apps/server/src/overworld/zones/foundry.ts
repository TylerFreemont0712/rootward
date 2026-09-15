import type { ZoneDef } from "../zone-types.ts";

// A 28x20 walkable Foundry floor: an open workroom with a couple of interior pillars and a decorative anvil
// cluster, never fully enclosing any area. Verified reachable from `entry` to every marker (including the boss) by
// breadth-first search over floor tiles alone, treating the prop cluster as blocking movement like any other prop.
const TILES: string[] = [
  "############################",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "#...................#......#",
  "#......#............#......#",
  "#......#...................#",
  "#..........................#",
  "#..........................#",
  "#.............&&...........#",
  "#.............&............#",
  "#..........................#",
  "#...........##.............#",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "############################",
];

export const FOUNDRY_ZONE: ZoneDef = {
  realmId: "foundry",
  realmName: "The Foundry",
  width: 28,
  height: 20,
  tiles: TILES,
  entry: { x: 2, y: 2 },
  markers: [
    { id: "foundry-variables", kind: "encounter", x: 4, y: 4, nodeId: "py.basics.variables", challengePool: ["foundry.py.running-total", "foundry.py.unbound-name"] },
    { id: "foundry-values", kind: "encounter", x: 9, y: 3, nodeId: "py.basics.values", challengePool: ["foundry.py.floor-division", "foundry.py.change-counter"] },
    { id: "foundry-loops", kind: "encounter", x: 14, y: 4, nodeId: "py.control.loops", challengePool: ["foundry.py.longest-streak", "foundry.py.staircase"] },
    { id: "foundry-conditionals", kind: "encounter", x: 19, y: 3, nodeId: "py.control.conditionals", challengePool: ["foundry.py.grade-ladder", "foundry.py.leap-year"] },
    { id: "foundry-strings", kind: "encounter", x: 24, y: 4, nodeId: "py.strings.basics", challengePool: ["foundry.py.mirror-gate", "foundry.py.title-case"] },
    { id: "foundry-splitting", kind: "encounter", x: 5, y: 10, nodeId: "py.strings.split", challengePool: ["foundry.py.reverse-words", "foundry.py.parse-duration"] },
    { id: "foundry-lists", kind: "encounter", x: 11, y: 9, nodeId: "py.collections.list", challengePool: ["foundry.py.rotate-list"] },
    { id: "foundry-dicts", kind: "encounter", x: 17, y: 9, nodeId: "py.collections.dict", challengePool: ["foundry.py.dict-word-count"] },
    { id: "foundry-functions", kind: "encounter", x: 22, y: 9, nodeId: "py.functions.define", challengePool: ["foundry.py.temperature"] },
    { id: "foundry-edge-cases", kind: "encounter", x: 8, y: 15, nodeId: "concept.edge-cases", challengePool: ["foundry.edge.page-range"] },
    { id: "foundry-kiln-warden", kind: "boss", x: 22, y: 16, nodeId: "py.collections.dict", challengePool: ["foundry.py.kiln-warden"] },
  ],
  bossMarkerId: "foundry-kiln-warden",
};
