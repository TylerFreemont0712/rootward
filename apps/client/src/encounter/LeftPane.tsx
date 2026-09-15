import type { EncounterView, ExpeditionView } from "@rootward/shared";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { Minimap } from "../map/Minimap.tsx";
import { ROOM_NAMES } from "../map/rooms.ts";
import { useGame } from "../state/store.ts";

const percent = (value: number, max: number) => `${max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))}%`;

export function LeftPane({ view }: { view: EncounterView }) {
  const expedition = useGame((s) => s.run?.expedition);
  return (
    <aside className="pane" aria-label="Expedition and status">
      {expedition ? <ExpeditionBlock expedition={expedition} view={view} /> : <PracticeBlock view={view} />}
      <Hud view={view} />
      <EnemyCard view={view} />
    </aside>
  );
}

function ExpeditionBlock({ expedition, view }: { expedition: ExpeditionView; view: EncounterView }) {
  const room = expedition.rooms.find((candidate) => candidate.id === view.roomId);
  return (
    <section className="block">
      <h3>
        Expedition · floor {(room?.floor ?? 0) + 1} of {expedition.floorCount}
      </h3>
      <Minimap expedition={expedition} playerClassName={view.player.className} />
      {room && (
        <p className="meta">
          {ROOM_NAMES[room.kind]} · {room.purpose}
          {view.status === "active" ? " · retreat is the way out" : ""}
        </p>
      )}
    </section>
  );
}

function PracticeBlock({ view }: { view: EncounterView }) {
  const leave = useGame((s) => s.leave);
  const finishOverworldEncounter = useGame((s) => s.finishOverworldEncounter);
  const inOverworld = useGame((s) => s.overworldMarkerId !== undefined);
  const active = view.status === "active";
  const onLeave = () => {
    if (!active || window.confirm(inOverworld ? "Retreat from this fight? It stays unfinished." : "Leave this practice fight? It stays unfinished.")) {
      if (inOverworld) void finishOverworldEncounter();
      else leave();
    }
  };
  return (
    <section className="block">
      <h3>{inOverworld ? "Overworld encounter" : "Practice fight"}</h3>
      <ul className="floors">
        <li className="here">
          <span className="g" aria-hidden="true">
            ⚔
          </span>
          Encounter · {view.enemy.name}
        </li>
      </ul>
      <div className="actions">
        <button type="button" className="btn" onClick={onLeave}>
          {!active ? (inOverworld ? "Back to the map" : "Back to the Guild Board") : inOverworld ? "Retreat to the map" : "Leave practice"}
        </button>
      </div>
    </section>
  );
}

function Hud({ view }: { view: EncounterView }) {
  const { player } = view;
  return (
    <section className="block" aria-label="Maintainer status">
      <h3>Maintainer · {player.className}</h3>
      <div className="stat">
        <span className="lbl">
          <StatIcon id="integrity" />
          Integrity
        </span>
        <span className="bar integrity">
          <i style={{ width: percent(player.integrity, player.integrityMax) }} />
        </span>
        <span className="val">{player.integrity}</span>
      </div>
      <div className="stat">
        <span className="lbl">
          <StatIcon id="focus" />
          Focus
        </span>
        <span className="pips" aria-hidden="true">
          {Array.from({ length: player.focusMax }, (_, index) => (
            <span key={index} className={index < player.focus ? "on" : ""} />
          ))}
        </span>
        <span className="val">
          {player.focus}/{player.focusMax}
        </span>
      </div>
      <div className="stat">
        <span className="lbl">
          <StatIcon id="cycles" />
          Cycles
        </span>
        <span />
        <span className="val">{player.cycles}</span>
      </div>
    </section>
  );
}

function StatIcon({ id }: { id: "integrity" | "focus" | "cycles" }) {
  const src = assetUrl("hud", id);
  return src ? <img className="stat-icon" src={src} alt="" /> : null;
}

function EnemyCard({ view }: { view: EncounterView }) {
  const { enemy } = view;
  const defeated = view.status === "won";
  const classes = ["block", "enemy", defeated ? "dead" : "", view.casts > 0 ? "shake" : ""].filter(Boolean).join(" ");
  const portrait = assetUrl("enemies", slugify(enemy.name));
  return (
    // Keying on HP remounts the card when HP changes, which replays the shake animation.
    <section key={enemy.hp} className={classes} aria-label={`Enemy: ${enemy.name}`}>
      {portrait ? (
        <img className="portrait" src={portrait} alt="" />
      ) : (
        enemy.art !== undefined && <pre aria-hidden="true">{enemy.art}</pre>
      )}
      <p className="name">{enemy.name}</p>
      <div className="tier">
        Tier {enemy.tier} · {view.challenge.realm}
      </div>
      <div className="stat">
        <span className="lbl">HP</span>
        <span className="bar hp">
          <i style={{ width: percent(enemy.hp, enemy.hpMax) }} />
        </span>
        <span className="val">
          {enemy.hpDisplayed}/{enemy.hpMax}
        </span>
      </div>
      <div className="move">{lastMove(view)}</div>
      <p className="taunt">{defeated ? enemy.defeat : (enemy.lastAction?.taunt ?? enemy.intro)}</p>
    </section>
  );
}

function lastMove({ enemy, casts, status }: EncounterView): string {
  const action = enemy.lastAction;
  if (!action) {
    if (status === "won") return "Defeated before it could move.";
    return casts === 0 ? "Waiting for your first Cast." : "No move yet.";
  }
  if (action.move === "strike") return `Last move: Strike (-${action.damage ?? 0} Integrity)`;
  return `Last move: Edge Case (a hidden ${action.category ?? ""} test joined)`;
}
