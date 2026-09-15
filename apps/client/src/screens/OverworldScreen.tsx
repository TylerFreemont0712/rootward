import { findPath, type Point } from "@rootward/core/map";
import type { OverworldView } from "@rootward/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OverworldRenderer } from "../map/OverworldRenderer.tsx";
import { passableAt, revealedAround } from "../map/overworld-fog.ts";
import { useGame } from "../state/store.ts";

/** Milliseconds per tile when traveling by click, matching ExpeditionScreen's dungeon walker. */
const STEP_MS = 40;
/** How long to wait after movement settles before persisting the new position -- so click-to-travel does not send
 * one request per tile. */
const PERSIST_DEBOUNCE_MS = 400;

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

interface Walker {
  avatar: Point;
  /** Tiles still to walk for click-to-travel. */
  route: Point[];
}

/** The free-roam overworld (ADR-0010): walk anywhere in the zone; walking onto a marker starts its fight. */
export function OverworldScreen({ overworld }: { overworld: OverworldView }) {
  // A remount per realm keeps stale local walker/fog state from one zone leaking into another.
  return <OverworldMap key={overworld.realmId} overworld={overworld} />;
}

function OverworldMap({ overworld }: { overworld: OverworldView }) {
  const moveOverworld = useGame((s) => s.moveOverworld);
  const startOverworldEncounter = useGame((s) => s.startOverworldEncounter);
  const leaveOverworld = useGame((s) => s.leaveOverworld);
  const busy = useGame((s) => s.busy);
  const activeProfile = useGame((s) => s.activeProfile);

  const canStep = useMemo(() => passableAt(overworld), [overworld]);
  const [walker, setWalker] = useState<Walker>(() => ({ avatar: overworld.position, route: [] }));
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => revealedAround(overworld, overworld.position));
  // The avatar position `visited` was last computed for -- an extra bit of state to notice the avatar moved and
  // grow `visited` during render (React's pattern for state derived from a changing value), instead of an effect.
  const [visitedFor, setVisitedFor] = useState<Point>(overworld.position);
  const scroller = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<number | undefined>(undefined);
  const walking = walker.route.length > 0;
  // Seeded with whatever marker the avatar starts on (arriving fresh, or returning from a lost fight) so it is not
  // re-triggered until the player actually steps off and back onto it.
  const triggeredRef = useRef<string | undefined>(
    overworld.markers.find((m) => m.x === overworld.position.x && m.y === overworld.position.y)?.id,
  );

  // Ground once seen stays visible while the avatar keeps walking; not persisted (only position and clears are).
  if (visitedFor.x !== walker.avatar.x || visitedFor.y !== walker.avatar.y) {
    setVisitedFor(walker.avatar);
    const around = revealedAround(overworld, walker.avatar);
    for (const key of around) {
      if (!visited.has(key)) {
        setVisited(new Set([...visited, ...around]));
        break;
      }
    }
  }

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

  useEffect(() => {
    if (walking) return;
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void moveOverworld(walker.avatar.x, walker.avatar.y);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(persistTimer.current);
    };
  }, [walking, walker.avatar, moveOverworld]);

  useEffect(() => {
    if (walking || busy !== undefined) return;
    const marker = overworld.markers.find(
      (m) => m.x === walker.avatar.x && m.y === walker.avatar.y && m.state === "open",
    );
    if (!marker) {
      triggeredRef.current = undefined;
    } else if (triggeredRef.current !== marker.id) {
      triggeredRef.current = marker.id;
      // Flush the position immediately: the debounced persist below would otherwise be canceled by this screen
      // unmounting for the fight before its timer fires, leaving the marker's tile unsaved.
      window.clearTimeout(persistTimer.current);
      void moveOverworld(walker.avatar.x, walker.avatar.y).then(() => startOverworldEncounter(marker.id));
    }
  }, [walking, walker.avatar, overworld.markers, busy, moveOverworld, startOverworldEncounter]);

  const travelTo = useCallback(
    (point: Point) => {
      setWalker((current) => {
        const path = findPath(overworld, current.avatar, point, (tile) => canStep(tile));
        return path ? { avatar: current.avatar, route: path.slice(1) } : current;
      });
    },
    [overworld, canStep],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || busy !== undefined) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const move = MOVES[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!move) return;
      event.preventDefault();
      setWalker((current) => {
        const next = { x: current.avatar.x + move[0], y: current.avatar.y + move[1] };
        return { avatar: canStep(next) ? next : current.avatar, route: [] };
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canStep, busy]);

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

  const cleared = overworld.markers.filter((m) => m.state === "cleared").length;

  return (
    <div className="mapwrap">
      <section className="map-main" aria-label={overworld.realmName}>
        <div className="map-scroll" ref={scroller}>
          <OverworldRenderer
            overworld={overworld}
            revealed={visited}
            avatar={walker.avatar}
            playerClassName={activeProfile?.classId}
            onTileClick={travelTo}
            label={`${overworld.realmName}, a free-roam zone. Walk onto a marker to fight it.`}
          />
        </div>
      </section>
      <aside className="pane map-side" aria-label={overworld.realmName}>
        <section className="block">
          <h3>{overworld.realmName}</h3>
          <p className="meta">
            {cleared} of {overworld.markers.length} encounters cleared
          </p>
          <ul className="doors" aria-label="Markers">
            {overworld.markers.map((marker) => (
              <li key={marker.id}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== undefined}
                  onClick={() => {
                    travelTo({ x: marker.x, y: marker.y });
                  }}
                >
                  {marker.kind === "boss" ? "☠" : "⚔"} {marker.title} · {marker.enemyName}
                  {marker.state === "cleared" ? " (cleared)" : ""}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <div className="actions">
          <button type="button" className="btn primary" onClick={leaveOverworld}>
            Back to the Guild Board
          </button>
        </div>
      </aside>
    </div>
  );
}
