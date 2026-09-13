import { useEffect } from "react";
import { EncounterScreen } from "../screens/EncounterScreen.tsx";
import { ExpeditionScreen } from "../screens/ExpeditionScreen.tsx";
import { GuildBoard } from "../screens/GuildBoard.tsx";
import { useGame } from "../state/store.ts";

export function App() {
  const run = useGame((s) => s.run);
  const screen = useGame((s) => s.screen);
  const error = useGame((s) => s.error);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismiss);
  const loadChallenges = useGame((s) => s.loadChallenges);
  const resumeSavedRun = useGame((s) => s.resumeSavedRun);

  useEffect(() => {
    void resumeSavedRun();
    void loadChallenges();
  }, [loadChallenges, resumeSavedRun]);

  const encounter = screen === "encounter" ? run?.encounter : undefined;
  const expedition = screen === "map" ? run?.expedition : undefined;

  let body = <GuildBoard />;
  if (run && encounter) body = <EncounterScreen view={encounter} />;
  else if (run && expedition) body = <ExpeditionScreen run={run} expedition={expedition} />;

  return (
    <>
      <div className="crt" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          ROOTWARD<small>M1 · expeditions</small>
        </div>
        {run && (
          <div className="hud-mini" aria-label="Status summary">
            <span>
              Integrity <b>{run.player.integrity}</b>
            </span>
            {encounter && (
              <span>
                Focus <b>{encounter.player.focus}</b>/{encounter.player.focusMax}
              </span>
            )}
            <span>
              Cycles <b>{run.player.cycles}</b>
            </span>
            <span>{run.player.className}</span>
          </div>
        )}
      </header>
      <main>
        {(error ?? notice) !== undefined && (
          <div className={error !== undefined ? "notice error" : "notice"} role={error !== undefined ? "alert" : "status"}>
            {error ?? notice}
            <button type="button" onClick={dismiss}>
              dismiss
            </button>
          </div>
        )}
        {body}
      </main>
      <footer className="statusbar">
        {expedition ? (
          <>
            <span>
              <kbd>←↑↓→</kbd> <kbd>hjkl</kbd> <kbd>WASD</kbd> walk · click to travel
            </span>
            <span>
              <kbd>Enter</kbd> step through a lit door
            </span>
          </>
        ) : (
          <>
            <span>
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> Cast
            </span>
            <span>
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> Probe
            </span>
          </>
        )}
        <span className="right">wasm sandboxes · no AI configured</span>
      </footer>
    </>
  );
}
