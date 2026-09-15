import { useEffect } from "react";
import { DebriefScreen } from "../screens/DebriefScreen.tsx";
import { EncounterScreen } from "../screens/EncounterScreen.tsx";
import { ExpeditionScreen } from "../screens/ExpeditionScreen.tsx";
import { GuildBoard } from "../screens/GuildBoard.tsx";
import { ProfileSelectScreen } from "../screens/ProfileSelectScreen.tsx";
import { WorldScreen } from "../screens/WorldScreen.tsx";
import { useGame } from "../state/store.ts";
import { Toasts } from "../world/Toasts.tsx";

export function App() {
  const activeProfile = useGame((s) => s.activeProfile);
  const run = useGame((s) => s.run);
  const debrief = useGame((s) => s.debrief);
  const screen = useGame((s) => s.screen);
  const error = useGame((s) => s.error);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismiss);
  const restoreProfile = useGame((s) => s.restoreProfile);
  const showWorld = useGame((s) => s.showWorld);
  const showBoard = useGame((s) => s.showBoard);

  useEffect(() => {
    void restoreProfile();
  }, [restoreProfile]);

  const encounter = screen === "encounter" ? run?.encounter : undefined;
  const expedition = screen === "map" ? run?.expedition : undefined;
  const inWorld = activeProfile !== undefined && screen === "world";

  let body = activeProfile ? inWorld ? <WorldScreen /> : <GuildBoard /> : <ProfileSelectScreen />;
  if (screen === "debrief" && debrief) body = <DebriefScreen debrief={debrief} />;
  else if (run && encounter) body = <EncounterScreen view={encounter} />;
  else if (run && expedition) body = <ExpeditionScreen run={run} expedition={expedition} />;
  const betweenRuns = activeProfile !== undefined && !encounter && !expedition && !(screen === "debrief" && debrief);

  return (
    <>
      <div className="crt" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          ROOTWARD<small>M1 · the Bastion</small>
        </div>
        {betweenRuns && (
          <nav className="topnav" aria-label="Places">
            <button type="button" className="btn" aria-current={inWorld ? "page" : undefined} onClick={showWorld}>
              The world
            </button>
            <button
              type="button"
              className="btn"
              aria-current={screen === "board" ? "page" : undefined}
              onClick={() => {
                showBoard();
              }}
            >
              Guild Board
            </button>
          </nav>
        )}
        {run && screen !== "debrief" && (
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
        <Toasts />
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
        ) : inWorld ? (
          <>
            <span>
              <kbd>←↑↓→</kbd> <kbd>WASD</kbd> walk · click to travel
            </span>
            <span>
              <kbd>E</kbd> talk, read, open · <kbd>1</kbd>-<kbd>9</kbd> answer · <kbd>Esc</kbd> walk away
            </span>
            <span>walk into a monster to fight it</span>
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
