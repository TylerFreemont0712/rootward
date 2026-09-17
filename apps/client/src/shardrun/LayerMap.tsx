import type { ArenaAmbienceView, ShardrunMapNodeView, ShardrunView } from "@rootward/shared";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetUrl, foeSpriteUrl, walkStripUrl } from "../assets/AssetRegistry.ts";
import { sound } from "../audio/engine.ts";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";

// A layer's map as the layer itself, seen in cross-section (ADR-0021): rooms are chambers carved into the
// layer's rock, lit from inside, with whatever waits there standing in them (the foes of a fight, a campfire, an anvil,
// a chest); tunnels join them, lit where the Maintainer has walked, with light running along the ones that can be taken.
// The guardian waits at the top in its own room, and the Maintainer carries a lantern through the dark from the way in at
// the bottom, walking each tunnel before the room it leads to opens. The map climbs, as the player asked for when it was
// a chart of icons (ADR-0013). Rooms and paths still come from the server; this only lays them out and lets the open
// ones be entered.

/** The map's own coordinates, scaled to fit its panel. Chambers are drawn at 1:1 when the panel is wide enough. */
const WIDTH = 840;
/** From the top: the guardian's room, a band for each row of rooms, then the way in. */
const GATE_HEIGHT = 214;
const ROW_HEIGHT = 112;
const ENTRANCE_HEIGHT = 100;
const SIDE = 34;
/** A room at 1:1 with its painted chamber (`shardrun/map-chamber-<layer>`), which is posted at this size. */
const CHAMBER = { width: 96, height: 72 };
/** How long the Maintainer takes to walk a tunnel before the room opens. */
const WALK_MS = 850;
/** The walk strip's frames, drawn at three quarters of their size so the Maintainer fits a room. */
const WALKER = { width: 36, height: 56 };
const LANTERN = 760;
/** How far down the scrolled view the Maintainer is kept: below the middle, so more of what is ahead shows. */
const VIEW_AT = 0.62;

interface Point {
  x: number;
  y: number;
}

const KIND_NAME: Readonly<Record<ShardrunMapNodeView["kind"], string>> = {
  fight: "Fight",
  elite: "Elite",
  boss: "Guardian",
  rest: "Rest",
  forge: "Forge",
  treasure: "Treasure",
};

const STATE_NOTE: Readonly<Record<ShardrunMapNodeView["state"], string>> = {
  open: "Click to go there.",
  current: "You are here.",
  visited: "Already cleared.",
  passed: "A road not taken.",
  ahead: "Further along the paths.",
};

/** A stable wobble in [-1, 1] from an id, so rooms do not sit on a rigid grid but never move between renders. */
function wobble(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 2001) / 1000 - 1;
}

/** A tunnel between two points: straight out of one room, curving across, straight into the next. */
function tunnel(from: Point, to: Point): string {
  const middle = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`;
}

/** Points along the same curve, `count` steps apart, for the Maintainer's walk to follow. */
function along(from: Point, to: Point, count: number): Point[] {
  const middle = (from.y + to.y) / 2;
  // LEARN: a cubic Bézier is a blend of its four control points, weighted by the Bernstein polynomials of t (u = 1 - t):
  // u³, 3u²t, 3ut², t³. Here the controls are (from.x, from.y), (from.x, middle), (to.x, middle), (to.x, to.y).
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count;
    const u = 1 - t;
    const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return { x: (a + b) * from.x + (c + d) * to.x, y: a * from.y + (b + c) * middle + d * to.y };
  });
}

const walkerAt = (point: Point) => `translate(${point.x - WALKER.width / 2}px, ${point.y - WALKER.height}px)`;
const lanternAt = (point: Point) => `translate(${point.x - LANTERN / 2}px, ${point.y - LANTERN / 2}px)`;

export function LayerMap({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const classId = useGame((s) => s.activeProfile?.classId ?? "artificer");
  const scroller = useRef<HTMLDivElement>(null);
  const walkerElement = useRef<HTMLDivElement>(null);
  const lanternElement = useRef<HTMLDivElement>(null);
  const walkTimer = useRef<number | undefined>(undefined);
  const [panelWidth, setPanelWidth] = useState(WIDTH);
  const [walkingTo, setWalkingTo] = useState<string | undefined>();
  const [hovered, setHovered] = useState<string | undefined>();

  const { nodes, edges } = run.map;
  const rooms = nodes.filter((node) => node.kind !== "boss");
  const boss = nodes.find((node) => node.kind === "boss");
  const topRow = Math.max(0, ...rooms.map((node) => node.row));
  const columns = Math.max(1, ...rooms.map((node) => node.col + 1));
  const height = GATE_HEIGHT + (topRow + 1) * ROW_HEIGHT + ENTRANCE_HEIGHT;
  const scale = Math.min(1, panelWidth / WIDTH);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const entrance: Point = { x: WIDTH / 2, y: height - ENTRANCE_HEIGHT / 2 + 8 };
  const place = (node: ShardrunMapNodeView): Point =>
    node.kind === "boss"
      ? { x: WIDTH / 2, y: GATE_HEIGHT - 30 }
      : {
          x: SIDE + ((node.col + 0.5) / columns) * (WIDTH - SIDE * 2) + wobble(node.id) * 10,
          y: GATE_HEIGHT + (topRow - node.row) * ROW_HEIGHT + ROW_HEIGHT / 2 + wobble(`${node.id}:y`) * 8,
        };
  /** Where the Maintainer stands in a room: on its floor, or before the guardian's door. */
  const standing = (node: ShardrunMapNodeView | undefined): Point => {
    if (!node) return entrance;
    const at = place(node);
    return node.kind === "boss" ? { x: at.x, y: at.y + 14 } : { x: at.x, y: at.y + 25 };
  };
  const current = nodes.find((node) => node.state === "current");
  const walker = standing(walkingTo === undefined ? current : byId.get(walkingTo));

  // The panel's width sets the map's scale, so it fits a narrow window and stays crisp in a wide one.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPanelWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(walkTimer.current);
    };
  }, []);

  // Keep the Maintainer in view: the map is tall, and a layer starts at its bottom.
  const standingY = standing(current).y;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = Math.max(0, standingY * scale - element.clientHeight * VIEW_AT);
  }, [standingY, scale, run.layer.index]);

  const enter = (node: ShardrunMapNodeView) => {
    if (node.state !== "open" || busy || walkingTo !== undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void command({ type: "enter", nodeId: node.id });
      return;
    }
    // Walk the tunnel first; the room opens when the Maintainer gets there. Footsteps on the way, and a treasure room
    // announces itself as the door opens.
    for (const [step, delay] of [0.05, 0.33, 0.61].entries()) sound.play("sfx-step", { delay, volume: 0.7, rate: step % 2 === 0 ? 1 : 0.9 });
    if (node.kind === "treasure") sound.play("cue-treasure", { delay: WALK_MS / 1000 });
    const to = standing(node);
    const path = along(walker, to, 24);
    const timing = { duration: WALK_MS, easing: "ease-in-out" };
    // LEARN: the Web Animations API plays keyframes on an element without going through React. The style React renders
    // once `walkingTo` is set is already the destination, so when the animation ends and lets go, nothing jumps.
    walkerElement.current?.animate(path.map((point) => ({ transform: walkerAt(point) })), timing);
    lanternElement.current?.animate(path.map((point) => ({ transform: lanternAt(point) })), timing);
    setWalkingTo(node.id);
    scroller.current?.scrollTo({ top: Math.max(0, to.y * scale - scroller.current.clientHeight * VIEW_AT), behavior: "smooth" });
    walkTimer.current = window.setTimeout(() => {
      void command({ type: "enter", nodeId: node.id }).finally(() => {
        setWalkingTo(undefined);
      });
    }, WALK_MS);
  };

  const walked = (node: ShardrunMapNodeView | undefined) => node?.state === "visited" || node?.state === "current";
  const tunnels = [
    // The way in, to every room of the bottom row: lit toward the rooms that can be entered before the first one.
    ...rooms
      .filter((node) => node.row === 0)
      .map((node) => ({
        key: `in>${node.id}`,
        d: tunnel(entrance, place(node)),
        kind: walked(node) ? "taken" : node.state === "open" ? "open" : "idle",
      })),
    ...edges.flatMap(([from, to]) => {
      const a = byId.get(from);
      const b = byId.get(to);
      if (!a || !b) return [];
      const kind = walked(a) && walked(b) ? "taken" : a.state === "current" && b.state === "open" ? "open" : "idle";
      return [{ key: `${from}>${to}`, d: tunnel(place(a), place(b)), kind }];
    }),
  ];

  const layerId = run.layer.id;
  const chamberArt = assetUrl("shardrun", `map-chamber-${layerId}`) ?? assetUrl("shardrun", "map-chamber-salvage");
  const wallArt = assetUrl("shardrun", `map-wall-${layerId}-0`);
  const guardianRoom = assetUrl("backgrounds", run.layer.bossBackdrop) ?? assetUrl("backgrounds", run.layer.backdrop);
  const strip = walkStripUrl(classId, "up");
  const eliteIcon = assetUrl("shardrun", "map-elite");
  const canvasStyle: CSSProperties = {
    width: WIDTH,
    height,
    transform: `scale(${scale})`,
    ...(wallArt !== undefined ? { backgroundImage: `url("${wallArt}")` } : {}),
  };
  const hoveredNode = hovered === undefined ? undefined : byId.get(hovered);

  return (
    <section className="shr-map" aria-labelledby="shr-map-title">
      <header className="shr-map-head">
        <h2 id="shr-map-title" className="crt-title">
          {run.layer.name}
        </h2>
        <span className="meta">
          Layer {run.layer.index + 1} of {run.layer.count} · {run.layer.flavor}
        </span>
      </header>
      <div className="shr-map-view">
        <div ref={scroller} className={`shr-map-scroll layer-${layerId}`}>
          <div className="shr-map-sizer" style={{ width: WIDTH * scale, height: height * scale }}>
            <div className={`shr-map-canvas${wallArt === undefined ? " no-art" : ""}`} style={canvasStyle}>
              <svg className="shr-map-tunnels" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} aria-hidden="true">
                {tunnels.map((path) => (
                  <g key={path.key} className={`shr-tunnel tunnel-${path.kind}`}>
                    <path className="shr-tunnel-rock" d={path.d} />
                    <path className="shr-tunnel-floor" d={path.d} />
                    {path.kind !== "idle" && <path className="shr-tunnel-light" d={path.d} />}
                  </g>
                ))}
              </svg>

              <div ref={lanternElement} className="shr-map-lantern" style={{ transform: lanternAt(walker) }} aria-hidden="true" />

              <div className="shr-map-entrance" style={{ left: entrance.x - 48, top: entrance.y - 27 }} aria-hidden="true">
                <span>the way in</span>
              </div>

              {boss && (
                <button
                  type="button"
                  className={`shr-map-node shr-gate kind-boss state-${boss.state}`}
                  style={{ left: 40, top: 14, width: WIDTH - 80, height: GATE_HEIGHT - 44 }}
                  aria-disabled={boss.state !== "open"}
                  tabIndex={boss.state === "open" ? 0 : -1}
                  aria-label={`${KIND_NAME.boss}: ${boss.foes.map((foe) => foe.name).join(", ")}. ${STATE_NOTE[boss.state]}`}
                  onClick={() => {
                    enter(boss);
                  }}
                  onMouseEnter={() => {
                    setHovered(boss.id);
                  }}
                  onMouseLeave={() => {
                    setHovered(undefined);
                  }}
                  onFocus={() => {
                    setHovered(boss.id);
                  }}
                  onBlur={() => {
                    setHovered(undefined);
                  }}
                >
                  <span className="shr-gate-room" style={guardianRoom !== undefined ? { backgroundImage: `url("${guardianRoom}")` } : undefined} />
                  {boss.foes.map((foe) => {
                    const sprite = foeSpriteUrl(foe.sprite);
                    return sprite !== undefined ? <img key={foe.sprite} className="shr-gate-guardian" src={sprite} alt="" draggable={false} /> : null;
                  })}
                  <span className="shr-gate-plaque">
                    <b>{boss.foes.map((foe) => foe.name).join(" · ")}</b>
                    <span>Guardian of {run.layer.name}</span>
                  </span>
                </button>
              )}

              {rooms.map((node) => {
                const at = place(node);
                const open = node.state === "open";
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`shr-map-node shr-chamber kind-${node.kind} state-${node.state}`}
                    style={{ left: at.x - CHAMBER.width / 2, top: at.y - CHAMBER.height / 2, width: CHAMBER.width, height: CHAMBER.height }}
                    aria-disabled={!open}
                    tabIndex={open ? 0 : -1}
                    aria-label={`${KIND_NAME[node.kind]}${node.foes.length > 0 ? `: ${node.foes.map((foe) => foe.name).join(", ")}` : ""}. ${STATE_NOTE[node.state]}`}
                    onClick={() => {
                      enter(node);
                    }}
                    onMouseEnter={() => {
                      setHovered(node.id);
                    }}
                    onMouseLeave={() => {
                      setHovered(undefined);
                    }}
                    onFocus={() => {
                      setHovered(node.id);
                    }}
                    onBlur={() => {
                      setHovered(undefined);
                    }}
                  >
                    <span className="shr-chamber-art" style={chamberArt !== undefined ? { backgroundImage: `url("${chamberArt}")` } : undefined} />
                    <span className="shr-chamber-glow" />
                    <RoomContents node={node} />
                    {node.kind === "elite" && (
                      <span className="shr-chamber-badge">
                        {eliteIcon !== undefined && <img src={eliteIcon} alt="" />}
                        elite
                      </span>
                    )}
                  </button>
                );
              })}

              <div
                ref={walkerElement}
                className={`shr-walker${walkingTo !== undefined ? " walking" : ""}${strip === undefined ? " no-art" : ""}`}
                style={{ transform: walkerAt(walker) }}
                aria-hidden="true"
              >
                <span className="shr-walker-light" />
                {strip !== undefined && <span className="shr-walker-sprite" style={{ backgroundImage: `url("${strip}")` }} />}
              </div>

              {/* Once the Maintainer sets off, the room's card would only stand in the way. */}
              {hoveredNode && walkingTo === undefined && <RoomTip run={run} node={hoveredNode} at={place(hoveredNode)} />}
            </div>
          </div>
        </div>
        <MapAir kind={run.layer.ambience} />
      </div>
      <ul className="shr-map-legend" aria-label="Map legend">
        {(["fight", "elite", "rest", "forge", "treasure"] as const).map((kind) => {
          const icon = assetUrl("shardrun", `map-prop-${kind}`) ?? assetUrl("shardrun", `map-${kind}`);
          return (
            <li key={kind}>
              {icon !== undefined && <img src={icon} alt="" />}
              {KIND_NAME[kind]}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const AIR_PARTICLES = 22;

/**
 * What drifts in the layer's air, the same as in its arena (content's `ambience`): dust, spores, or embers. It floats
 * over the view rather than the rock, so it stays while the map scrolls. Positions and timings come from each particle's
 * index, so the pattern never changes between renders.
 */
function MapAir({ kind }: { kind: ArenaAmbienceView }) {
  return (
    <div className={`shr-map-air air-${kind}`} aria-hidden="true">
      {Array.from({ length: AIR_PARTICLES }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${(index * 41 + 7) % 100}%`,
            animationDelay: `${-((index * 7919) % 180) / 10}s`,
            animationDuration: `${12 + ((index * 17) % 90) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}

/** What stands in a room: its foes (shapes only until they are near), or its campfire, anvil, or chest. */
function RoomContents({ node }: { node: ShardrunMapNodeView }) {
  if (node.kind === "fight" || node.kind === "elite") {
    // A cleared room is empty: its foes are gone. The room the Maintainer stands in needs no label.
    if (node.state === "current") return null;
    if (node.state === "visited") return <span className="shr-chamber-cleared">cleared</span>;
    return (
      <span className="shr-chamber-inside">
        {node.foes.slice(0, 2).map((foe, index) => {
          const sprite = foeSpriteUrl(foe.sprite);
          return sprite !== undefined ? (
            <img key={`${foe.sprite}-${index}`} className="shr-chamber-foe" src={sprite} alt="" draggable={false} />
          ) : (
            <span key={`${foe.sprite}-${index}`} className="shr-chamber-glyph">
              ⚔
            </span>
          );
        })}
      </span>
    );
  }
  const prop = assetUrl("shardrun", `map-prop-${node.kind}`) ?? assetUrl("shardrun", `map-${node.kind}`);
  return (
    <span className="shr-chamber-inside">
      {prop !== undefined ? <img className="shr-chamber-prop" src={prop} alt="" draggable={false} /> : <span className="shr-chamber-glyph">{KIND_NAME[node.kind].slice(0, 1)}</span>}
    </span>
  );
}

/** A room's card, shown while the pointer or focus is on it. */
function RoomTip({ run, node, at }: { run: ShardrunView; node: ShardrunMapNodeView; at: Point }) {
  const deck = run.playstyle === "deck";
  const foes = node.foes.map((foe) => foe.name).join(", ");
  const text: Readonly<Record<ShardrunMapNodeView["kind"], string>> = {
    fight: `${foes}. Win for a choice of ${deck ? "cards" : "shards"}.`,
    elite: `${foes}. Stronger than a fight, and it guards a relic.`,
    rest: `Recover ${Math.round(run.rules.restHealFraction * 100)}% of your Integrity.`,
    forge: deck ? "Melt a card down, upgrade one, widen a spell, or bind a new one." : "Rework a shard, widen a spell, or bind a new one.",
    treasure: "A sealed cache: a choice of relics.",
    boss: `${foes}. ${run.layer.index + 1 < run.layer.count ? "Beyond it, the way down." : "The last guardian of the Machine."}`,
  };
  // Above a room, unless it is in the top row, where the guardian's room is in the way; the guardian's, below its door.
  const below = node.kind === "boss" || at.y < GATE_HEIGHT + ROW_HEIGHT;
  return (
    <div
      className={`shr-chamber-tip${below ? " below" : ""}`}
      style={
        node.kind === "boss"
          ? { left: WIDTH / 2 - 130, top: GATE_HEIGHT - 20 }
          : { left: Math.min(WIDTH - 268, Math.max(8, at.x - 130)), top: below ? at.y + CHAMBER.height / 2 + 8 : at.y - CHAMBER.height / 2 - 8 }
      }
      role="tooltip"
    >
      <b>{KIND_NAME[node.kind]}</b>
      <span>{text[node.kind]}</span>
      <i>{STATE_NOTE[node.state]}</i>
    </div>
  );
}
