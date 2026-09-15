import { countCodeLines, findBannedTokens } from "@rootward/runners/static";
import type { EncounterView } from "@rootward/shared";
import Markdown from "react-markdown";
import { CodeEditor } from "../editor/CodeEditor.tsx";
import { type CenterTab, useGame } from "../state/store.ts";

const BONUS_LABELS: Readonly<Record<string, string>> = {
  crit: "Crit: every test passed on the first Cast",
  true_sight: "True Sight: hidden tests passed without Inspect",
  efficiency: "Efficiency: within the reference solution's time band",
  elegance: "Elegance",
  unaided: "Unaided: no hints",
};

export function CenterPane({ view }: { view: EncounterView }) {
  const tab = useGame((s) => s.tab);
  return (
    <div className="pane" aria-label="Task and editor">
      <div className="tabs" role="tablist" aria-label="Center panels">
        <TabButton tab="task" current={tab} label="Task" />
        <TabButton tab="editor" current={tab} label={`Editor · ${view.challenge.entry}`} />
      </div>
      <TaskPanel view={view} hidden={tab !== "task"} />
      <EditorPanel view={view} hidden={tab !== "editor"} />
      <ActionBar view={view} />
      <Hints view={view} />
      <Outcome view={view} />
    </div>
  );
}

function TabButton({ tab, current, label }: { tab: CenterTab; current: CenterTab; label: string }) {
  const setTab = useGame((s) => s.setTab);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === current}
      onClick={() => {
        setTab(tab);
      }}
    >
      {label}
    </button>
  );
}

function TaskPanel({ view, hidden }: { view: EncounterView; hidden: boolean }) {
  const setTab = useGame((s) => s.setTab);
  const { challenge } = view;
  const visible = view.tests.filter((t) => t.visibility === "visible").length;
  return (
    <section role="tabpanel" className="task" hidden={hidden} aria-label="Task">
      <h1>{challenge.title}</h1>
      <div className="meta">
        <span>{challenge.id}</span>
        <span>difficulty {challenge.difficulty}</span>
        <span>~{challenge.estimatedMinutes} min</span>
        <span>{challenge.language}</span>
      </div>
      <div>
        {challenge.concepts.map((concept) => (
          <span key={concept} className="tag">
            {concept}
          </span>
        ))}
      </div>
      <p className="narr">{challenge.intro}</p>
      <div className="markdown">
        <Markdown>{challenge.prompt}</Markdown>
      </div>
      <p className="meta">
        Tests: {visible} visible, {view.tests.length - visible} hidden (hidden tests count double).
        {challenge.maxLines !== undefined ? ` At most ${challenge.maxLines} code lines.` : ""}
        {challenge.targetComplexity !== undefined ? ` Target: ${challenge.targetComplexity}.` : ""}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setTab("editor");
          }}
        >
          Open the editor →
        </button>
      </div>
    </section>
  );
}

function EditorPanel({ view, hidden }: { view: EncounterView; hidden: boolean }) {
  const files = useGame((s) => s.files);
  const editFile = useGame((s) => s.editFile);
  const cast = useGame((s) => s.cast);
  const probe = useGame((s) => s.probe);
  const { entry, language, maxLines, bannedTokens } = view.challenge;
  const source = files[entry] ?? "";
  const lines = countCodeLines(source, language);
  const banned = findBannedTokens(source, language, bannedTokens);

  return (
    <section role="tabpanel" hidden={hidden} aria-label="Editor">
      <div className="editor-frame">
        <CodeEditor
          value={source}
          language={language}
          label={`Code editor for ${entry}`}
          readOnly={view.status !== "active"}
          onChange={(value) => {
            editFile(entry, value);
          }}
          onCast={() => {
            void cast();
          }}
          onProbe={() => {
            void probe();
          }}
        />
      </div>
      <div className="editor-status">
        <span>{language} · wasm sandbox</span>
        <span className={maxLines !== undefined && lines > maxLines ? "bad" : ""}>
          {lines} code lines{maxLines !== undefined ? ` / max ${maxLines}` : ""}
        </span>
        {bannedTokens.length > 0 && (
          <span className={banned.length > 0 ? "bad" : "ok"}>
            {banned.length > 0 ? `banned: ${banned.join(", ")}` : "no banned tokens"}
          </span>
        )}
      </div>
    </section>
  );
}

function ActionBar({ view }: { view: EncounterView }) {
  const busy = useGame((s) => s.busy);
  const probe = useGame((s) => s.probe);
  const cast = useGame((s) => s.cast);
  const hint = useGame((s) => s.hint);
  const retreat = useGame((s) => s.retreat);
  const resetToStarter = useGame((s) => s.resetToStarter);
  const ready = view.status === "active" && busy === undefined;
  const nextCost = view.hints.nextCost;
  const canHint = ready && nextCost !== undefined && nextCost <= view.player.cycles;

  return (
    <div className="actions" aria-label="Actions">
      <button type="button" className="btn" disabled={!ready} onClick={() => void probe()} title="Ctrl+Shift+Enter">
        ▷ Probe <small>{busy === "probe" ? "running…" : "free · visible tests"}</small>
      </button>
      <button
        type="button"
        className="btn primary"
        disabled={!ready || view.player.focus < 1}
        onClick={() => void cast()}
        title="Ctrl+Enter"
      >
        ✦ Cast <small>{busy === "cast" ? "casting…" : "1 Focus · all tests"}</small>
      </button>
      <button type="button" className="btn" disabled={!canHint} onClick={() => void hint()}>
        ? Hint{" "}
        <small>
          {view.status !== "active" ? "fight over" : nextCost !== undefined ? `${nextCost} Cycles` : "ladder spent"}
        </small>
      </button>
      <button
        type="button"
        className="btn danger"
        disabled={!ready}
        onClick={() => {
          if (window.confirm("Retreat? You will see the reference solution and get no loot.")) void retreat();
        }}
      >
        ↩ Retreat
      </button>
      <button type="button" className="btn" disabled={!ready} onClick={resetToStarter}>
        Reset to starter <small>free</small>
      </button>
    </div>
  );
}

function Hints({ view }: { view: EncounterView }) {
  if (view.hints.taken.length === 0) return null;
  return (
    <section aria-label="Hints">
      {view.hints.taken.map((hint) => (
        <div key={hint.level} className="hint">
          <div className="lvl">
            Hint {hint.level} of {view.hints.total} · {hint.name} · -{hint.cost} Cycles
          </div>
          <div className="markdown">
            <Markdown>{hint.text}</Markdown>
          </div>
        </div>
      ))}
    </section>
  );
}

function Outcome({ view }: { view: EncounterView }) {
  const leave = useGame((s) => s.leave);
  const showMap = useGame((s) => s.showMap);
  const finishWorldEncounter = useGame((s) => s.finishWorldEncounter);
  const inExpedition = useGame((s) => s.run?.expedition !== undefined);
  const inWorld = useGame((s) => s.worldMarkerId !== undefined);
  const runEnded = useGame((s) => s.run?.status === "ended");
  const back = (
    <div className="actions">
      {inWorld ? (
        <button type="button" className="btn primary" onClick={() => void finishWorldEncounter()}>
          Back to the world →
        </button>
      ) : inExpedition ? (
        <button type="button" className="btn primary" onClick={showMap}>
          {runEnded ? "See how the expedition ended →" : "Continue to the map →"}
        </button>
      ) : (
        <button type="button" className="btn primary" onClick={leave}>
          Back to the Guild Board →
        </button>
      )}
    </div>
  );

  if (view.status === "won" && view.rewards) {
    return (
      <section className="outcome won" aria-live="polite">
        <h3>{view.enemy.name} defeated</h3>
        <p className="narr">{view.enemy.defeat}</p>
        <ul>
          {view.rewards.bonuses.map((bonus) => (
            <li key={bonus}>
              <b>{BONUS_LABELS[bonus] ?? bonus}</b>
            </li>
          ))}
          <li>
            +{view.rewards.commits} Commits for {view.challenge.concepts.join(", ")}
          </li>
          <li>+{view.rewards.cycles} Cycles</li>
        </ul>
        {back}
      </section>
    );
  }

  if ((view.status === "retreated" || view.status === "exhausted") && view.retreat) {
    return (
      <section className="outcome" aria-live="polite">
        <div className="lvl">
          {view.status === "retreated" ? "Retreat" : "Out of Focus"} · reference solution shown · no loot
        </div>
        {view.retreat.explanation !== undefined && (
          <div className="markdown">
            <Markdown>{view.retreat.explanation}</Markdown>
          </div>
        )}
        {Object.entries(view.retreat.solutionFiles).map(([path, contents]) => (
          <div key={path}>
            <div className="lvl">{path}</div>
            <pre className="console">{contents}</pre>
          </div>
        ))}
        {back}
      </section>
    );
  }
  return null;
}
