import type { ShardrunView } from "@rootward/shared";
import type { Screen } from "../state/store.ts";

// Which music a screen plays (ADR-0023). Places name their own music in content: a zone of the World, and a layer of
// Shardrun for its map, its fights, and its guardian. Screens that are not places (the title, the menus, a fight in
// code) have a theme of their own here. The answer is a list, best first: the engine plays the first track it has a
// file for, so a place whose own music was never made still gets a theme that suits it. Pure, so the whole mapping is
// testable without a browser.

export const TITLE_THEME = "music-title";
export const TOWN_THEME = "music-bastion";
export const FOCUS_THEME = "music-focus";
export const DESCENT_THEME = "music-salvage";
export const BATTLE_THEME = "music-battle";
export const GUARDIAN_THEME = "music-guardian";

export interface MusicScene {
  /** Undefined before a character is chosen, on the title screen. */
  screen: Screen | undefined;
  /** The music of the World zone the character stands in, if it names one. */
  zoneMusic: string | undefined;
  /** The Shardrun run on screen, if there is one. */
  shardrun:
    | {
        status: ShardrunView["status"];
        /** The fight on the stage, including one still playing out after its last blow. */
        battleKind: "fight" | "elite" | "boss" | undefined;
        layer: Pick<ShardrunView["layer"], "music" | "battleMusic" | "bossMusic">;
      }
    | undefined;
}

/** A place's own music first, then the theme that stands in for it; each id once. */
function prefer(own: string | undefined, ...themes: string[]): readonly string[] {
  return [...new Set([...(own === undefined ? [] : [own]), ...themes])];
}

export function musicFor(scene: MusicScene): readonly string[] {
  switch (scene.screen) {
    case undefined:
    case "profiles":
    case "menu":
    case "codex":
      return [TITLE_THEME];
    case "world":
    case "board":
      // The Guild Board hangs in the Bastion's Guild Hall.
      return prefer(scene.zoneMusic, TOWN_THEME);
    case "encounter":
    case "map":
    case "debrief":
      // A fight in code is thinking time: music that stays out of the way.
      return [FOCUS_THEME];
    case "shardrun": {
      const run = scene.shardrun;
      if (!run || run.status === "won" || run.status === "lost" || run.status === "abandoned") return [DESCENT_THEME];
      if (run.battleKind === "boss") return prefer(run.layer.bossMusic, GUARDIAN_THEME, BATTLE_THEME);
      if (run.battleKind !== undefined) return prefer(run.layer.battleMusic, BATTLE_THEME);
      return prefer(run.layer.music, DESCENT_THEME);
    }
  }
}
