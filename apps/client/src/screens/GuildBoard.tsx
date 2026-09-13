import type { SessionLength } from "@rootward/shared";
import { useState } from "react";
import { useGame } from "../state/store.ts";

const LENGTHS: readonly SessionLength[] = ["short", "standard", "long"];
/** Kickoff decision 6 (docs/ROADMAP.md): long expeditions unless the player picks otherwise. */
const DEFAULT_LENGTH: SessionLength = "long";

/** M1's stand-in for the Bastion: descend on an expedition, or practice a single fight. */
export function GuildBoard() {
  const challenges = useGame((s) => s.challenges);
  const startPractice = useGame((s) => s.startPractice);
  const startExpedition = useGame((s) => s.startExpedition);
  const busy = useGame((s) => s.busy);
  const [length, setLength] = useState<SessionLength>(DEFAULT_LENGTH);
  const languages = [...new Set(challenges.flatMap((challenge) => challenge.playableLanguages))].sort();

  return (
    <div className="select">
      <header className="hero">
        <h1>THE GUILD BOARD</h1>
        <p className="narr">
          Bit Rot is spreading through the Machine. Descend toward Root through a dungeon planned around what you know,
          or warm up on a single job first.
        </p>
      </header>

      <section className="block card wide" aria-labelledby="descend-title">
        <h2 id="descend-title">Descend</h2>
        <div className="meta">Artificer · Oath of the Foundry · the planner picks the rooms and says why</div>
        <div className="actions" role="group" aria-label="Expedition length">
          {LENGTHS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={length === option}
              className={length === option ? "btn primary" : "btn"}
              onClick={() => {
                setLength(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="actions spaced">
          {languages.map((language) => (
            <button
              key={language}
              type="button"
              className="btn primary"
              disabled={busy !== undefined}
              onClick={() => void startExpedition(language, length)}
            >
              Descend in {language}
            </button>
          ))}
          {languages.length === 0 && busy !== "loading" && (
            <span className="meta">No language has a sandbox on this machine yet.</span>
          )}
        </div>
      </section>

      <h2 className="board-heading">Practice a single fight</h2>
      {busy === "loading" && <p>Reading the board…</p>}
      {challenges.map((challenge) => (
        <section className="block card" key={challenge.id}>
          <h2>{challenge.title}</h2>
          <div className="meta">
            {challenge.realm} · difficulty {challenge.difficulty} · ~{challenge.estimatedMinutes} min · enemy:{" "}
            {challenge.enemyName}
          </div>
          <div className="actions">
            {challenge.languages.map((language) => {
              const playable = challenge.playableLanguages.includes(language);
              return (
                <button
                  key={language}
                  type="button"
                  className="btn"
                  disabled={!playable || busy !== undefined}
                  title={playable ? `Practice in ${language}` : `${language} needs its sandbox runner`}
                  onClick={() => void startPractice(challenge.id, language)}
                >
                  Practice in {language}
                  {!playable && <small>soon</small>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
