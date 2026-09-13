import type { DebriefView } from "@rootward/shared";
import { masteryName, masteryWidth } from "../learner/mastery.ts";
import { useGame } from "../state/store.ts";

const OUTCOMES: Readonly<Record<DebriefView["fights"][number]["outcome"], string>> = {
  won: "won",
  retreated: "retreated",
  exhausted: "out of Focus",
  "kernel-panic": "kernel panic",
};

const ENDINGS: Readonly<Record<NonNullable<DebriefView["endReason"]>, string>> = {
  completed: "The Legacy System fell. Here is what the expedition taught.",
  retreated: "You withdrew from the Legacy System. What you learned on the way down still counts.",
  "kernel-panic": "Kernel panic. Every Commit earned before it is kept.",
  abandoned: "The expedition was abandoned. The fights you finished still count.",
};

/** What a run changed (PROMPT.md section 5, step 5), without the parts that need AI or loot yet. */
export function DebriefScreen({ debrief }: { debrief: DebriefView }) {
  const leave = useGame((s) => s.leave);
  const bumped = debrief.versionAfter !== debrief.versionBefore;

  return (
    <div className="debrief">
      <header className="wide">
        <h1 className="crt-title big">Debrief</h1>
        <p className="narr">{debrief.endReason ? ENDINGS[debrief.endReason] : "This run is still under way."}</p>
      </header>

      <section className="block wide" aria-label="Summary">
        <div className="bigstat">
          <div>
            <b>
              {debrief.roomsCleared}/{debrief.floors}
            </b>
            <span>rooms cleared</span>
          </div>
          <div>
            <b>v{debrief.versionAfter}</b>
            <span>{bumped ? `up from v${debrief.versionBefore}` : "version"}</span>
          </div>
          <div>
            <b>+{debrief.commits}</b>
            <span>commits</span>
          </div>
          <div>
            <b>{debrief.crits}</b>
            <span>crits</span>
          </div>
          <div>
            <b>{debrief.retreats}</b>
            <span>retreats</span>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="debrief-concepts">
        <h3 id="debrief-concepts">Mastery by concept</h3>
        {debrief.concepts.length === 0 ? (
          <p className="meta">No fight finished, so there is no new evidence.</p>
        ) : (
          <ul className="progress-list">
            {debrief.concepts.map((concept) => (
              <li key={concept.id}>
                <span title={concept.id}>{concept.name}</span>
                <span className="bar mastery" aria-hidden="true">
                  <i style={{ width: masteryWidth(concept.masteryAfter) }} />
                </span>
                <span>
                  {masteryName(concept.masteryBefore)} → {masteryName(concept.masteryAfter)} · +{concept.commits} commits ·
                  rating {concept.ratingBefore} → {concept.ratingAfter}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block" aria-labelledby="debrief-rooms">
        <h3 id="debrief-rooms">Rooms</h3>
        <ol className="fight-list">
          {debrief.fights.map((fight) => (
            <li key={fight.roomId} className={fight.outcome === "won" ? undefined : "lost"}>
              <span>{fight.title}</span>
              <span>
                {OUTCOMES[fight.outcome]}
                {fight.commits > 0 ? ` · +${fight.commits}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="block" aria-labelledby="debrief-weak">
        <h3 id="debrief-weak">Weak spots</h3>
        {debrief.weakSpots.length === 0 ? (
          <p className="meta">No hidden test beat you on this run.</p>
        ) : (
          <ul className="fight-list">
            {debrief.weakSpots.map((spot) => (
              <li key={spot.category}>
                <span>{spot.category}</span>
                <span>{spot.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block wide" aria-labelledby="debrief-next">
        <h3 id="debrief-next">What to study next</h3>
        <p>
          {debrief.nextUp.length > 0
            ? `The next expedition would introduce ${debrief.nextUp.map((node) => node.name).join(", ")}.`
            : "No new concept has a challenge yet, so the next expedition will practice what you already know."}
        </p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={leave}>
            Back to the Guild Board →
          </button>
        </div>
      </section>
    </div>
  );
}
