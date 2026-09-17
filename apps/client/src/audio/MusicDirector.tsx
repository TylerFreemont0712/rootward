import { useEffect } from "react";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";
import { sound } from "./engine.ts";
import { musicFor } from "./music.ts";

/** Renders nothing: tells the sound engine which music the screen on show calls for (ADR-0023). Mounted once. */
export function MusicDirector() {
  const hasCharacter = useGame((s) => s.activeProfile !== undefined);
  const screen = useGame((s) => s.screen);
  const zoneMusic = useGame((s) => s.world?.zone.music);
  const status = useShardrun((s) => s.run?.status);
  // A fight's music plays on while its last blow does, until the stage lets go of it.
  const battleKind = useShardrun((s) => (s.afterglow?.battle ?? s.run?.battle)?.kind);
  const layerMusic = useShardrun((s) => s.run?.layer.music);
  const battleMusic = useShardrun((s) => s.run?.layer.battleMusic);
  const bossMusic = useShardrun((s) => s.run?.layer.bossMusic);

  const tracks = musicFor({
    screen: hasCharacter ? screen : undefined,
    zoneMusic,
    shardrun: status === undefined ? undefined : { status, battleKind, layer: { music: layerMusic, battleMusic, bossMusic } },
  });
  // A list is a new object every render; its ids joined are what actually changes.
  const key = tracks.join(" ");
  useEffect(() => {
    sound.setMusic(key === "" ? [] : key.split(" "));
  }, [key]);
  return null;
}
