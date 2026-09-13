import { useGame } from "../state/store.ts";

/** M0's stand-in for the Bastion: pick a challenge and a language. The real hub and map arrive in M1. */
export function ChallengeSelect() {
  const challenges = useGame((s) => s.challenges);
  const start = useGame((s) => s.start);
  const busy = useGame((s) => s.busy);

  return (
    <div className="select">
      <header className="hero">
        <h1>THE GUILD BOARD</h1>
        <p className="narr">
          Bit Rot is spreading through the Machine. The Guild has one job posted today. Pick a language and descend.
        </p>
      </header>
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
                  className={playable ? "btn primary" : "btn"}
                  disabled={!playable || busy !== undefined}
                  title={playable ? `Fight in ${language}` : `${language} needs its sandbox runner (M1)`}
                  onClick={() => void start(challenge.id, language)}
                >
                  {language}
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
