import type { EncounterView } from "@rootward/shared";
import { useEffect } from "react";
import { CenterPane } from "../encounter/CenterPane.tsx";
import { LeftPane } from "../encounter/LeftPane.tsx";
import { RightPane } from "../encounter/RightPane.tsx";
import { useGame } from "../state/store.ts";

/** The three-pane IDE-dungeon (PROMPT.md section 14.5). */
export function EncounterScreen({ view }: { view: EncounterView }) {
  const cast = useGame((s) => s.cast);
  const probe = useGame((s) => s.probe);
  const leave = useGame((s) => s.leave);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      // Inside the editor, CodeMirror's own keymap already handles these keys.
      if (event.target instanceof Element && event.target.closest(".cm-editor")) return;
      event.preventDefault();
      void (event.shiftKey ? probe() : cast());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cast, probe]);

  return (
    <>
      <div className="panes">
        <LeftPane view={view} />
        <CenterPane view={view} />
        <RightPane view={view} />
      </div>
      {view.status === "kernel-panic" && (
        <div className="overlay" role="alertdialog" aria-labelledby="panic-title">
          <div className="panic">
            <h2 id="panic-title">KERNEL PANIC</h2>
            <div>Kernel panic - not syncing: Maintainer out of Integrity.</div>
            <div className="dim">[ run ] {view.enemy.name} is still standing.</div>
            <div className="dim">[ run ] Commits and reviews earned so far: kept. Loot: dropped.</div>
            <div className="actions">
              <button type="button" className="btn primary" autoFocus onClick={leave}>
                Return to the Guild Board
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
