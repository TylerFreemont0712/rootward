import { useEffect } from "react";
import { ChallengeSelect } from "../screens/ChallengeSelect.tsx";
import { EncounterScreen } from "../screens/EncounterScreen.tsx";
import { useGame } from "../state/store.ts";

export function App() {
  const view = useGame((s) => s.view);
  const error = useGame((s) => s.error);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismiss);
  const loadChallenges = useGame((s) => s.loadChallenges);
  const resumeSavedRun = useGame((s) => s.resumeSavedRun);

  useEffect(() => {
    void resumeSavedRun();
    void loadChallenges();
  }, [loadChallenges, resumeSavedRun]);

  return (
    <>
      <div className="crt" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          ROOTWARD<small>M0 · a single encounter</small>
        </div>
        {view && (
          <div className="hud-mini" aria-label="Status summary">
            <span>
              Integrity <b>{view.player.integrity}</b>
            </span>
            <span>
              Focus <b>{view.player.focus}</b>/{view.player.focusMax}
            </span>
            <span>
              Cycles <b>{view.player.cycles}</b>
            </span>
            <span>{view.player.className}</span>
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
        {view ? <EncounterScreen view={view} /> : <ChallengeSelect />}
      </main>
      <footer className="statusbar">
        <span>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> Cast
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> Probe
        </span>
        <span className="right">wasm-js sandbox · no AI configured</span>
      </footer>
    </>
  );
}
