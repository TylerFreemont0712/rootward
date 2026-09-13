import type { EncounterView, TestView } from "@rootward/shared";
import { lintSays } from "./lint.ts";

export function RightPane({ view }: { view: EncounterView }) {
  const ran = view.tests.filter((t) => t.status !== "idle");
  const passing = ran.filter((t) => t.status === "pass").length;

  return (
    <aside className="pane" aria-label="Lint, tests, and console">
      <section className="block">
        <h3>Lint</h3>
        <div className="chat" aria-live="polite">
          {lintSays(view).map((line) => (
            <div className="msg" key={line}>
              <span className="who">Lint</span>
              <span className="txt">{line}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h3>Tests · {ran.length > 0 ? `${passing} / ${ran.length} passing` : "not run"}</h3>
        <ul className="tests">
          {view.tests.map((test) => (
            <TestRow key={test.id} test={test} />
          ))}
        </ul>
      </section>

      <section className="block">
        <h3>Console</h3>
        <pre className="console">{view.lastRun?.console ?? "$ (idle) Probe or Cast to run your code."}</pre>
      </section>

      {view.log.length > 0 && (
        <section className="block">
          <h3>Combat log</h3>
          <ol className="log">
            {view.log.map((entry, index) => (
              <li key={index} className={entry.kind}>
                {entry.text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

function TestRow({ test }: { test: TestView }) {
  const glyph = test.status === "pass" ? "✔" : test.status === "fail" ? "✘" : "·";
  const hidden = test.visibility === "hidden";
  const showDetail = test.status === "fail" && (test.message !== undefined || test.expected !== undefined);

  return (
    <li className={`${test.status}${hidden ? " hidden" : ""}`}>
      {/* The glyph has a text label too, so pass/fail never depends on color alone. */}
      <span className="s" role="img" aria-label={test.status === "idle" ? "not run" : test.status}>
        {glyph}
      </span>
      <span className="n">
        {hidden ? `hidden · ${test.label}` : test.label}
        {test.revealed ? " (revealed by the enemy)" : ""}
      </span>
      <span className="ms">{test.durationMs !== undefined ? `${Math.round(test.durationMs)} ms` : ""}</span>
      {showDetail && (
        <pre className="detail">
          {test.message !== undefined && `${test.message}\n`}
          {test.input !== undefined && (
            <>
              <b>input</b>
              {`\n${test.input}\n`}
            </>
          )}
          {test.expected !== undefined && (
            <>
              <b>expected</b>
              {`\n${test.expected}\n`}
            </>
          )}
          {test.actual !== undefined && (
            <>
              <b>actual</b>
              {`\n${test.actual}`}
            </>
          )}
        </pre>
      )}
    </li>
  );
}
