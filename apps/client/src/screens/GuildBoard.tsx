import type { LearnerView } from "@rootward/shared";
import { useEffect } from "react";
import { masteryName, masteryWidth } from "../learner/mastery.ts";
import { useGame } from "../state/store.ts";

/** The Guild Board, inside the Bastion's Guild Hall (ADR-0011): read the Chronicle, or practice a single fight. Planned
 * expeditions left the board when Shardrun took their place; the world's doors and people open it at the section they mean. */
export function GuildBoard() {
  const challenges = useGame((s) => s.challenges);
  const learner = useGame((s) => s.learner);
  const activeProfile = useGame((s) => s.activeProfile);
  const switchProfile = useGame((s) => s.switchProfile);
  const startPractice = useGame((s) => s.startPractice);
  const busy = useGame((s) => s.busy);
  const showWorld = useGame((s) => s.showWorld);
  const boardSection = useGame((s) => s.boardSection);
  const clearBoardSection = useGame((s) => s.clearBoardSection);

  // Arriving from a door or a conversation in the world: scroll to the part of the board it pointed at.
  useEffect(() => {
    if (boardSection === undefined) return;
    document.getElementById(`${boardSection}-title`)?.scrollIntoView({ block: "start" });
    clearBoardSection();
  }, [boardSection, clearBoardSection]);

  return (
    <div className="select">
      <header className="hero">
        <h1>THE GUILD BOARD</h1>
        <p className="narr">
          Bit Rot is spreading through the Machine. Read what you have proven so far, or warm up on a single job. The
          Bastion&apos;s people, quests, and the Foundry&apos;s halls wait outside.
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={showWorld}>
            ← Back to the Bastion
          </button>
        </div>
        {activeProfile && (
          <p className="meta">
            Playing as {activeProfile.name} ·{" "}
            <button type="button" className="link" onClick={switchProfile}>
              switch character
            </button>
          </p>
        )}
      </header>

      {learner && <Chronicle learner={learner} />}

      <h2 id="practice-title" className="board-heading">Practice a single fight</h2>
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

/** Chronicle basics (PROMPT.md section 3): the Maintainer's version and every concept with evidence so far. */
function Chronicle({ learner }: { learner: LearnerView }) {
  const practiced = learner.nodes.filter((node) => node.attempts > 0);
  return (
    <section className="block card wide" aria-labelledby="chronicle-title">
      <h2 id="chronicle-title">Chronicle</h2>
      <div className="meta">
        Maintainer v{learner.version} · {learner.fights} fights finished · {learner.dungeonsCleared} expeditions completed
      </div>
      {practiced.length === 0 ? (
        <p className="narr">Nothing recorded yet. Every fight you finish becomes evidence here.</p>
      ) : (
        <ul className="progress-list columns">
          {practiced.map((node) => (
            <li key={node.id}>
              <span title={node.id}>{node.name}</span>
              <span className="bar mastery" aria-hidden="true">
                <i style={{ width: masteryWidth(node.mastery) }} />
              </span>
              <span>
                {masteryName(node.mastery)} · {node.wins} of {node.attempts} won · {node.commits} commits
              </span>
            </li>
          ))}
        </ul>
      )}
      {learner.weakSpots.length > 0 && (
        <p className="meta">
          Weak spots: {learner.weakSpots.map((spot) => `${spot.category} (${spot.count})`).join(", ")}
        </p>
      )}
    </section>
  );
}
