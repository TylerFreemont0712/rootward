import type { ExpeditionView } from "@rootward/shared";
import { useMemo } from "react";
import { restingPoint, revealedTiles } from "./fog.ts";
import { TileMapRenderer } from "./TileMapRenderer.tsx";

const ROWS_ABOVE = 8;
const ROWS_BELOW = 14;

/** The encounter screen's small map: the floors around the room being fought in. */
export function Minimap({ expedition, playerClassName }: { expedition: ExpeditionView; playerClassName?: string }) {
  const revealed = useMemo(() => revealedTiles(expedition), [expedition]);
  const avatar = restingPoint(expedition);
  return (
    <div className="minimap">
      <TileMapRenderer
        expedition={expedition}
        revealed={revealed}
        avatar={avatar}
        playerClassName={playerClassName}
        rows={{ from: avatar.y - ROWS_ABOVE, to: avatar.y + ROWS_BELOW }}
        compact
        label="Minimap of the floors around this room"
      />
    </div>
  );
}
