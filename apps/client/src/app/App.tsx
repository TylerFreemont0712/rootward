import { useEffect } from "react";
import { MusicDirector } from "../audio/MusicDirector.tsx";
import { SoundButton } from "../audio/SoundControls.tsx";
import { DebriefScreen } from "../screens/DebriefScreen.tsx";
import { EncounterScreen } from "../screens/EncounterScreen.tsx";
import { ExpeditionScreen } from "../screens/ExpeditionScreen.tsx";
import { CodexScreen } from "../screens/CodexScreen.tsx";
import { GuildBoard } from "../screens/GuildBoard.tsx";
import { MainMenu } from "../screens/MainMenu.tsx";
import { ShardrunScreen } from "../screens/ShardrunScreen.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { TitleScreen } from "../screens/TitleScreen.tsx";
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
  const showMenu = useGame((s) => s.showMenu);
  const showCodex = useGame((s) => s.showCodex);
  const deckRun = useShardrun((s) => s.playstyle === "deck");

  useEffect(() => {
    void restoreProfile();
  }, [restoreProfile]);

  const banner = (error ?? notice) !== undefined && (
    <div className={error !== undefined ? "notice error" : "notice"} role={error !== undefined ? "alert" : "status"}>
      {error ?? notice}
      <button type="button" onClick={dismiss}>
        dismiss
      </button>
    </div>
  );

  // Before a character is chosen, the title screen is the whole page: no bars around it.
  if (!activeProfile) {
    return (
      <>
        <div className="crt" aria-hidden="true" />
        <MusicDirector />
        <main>
          {banner}
          <TitleScreen />
        </main>
      </>
    );
  }

  // The main menu is a whole page too: it is where a mode is chosen, so no mode's bars belong on it.
  if (screen === "menu") {
    return (
      <>
        <div className="crt" aria-hidden="true" />
        <MusicDirector />
        <main>
          {banner}
          <MainMenu />
        </main>
      </>
    );
  }

  const encounter = screen === "encounter" ? run?.encounter : undefined;
  const expedition = screen === "map" ? run?.expedition : undefined;
  const inWorld = screen === "world";
  const inShardrun = screen === "shardrun";
  const inCodex = screen === "codex";

  let body = inWorld ? <WorldScreen /> : inShardrun ? <ShardrunScreen /> : inCodex ? <CodexScreen /> : <GuildBoard />;
  if (screen === "debrief" && debrief) body = <DebriefScreen debrief={debrief} />;
  else if (run && encounter) body = <EncounterScreen view={encounter} />;
  else if (run && expedition) body = <ExpeditionScreen run={run} expedition={expedition} />;
  const betweenRuns = !encounter && !expedition && !(screen === "debrief" && debrief);

  return (
    <>
      <div className="crt" aria-hidden="true" />
      <MusicDirector />
      <header className="topbar">
        <div className="brand">
          ROOTWARD<small>{inShardrun || inCodex ? "Shardrun" : "The World · the Bastion"}</small>
        </div>
        {betweenRuns && (
          <nav className="topnav" aria-label="Places">
            <button type="button" className="btn" onClick={showMenu}>
              ☰ Main menu
            </button>
            {(inShardrun || inCodex) && (
              <button type="button" className="btn" aria-current={inCodex ? "page" : undefined} onClick={showCodex}>
                Codex
              </button>
            )}
            {/* The Guild Board belongs to the World: it is the Guild Hall's board, so it is only offered there. */}
            {!inShardrun && !inCodex && (
              <>
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
              </>
            )}
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
        <div className="topbar-tools">
          <SoundButton />
        </div>
      </header>
      <main>
        {banner}
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
        ) : inShardrun ? (
          <>
            <span>
              <kbd>1</kbd>-<kbd>3</kbd> cast · <kbd>E</kbd> end turn
            </span>
            <span>
              {deckRun ? "click a card to play it · drag it to a slot · click a played card to take it back" : "click a shard, then a slot, to move it · or drag it"}
            </span>
          </>
        ) : inCodex ? (
          <>
            <span>every shard, relic, and foe in the Salvage</span>
            <span>search by name, code, or tag · switch the language the code is shown in</span>
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
