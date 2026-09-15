import { findPath, type Point } from "@rootward/core/map";
import type { ExpeditionView, MapRoomView, RunView } from "@rootward/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doorwayAt, passability, restingPoint, revealedTiles, travelTarget } from "../map/fog.ts";
import { ROOM_GLYPHS, ROOM_NAMES, ROOM_STATE_LABELS } from "../map/rooms.ts";
import { TileMapRenderer } from "../map/TileMapRenderer.tsx";
import { useGame } from "../state/store.ts";

/** The renderer in use. */
const Renderer = TileMapRenderer;

/** Milliseconds per tile when traveling by click. */
const STEP_MS = 40;

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  k: [0, -1],
  j: [0, 1],
  h: [-1, 0],
  l: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

const percent = (value: number, max: number) => `${max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))}%`;

interface Walker {
  avatar: Point;
  /** Tiles still to walk for click-to-travel. */
  route: Point[];
}

/** The walkable expedition map (kickoff answer 8, ADR-0008). */
export function ExpeditionScreen({ run, expedition }: { run: RunView; expedition: ExpeditionView }) {
  // A new resting place (a room was cleared) remounts the map, so the avatar starts from there.
  return <ExpeditionMap key={`${run.runId}:${expedition.lastClearedRoomId ?? "entrance"}`} run={run} expedition={expedition} />;
}

function ExpeditionMap({ run, expedition }: { run: RunView; expedition: ExpeditionView }) {
  const enterRoom = useGame((s) => s.enterRoom);
  const abandon = useGame((s) => s.abandon);
  const leave = useGame((s) => s.leave);
  const busy = useGame((s) => s.busy);
  const revealed = useMemo(() => revealedTiles(expedition), [expedition]);
  const canStep = useMemo(() => passability(expedition, revealed), [expedition, revealed]);
  const [walker, setWalker] = useState<Walker>(() => ({ avatar: restingPoint(expedition), route: [] }));
  const scroller = useRef<HTMLDivElement>(null);
  const active = run.status === "active";
  const walking = walker.route.length > 0;
  const doorway = active ? doorwayAt(expedition, walker.avatar) : undefined;

  useEffect(() => {
    if (!walking) return;
    const timer = window.setInterval(() => {
      setWalker((current) => {
        const [next, ...rest] = current.route;
        return next ? { avatar: next, route: rest } : current;
      });
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [walking]);

  const travelTo = useCallback(
    (point: Point) => {
      setWalker((current) => {
        const path = findPath(expedition, current.avatar, travelTarget(expedition, point), (tile) => canStep(tile));
        return path ? { avatar: current.avatar, route: path.slice(1) } : current;
      });
    },
    [expedition, canStep],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const move = MOVES[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (move) {
        event.preventDefault();
        setWalker((current) => {
          const next = { x: current.avatar.x + move[0], y: current.avatar.y + move[1] };
          return { avatar: canStep(next) ? next : current.avatar, route: [] };
        });
        return;
      }
      // Enter on a focused button belongs to that button.
      if (event.key === "Enter" && doorway && busy === undefined && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        void enterRoom(doorway.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, busy, canStep, doorway, enterRoom]);

  // Keep the avatar in the middle of the scrolling map.
  useEffect(() => {
    const container = scroller.current;
    const avatar = container?.querySelector(".avatar");
    if (!container || !(avatar instanceof HTMLElement)) return;
    container.scrollTo({
      top: avatar.offsetTop - container.clientHeight / 2,
      left: avatar.offsetLeft - container.clientWidth / 2,
    });
  }, [walker.avatar]);

  const lastCleared = expedition.rooms.find((room) => room.id === expedition.lastClearedRoomId);
  const floor = Math.min((lastCleared ? lastCleared.floor + 1 : 0) + 1, expedition.floorCount);
  const open = expedition.rooms.filter((room) => room.state === "open");

  return (
    <div className="mapwrap">
      <section className="map-main" aria-label="Dungeon">
        <div className="map-scroll" ref={scroller}>
          <Renderer
            expedition={expedition}
            revealed={revealed}
            avatar={walker.avatar}
            playerClassName={run.player.className}
            onTileClick={active ? travelTo : undefined}
            label={`Dungeon map with ${expedition.floorCount} floors. Use the door list to travel without the map.`}
          />
        </div>
      </section>
      <aside className="pane map-side" aria-label="Expedition">
        {!active && <EndBanner run={run} expedition={expedition} />}
        <section className="block">
          <h3>
            Expedition · floor {floor} of {expedition.floorCount}
          </h3>
          {doorway ? (
            <DoorCard room={doorway} disabled={busy !== undefined} onEnter={() => void enterRoom(doorway.id)} />
          ) : (
            <p className="narr">{active ? "Walk to a lit door (+) to choose your next room." : "The way down is closed."}</p>
          )}
          {active && open.length > 0 && (
            <ul className="doors" aria-label="Open doors">
              {open.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      travelTo(room.doorIn);
                    }}
                  >
                    Travel: {ROOM_GLYPHS[room.kind]} {ROOM_NAMES[room.kind]}
                    {room.details ? ` · ${room.details.title}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Route expedition={expedition} />
        <section className="block" aria-label="Maintainer status">
          <h3>Maintainer · {run.player.className}</h3>
          <div className="stat">
            <span className="lbl">Integrity</span>
            <span className="bar integrity">
              <i style={{ width: percent(run.player.integrity, run.player.integrityMax) }} />
            </span>
            <span className="val">{run.player.integrity}</span>
          </div>
          <div className="stat">
            <span className="lbl">Cycles</span>
            <span />
            <span className="val">{run.player.cycles}</span>
          </div>
        </section>
        {expedition.rationale.length > 0 && (
          <details className="block rationale">
            <summary>Why this dungeon</summary>
            <ul>
              {expedition.rationale.map((entry, index) => (
                <li key={index}>{entry.text}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="actions">
          {active ? (
            <button
              type="button"
              className="btn danger"
              disabled={busy !== undefined}
              onClick={() => {
                if (window.confirm("Abandon this expedition? The run ends here.")) void abandon();
              }}
            >
              Abandon expedition
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={leave}>
              Back to the Guild Board
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function DoorCard({ room, disabled, onEnter }: { room: MapRoomView; disabled: boolean; onEnter: () => void }) {
  return (
    <div className="door-card">
      <p className="crt-title">
        {ROOM_NAMES[room.kind]} {room.kind === "boss" ? "· the Legacy System" : ""}
      </p>
      {room.details && (
        <>
          <p>
            {room.details.title} · {room.details.enemyName}
          </p>
          <p className="meta">
            difficulty {room.details.difficulty}
            {room.details.concept !== undefined ? ` · ${room.details.concept}` : ""} · {room.purpose}
          </p>
        </>
      )}
      <div className="actions">
        <button type="button" className="btn primary" disabled={disabled} onClick={onEnter}>
          Step inside <small>Enter</small>
        </button>
      </div>
    </div>
  );
}

function Route({ expedition }: { expedition: ExpeditionView }) {
  const floors = Array.from({ length: expedition.floorCount }, (_, floor) =>
    expedition.rooms.filter((room) => room.floor === floor),
  );
  return (
    <section className="block" aria-label="Route">
      <h3>Route</h3>
      <ol className="route">
        {floors.map((rooms, floor) => (
          <li key={floor}>
            <span className="floor-no">{floor + 1}</span>
            {rooms.map((room) => (
              <span key={room.id} className={`room-chip ${room.state}`}>
                {ROOM_GLYPHS[room.kind]} {ROOM_NAMES[room.kind]} <small>{room.outcome ?? ROOM_STATE_LABELS[room.state]}</small>
              </span>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

const END_TEXT: Readonly<Record<NonNullable<RunView["endReason"]>, string>> = {
  completed: "The Legacy System falls and the way to Root opens a little wider.",
  retreated: "You withdrew from the Legacy System. The expedition ends, but what you learned stays.",
  "kernel-panic": "Kernel panic. The expedition ends here.",
  abandoned: "The expedition was abandoned.",
};

function EndBanner({ run, expedition }: { run: RunView; expedition: ExpeditionView }) {
  const showDebrief = useGame((s) => s.showDebrief);
  const busy = useGame((s) => s.busy);
  const cleared = expedition.rooms.filter((room) => room.state === "cleared").length;
  const completed = run.endReason === "completed";
  return (
    <section className={completed ? "outcome won" : "outcome"} aria-live="polite">
      <h3>{completed ? "Expedition complete" : "Expedition over"}</h3>
      <p className="narr">{run.endReason ? END_TEXT[run.endReason] : ""}</p>
      <p>
        {cleared} of {expedition.floorCount} floors cleared.
      </p>
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy !== undefined} onClick={() => void showDebrief()}>
          Read the debrief →
        </button>
      </div>
    </section>
  );
}
