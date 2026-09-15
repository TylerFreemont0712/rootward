import type { QuestView } from "@rootward/shared";

/** The quest journal: what is in progress and what is finished, straight from the server's view of the objectives. */
export function Journal({ quests }: { quests: readonly QuestView[] }) {
  const open = quests.filter((quest) => quest.status !== "done");
  const done = quests.filter((quest) => quest.status === "done");
  return (
    <section className="block journal" aria-labelledby="journal-title">
      <h3 id="journal-title">Journal</h3>
      {open.length === 0 && (
        <p className="meta">
          Nothing in progress. Look for a <b className="ind offer">!</b> over someone&apos;s head.
        </p>
      )}
      <ul className="quests">
        {open.map((quest) => (
          <li key={quest.id} className={`quest ${quest.status}`}>
            <div className="quest-name">{quest.name}</div>
            <div className="meta">
              {quest.status === "ready" ? (
                <>
                  <b className="ind turn-in">?</b> Done: return to {quest.giverName}
                </>
              ) : (
                <>For {quest.giverName}</>
              )}
            </div>
            <p className="quest-summary">{quest.summary}</p>
            <ul className="objectives">
              {quest.objectives.map((objective) => (
                <li key={objective.text} className={objective.done ? "done" : undefined}>
                  <span aria-hidden="true">{objective.done ? "☑" : "☐"}</span> {objective.text}
                  {objective.target > 1 && ` (${objective.current}/${objective.target})`}
                  <span className="sr-only">{objective.done ? " (done)" : " (not yet)"}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="quests-done">
          <summary>Completed ({done.length})</summary>
          <ul>
            {done.map((quest) => (
              <li key={quest.id}>
                <b>{quest.name}</b>
                {quest.rewardText !== undefined && <p className="meta">{quest.rewardText}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
