import type { EncounterView } from "@rootward/shared";
import { useGame } from "../state/store.ts";

const percent = (value: number, max: number) => `${max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))}%`;

export function LeftPane({ view }: { view: EncounterView }) {
  const leave = useGame((s) => s.leave);
  const active = view.status === "active";
  const onLeave = () => {
    if (!active || window.confirm("Leave this encounter? It stays unfinished on the server until it restarts.")) leave();
  };

  return (
    <aside className="pane" aria-label="Expedition and status">
      <section className="block">
        <h3>Expedition · floor 1 of 1</h3>
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
            {active ? "Leave encounter" : "Back to the Guild Board"}
          </button>
        </div>
      </section>
      <Hud view={view} />
      <EnemyCard view={view} />
    </aside>
  );
}

function Hud({ view }: { view: EncounterView }) {
  const { player } = view;
  return (
    <section className="block" aria-label="Maintainer status">
      <h3>Maintainer · {player.className}</h3>
      <div className="stat">
        <span className="lbl">Integrity</span>
        <span className="bar integrity">
          <i style={{ width: percent(player.integrity, player.integrityMax) }} />
        </span>
        <span className="val">{player.integrity}</span>
      </div>
      <div className="stat">
        <span className="lbl">Focus</span>
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
        <span className="lbl">Cycles</span>
        <span />
        <span className="val">{player.cycles}</span>
      </div>
    </section>
  );
}

function EnemyCard({ view }: { view: EncounterView }) {
  const { enemy } = view;
  const defeated = view.status === "won";
  const classes = ["block", "enemy", defeated ? "dead" : "", view.casts > 0 ? "shake" : ""].filter(Boolean).join(" ");
  return (
    // Keying on HP remounts the card when HP changes, which replays the shake animation.
    <section key={enemy.hp} className={classes} aria-label={`Enemy: ${enemy.name}`}>
      {enemy.art !== undefined && <pre aria-hidden="true">{enemy.art}</pre>}
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
