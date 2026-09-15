import type { ShardrunMapNodeView, ShardrunView } from "@rootward/shared";
import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { useShardrun } from "../state/shardrun.ts";

// A layer's map, drawn bottom to top in the spirit of Slay the Spire: you start at the bottom and climb toward the
// guardian at the top. Rooms and paths come from the server; this only lays them out and lets the open ones be entered.

const WIDTH = 560;
const ROW_GAP = 84;
const PAD = 60;
const NODE_R = 22;
const BOSS_R = 40;

const KIND_NAME: Readonly<Record<ShardrunMapNodeView["kind"], string>> = {
  fight: "Fight",
  elite: "Elite",
  boss: "Guardian",
  rest: "Rest",
  forge: "Forge",
  treasure: "Treasure",
};

/** A stable wobble in [-1, 1] from an id, so rooms do not sit on a rigid grid but never move between renders. */
function wobble(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 2001) / 1000 - 1;
}

export function LayerMap({ run }: { run: ShardrunView }) {
  const command = useShardrun((s) => s.command);
  const busy = useShardrun((s) => s.busy);
  const scroller = useRef<HTMLDivElement>(null);
  const { nodes, edges } = run.map;
  const topRow = Math.max(...nodes.map((node) => node.row));
  const columns = Math.max(...nodes.map((node) => node.col)) + 1;
  const height = topRow * ROW_GAP + PAD * 2;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const place = (node: ShardrunMapNodeView) =>
    node.kind === "boss"
      ? { x: WIDTH / 2, y: PAD }
      : { x: ((node.col + 0.5) / columns) * WIDTH + wobble(node.id) * 16, y: height - PAD - node.row * ROW_GAP + wobble(`${node.id}:y`) * 10 };
  const focusRow = Math.max(0, ...nodes.filter((node) => node.state === "current" || node.state === "open").map((node) => node.row));

  // Keep the rooms you can enter in view: the map is tall and starts scrolled to the bottom.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const target = height - PAD - focusRow * ROW_GAP - element.clientHeight / 2;
    element.scrollTop = Math.max(0, target);
  }, [height, focusRow, run.layer.index]);

  const enter = (node: ShardrunMapNodeView) => {
    if (node.state === "open" && !busy) void command({ type: "enter", nodeId: node.id });
  };
  const walked = (node: ShardrunMapNodeView | undefined) => node?.state === "visited" || node?.state === "current";

  return (
    <section className="shr-map" aria-labelledby="shr-map-title">
      <header className="shr-map-head">
        <h2 id="shr-map-title" className="crt-title">
          {run.layer.name}
        </h2>
        <span className="meta">
          Layer {run.layer.index + 1} of {run.layer.count} · climb to the guardian at the top
        </span>
      </header>
      <div ref={scroller} className="shr-map-scroll">
        <svg className="shr-map-svg" viewBox={`0 0 ${WIDTH} ${height}`} style={{ height }} role="img" aria-label={`Map of ${run.layer.name}`}>
          {edges.map(([from, to]) => {
            const a = byId.get(from);
            const b = byId.get(to);
            if (!a || !b) return null;
            const start = place(a);
            const end = place(b);
            const kind = walked(a) && walked(b) ? "taken" : a.state === "current" && b.state === "open" ? "open" : "idle";
            return <line key={`${from}>${to}`} className={`shr-map-edge edge-${kind}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
          })}
          {nodes.map((node) => {
            const { x, y } = place(node);
            const r = node.kind === "boss" ? BOSS_R : NODE_R;
            const icon = node.kind === "boss" ? assetUrl("creatures", node.foes[0]?.sprite ?? "") : assetUrl("shardrun", `map-${node.kind}`);
            const label = [KIND_NAME[node.kind], ...node.foes.map((foe) => foe.name)].join(": ");
            const open = node.state === "open";
            return (
              <g
                key={node.id}
                className={`shr-map-node kind-${node.kind} state-${node.state}`}
                transform={`translate(${x} ${y})`}
                {...(open
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Enter: ${label}`,
                      onClick: () => {
                        enter(node);
                      },
                      onKeyDown: (event: KeyboardEvent) => {
                        if (event.key === "Enter" || event.key === " ") enter(node);
                      },
                    }
                  : {})}
              >
                <title>{label}</title>
                {open && <circle className="shr-map-pulse" r={r + 8} />}
                <circle className="shr-map-disc" r={r} />
                {icon !== undefined ? (
                  <image href={icon} x={-r * 0.78} y={-r * 0.78} width={r * 1.56} height={r * 1.56} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <text className="shr-map-glyph" dy="0.35em">
                    {KIND_NAME[node.kind].slice(0, 1)}
                  </text>
                )}
                {node.state === "current" && <circle className="shr-map-you" r={r + 4} />}
                {node.state === "visited" && (
                  <text className="shr-map-check" x={r * 0.7} y={-r * 0.6}>
                    ✓
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="shr-map-legend" aria-label="Map legend">
        {(["fight", "elite", "rest", "forge", "treasure"] as const).map((kind) => {
          const icon = assetUrl("shardrun", `map-${kind}`);
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
