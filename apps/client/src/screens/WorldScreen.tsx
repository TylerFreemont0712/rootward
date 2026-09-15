import type { Point } from "@rootward/core/map";
import type { WorldView, ZoneView } from "@rootward/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { useGame } from "../state/store.ts";
import { Ambience } from "../world/Ambience.tsx";
import { DialogueBox } from "../world/DialogueBox.tsx";
import {
  approachRoute,
  type Facing,
  facingToward,
  isNear,
  nearbyTarget,
  nextStep,
  passableIn,
  revealedAround,
  routeTo,
  type Target,
  targetAt,
  triggerAt,
  type Walker,
} from "../world/interactions.ts";
import { Journal } from "../world/Journal.tsx";
import { WorldRenderer } from "../world/WorldRenderer.tsx";

/** Milliseconds per tile, walking or following a clicked route. */
const STEP_MS = 140;
/** How often held keys and routes are checked; steps still happen only every STEP_MS. */
const TICK_MS = 20;
/** How long to wait after walking stops before saving the position, so a long walk is one request. */
const PERSIST_DEBOUNCE_MS = 400;

const DIRECTION_KEYS: Readonly<Record<string, Facing>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  k: "up",
  j: "down",
  h: "left",
  l: "right",
};
const USE_KEYS = new Set(["e", "Enter", " "]);

/** Zones whose title card has played this session, so coming back from a fight does not replay it. */
const titledZones = new Set<string>();

/** The walkable world (ADR-0011), or the arrival screen for a character who has not entered it yet. */
export function WorldScreen() {
  const world = useGame((s) => s.world);
  const loaded = useGame((s) => s.worldLoaded);
  const epoch = useGame((s) => s.worldEpoch);
  if (!loaded) {
    return (
      <div className="select">
        <p className="narr">The road to the Bastion…</p>
      </div>
    );
  }
  if (!world) return <Arrival />;
  // A remount per zone, and whenever the world is re-read, drops the previous walker, fog, and triggers.
  return <WorldPlay key={`${world.zone.id}:${epoch}`} world={world} />;
}

function Arrival() {
  const challenges = useGame((s) => s.challenges);
  const startWorld = useGame((s) => s.startWorld);
  const showBoard = useGame((s) => s.showBoard);
  const busy = useGame((s) => s.busy);
  const languages = [...new Set(challenges.flatMap((challenge) => challenge.playableLanguages))].sort();
  return (
    <div className="select arrival">
      <header className="hero">
        <h1>THE BASTION</h1>
        <p className="narr">
          The road ends at the Guild&apos;s town: bread, bells, and the far-off hum of the Machine. Below it, forgotten fixes
          are rotting into monsters, and the Guild needs another Maintainer.
        </p>
      </header>
      <section className="block card wide" aria-labelledby="arrive-title">
        <h2 id="arrive-title">Which language do you fight in?</h2>
        <div className="meta">Every fight in the world is played in it. You can switch later from the side panel.</div>
        <div className="actions spaced">
          {languages.map((language) => (
            <button key={language} type="button" className="btn primary" disabled={busy !== undefined} onClick={() => void startWorld(language)}>
              Arrive with {language}
            </button>
          ))}
          {languages.length === 0 && busy !== "loading" && <span className="meta">No language has a sandbox on this machine yet.</span>}
        </div>
      </section>
      <section className="block card wide">
        <h2>Rather skip the walk?</h2>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              showBoard("descend");
            }}
          >
            Go straight to the Guild Board
          </button>
        </div>
      </section>
    </div>
  );
}

function WorldPlay({ world }: { world: WorldView }) {
  const { zone } = world;
  const moveWorld = useGame((s) => s.moveWorld);
  const startWorldEncounter = useGame((s) => s.startWorldEncounter);
  const travel = useGame((s) => s.travel);
  const talk = useGame((s) => s.talk);
  const inspect = useGame((s) => s.inspect);
  const choose = useGame((s) => s.choose);
  const closeConversation = useGame((s) => s.closeConversation);
  const conversation = useGame((s) => s.conversation);
  const busy = useGame((s) => s.busy);
  const classId = useGame((s) => s.activeProfile?.classId);

  const canStep = useMemo(() => passableIn(zone), [zone]);
  const [walker, setWalker] = useState<Walker>(() => ({ avatar: world.position, route: [], facing: "down" }));
  const [held, setHeld] = useState<readonly Facing[]>([]);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => revealedAround(zone, world.position, zone.sight));
  const [visitedFor, setVisitedFor] = useState<Point>(world.position);
  const [showTitle] = useState(() => !titledZones.has(zone.id));

  const walkerRef = useRef(walker);
  const heldRef = useRef<readonly Facing[]>([]);
  const lastStepAt = useRef(0);
  // Seeded with whatever the Maintainer arrives standing on (returning from a lost fight, say), so it does not fire
  // again until they step off it and back on.
  const triggered = useRef(triggerAt(zone, world.position)?.id);
  const locked = conversation !== undefined || busy !== undefined;
  const lockedRef = useRef(locked);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    titledZones.add(zone.id);
  }, [zone.id]);

  // Ground once seen stays revealed while the Maintainer walks on; grown during render (React's pattern for state
  // derived from a changing value) rather than in an effect.
  if (zone.sight !== undefined && (visitedFor.x !== walker.avatar.x || visitedFor.y !== walker.avatar.y)) {
    setVisitedFor(walker.avatar);
    const around = revealedAround(zone, walker.avatar, zone.sight);
    if ([...around].some((key) => !visited.has(key))) setVisited(new Set([...visited, ...around]));
  }

  const commit = useCallback((next: Walker) => {
    walkerRef.current = next;
    setWalker(next);
  }, []);

  const use = useCallback(
    (target: Target, from: Point) => {
      // Save the position first: the server checks the Maintainer is really standing beside what they use.
      void moveWorld(from.x, from.y).then(() => (target.kind === "npc" ? talk(target.id) : inspect(target.id)));
    },
    [moveWorld, talk, inspect],
  );

  /** Arriving on a tile: open markers and portals trigger, and a walk-up interaction happens once beside its target. */
  const arrive = useCallback(
    (next: Walker) => {
      if (next.route.length > 0) return;
      const trigger = triggerAt(zone, next.avatar);
      if (!trigger) {
        triggered.current = undefined;
      } else if (triggered.current !== trigger.id) {
        triggered.current = trigger.id;
        heldRef.current = [];
        setHeld([]);
        void moveWorld(next.avatar.x, next.avatar.y).then(() =>
          trigger.kind === "marker" ? startWorldEncounter(trigger.id) : travel(trigger.id),
        );
        return;
      }
      const target = next.then;
      if (target && isNear(next.avatar, target)) {
        commit({ ...next, then: undefined, facing: facingToward(next.avatar, target) ?? next.facing });
        use(target, next.avatar);
      }
    },
    [zone, moveWorld, startWorldEncounter, travel, commit, use],
  );

  const step = useCallback(
    (direction: Facing | undefined) => {
      const current = walkerRef.current;
      const next = nextStep(current, direction, canStep);
      if (next === current) return;
      if (next.avatar !== current.avatar) lastStepAt.current = performance.now();
      commit(next);
      arrive(next);
    },
    [canStep, commit, arrive],
  );

  const interact = useCallback(() => {
    const current = walkerRef.current;
    const target = nearbyTarget(zone, current.avatar, current.facing);
    if (!target) return;
    commit({ ...current, route: [], then: undefined, facing: facingToward(current.avatar, target) ?? current.facing });
    use(target, current.avatar);
  }, [zone, commit, use]);

  // The latest callbacks, for the interval and key listeners below, which are set up once per mount.
  const stepRef = useRef(step);
  const interactRef = useRef(interact);
  useEffect(() => {
    stepRef.current = step;
    interactRef.current = interact;
  }, [step, interact]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lockedRef.current || performance.now() - lastStepAt.current < STEP_MS) return;
      if (walkerRef.current.route.length === 0 && heldRef.current.length === 0) return;
      stepRef.current(heldRef.current.at(-1));
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const keyOf = (event: KeyboardEvent) => (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const release = (direction: Facing | undefined) => {
      if (!direction) return;
      heldRef.current = heldRef.current.filter((candidate) => candidate !== direction);
      setHeld(heldRef.current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || lockedRef.current) return;
      const element = event.target instanceof HTMLElement ? event.target : undefined;
      if (element?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = keyOf(event);
      const direction = DIRECTION_KEYS[key];
      if (direction) {
        event.preventDefault();
        if (!heldRef.current.includes(direction)) {
          heldRef.current = [...heldRef.current, direction];
          setHeld(heldRef.current);
        }
        const current = walkerRef.current;
        if (current.route.length > 0) commit({ ...current, route: [], then: undefined });
        // The first press steps at once; holding the key keeps stepping at the walking pace from the interval.
        if (!event.repeat && performance.now() - lastStepAt.current >= STEP_MS) stepRef.current(direction);
      } else if (USE_KEYS.has(key) && !event.repeat && !(element instanceof HTMLButtonElement)) {
        event.preventDefault();
        interactRef.current();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      release(DIRECTION_KEYS[keyOf(event)]);
    };
    const onBlur = () => {
      heldRef.current = [];
      setHeld([]);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [commit]);

  // Save where walking stopped. Anything that leaves the screen (a fight, a portal, a conversation) saves first itself.
  useEffect(() => {
    if (walker.route.length > 0 || held.length > 0) return;
    const { x, y } = walker.avatar;
    if (x === world.position.x && y === world.position.y) return;
    const timer = window.setTimeout(() => {
      void moveWorld(x, y);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [walker.avatar, walker.route.length, held.length, world.position, moveWorld]);

  const goTo = useCallback(
    (point: Point) => {
      if (lockedRef.current) return;
      const current = walkerRef.current;
      const target = targetAt(zone, point);
      if (target && isNear(current.avatar, target)) {
        commit({ ...current, route: [], then: undefined, facing: facingToward(current.avatar, target) ?? current.facing });
        use(target, current.avatar);
        return;
      }
      const route = target ? approachRoute(zone, current.avatar, target) : routeTo(zone, current.avatar, point);
      if (route && route.length > 1) commit({ ...current, route: route.slice(1), then: target });
    },
    [zone, commit, use],
  );

  const prompt = walker.route.length === 0 ? nearbyTarget(zone, walker.avatar, walker.facing) : undefined;

  return (
    <div className="worldwrap">
      <section className={`world-main ${zone.kind}`} aria-label={zone.name}>
        <WorldRenderer
          zone={zone}
          avatar={walker.avatar}
          facing={walker.facing}
          walking={walker.route.length > 0 || held.length > 0}
          stepMs={STEP_MS}
          revealed={zone.sight !== undefined ? visited : undefined}
          avatarArt={classId !== undefined ? assetUrl("avatars", slugify(classId)) : undefined}
          nearbyNpcId={prompt?.kind === "npc" ? prompt.id : undefined}
          onTileClick={goTo}
        />
        <Ambience kind={zone.ambience} />
        {showTitle && (
          <div className="zone-title" aria-hidden="true">
            <div className="zone-name">{zone.name}</div>
            <div className="zone-arrival">{zone.arrival}</div>
          </div>
        )}
        {prompt && !conversation && (
          <div className="w-prompt">
            <kbd>E</kbd> {prompt.kind === "npc" ? "Talk to" : "Look at"} {prompt.label}
          </div>
        )}
        {conversation && (
          <DialogueBox
            key={`${conversation.npcId ?? ""}:${conversation.nodeId ?? ""}:${conversation.text}`}
            conversation={conversation}
            busy={busy !== undefined}
            onChoose={(index) => void choose(index)}
            onClose={closeConversation}
          />
        )}
      </section>
      <aside className="pane world-side" aria-label="Journal and surroundings">
        <ZoneBlock world={world} />
        <Journal quests={world.quests} />
        <Surroundings zone={zone} onGo={goTo} />
      </aside>
    </div>
  );
}

function ZoneBlock({ world }: { world: WorldView }) {
  const challenges = useGame((s) => s.challenges);
  const startWorld = useGame((s) => s.startWorld);
  const showBoard = useGame((s) => s.showBoard);
  const busy = useGame((s) => s.busy);
  const others = [...new Set(challenges.flatMap((challenge) => challenge.playableLanguages))]
    .filter((language) => language !== world.language)
    .sort();
  return (
    <section className="block">
      <h3>{world.zone.kind === "town" ? "Town" : "Wilds"}</h3>
      <p className="crt-title">{world.zone.name}</p>
      <p className="meta">
        Fights here are played in <b>{world.language}</b>
        {others.map((language) => (
          <button key={language} type="button" className="link" disabled={busy !== undefined} onClick={() => void startWorld(language)}>
            {" "}
            · switch to {language}
          </button>
        ))}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            showBoard("descend");
          }}
        >
          Open the Guild Board
        </button>
      </div>
    </section>
  );
}

/** Everything in the zone as buttons: the way to get anywhere without aiming the mouse at the map. */
function Surroundings({ zone, onGo }: { zone: ZoneView; onGo: (point: Point) => void }) {
  return (
    <section className="block">
      <h3>Around you</h3>
      {zone.npcs.length > 0 && (
        <ul className="doors" aria-label="People">
          {zone.npcs.map((npc) => (
            <li key={npc.id}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onGo(npc);
                }}
              >
                {npc.indicator && <b className={`ind ${npc.indicator}`}>{npc.indicator === "offer" ? "! " : "? "}</b>}
                {npc.name}
                {npc.title !== undefined && <small> · {npc.title}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {zone.markers.length > 0 && (
        <ul className="doors" aria-label="Fights">
          {zone.markers.map((marker) => (
            <li key={marker.id}>
              <button
                type="button"
                className="btn"
                disabled={marker.state === "sealed"}
                onClick={() => {
                  onGo(marker);
                }}
              >
                {marker.kind === "boss" ? "☠" : "⚔"} {marker.title} · {marker.enemyName}
                {marker.state === "cleared" ? " (won)" : marker.state === "sealed" ? " (sealed)" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {zone.portals.length > 0 && (
        <ul className="doors" aria-label="Ways out">
          {zone.portals.map((portal) => (
            <li key={portal.id}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onGo(portal);
                }}
              >
                ➜ {portal.label}
                {portal.locked ? " (locked)" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
