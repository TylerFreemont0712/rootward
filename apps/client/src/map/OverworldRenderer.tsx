import type { Point } from "@rootward/core/map";
import type { OverworldView, RoomKind } from "@rootward/shared";
import { memo, type MouseEvent, useMemo, useRef } from "react";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { type Span, wallOrientation } from "./grid.ts";
import { drawOverworldLines } from "./overworld-grid.ts";
import { ROOM_GLYPHS } from "./rooms.ts";

// A sibling to TileMapRenderer, not a reuse of it: TileMapRenderer is drawn from an ExpeditionView (rooms, doors),
// and an overworld zone has neither. Shares what actually is shared -- wallOrientation, Span/tileSpan (via
// overworld-grid.ts), and the room-marker art -- rather than forcing one component to take two view shapes.

const TERRAIN_CODES = new Set(["wall", "floor", "corridor", "prop", "rubble"]);
const ROOM_KINDS = Object.keys(ROOM_GLYPHS) as RoomKind[];

interface OverworldRendererProps {
  overworld: OverworldView;
  /** Tile keys the player has uncovered (see overworld-fog.ts). */
  revealed: ReadonlySet<number>;
  avatar: Point;
  playerClassName?: string | undefined;
  compact?: boolean | undefined;
  onTileClick?: ((point: Point) => void) | undefined;
  label: string;
}

interface CellImages {
  base: string | undefined;
  overlay: string | undefined;
  overlayRotate: number;
  stateClass: string | undefined;
  isAvatar: boolean;
}

function cellImages(span: Span, tiles: readonly string[], x: number, y: number): CellImages {
  const classes = span.className.split(" ").filter(Boolean);

  if (classes.includes("avatar")) {
    const underlyingCode = span.underlying?.split(" ")[0];
    const code = underlyingCode !== undefined && TERRAIN_CODES.has(underlyingCode) ? underlyingCode : "floor";
    return { base: assetUrl("tiles", code), overlay: undefined, overlayRotate: 0, stateClass: undefined, isAvatar: true };
  }

  if (classes.includes("mark")) {
    const kind = ROOM_KINDS.find((candidate) => ROOM_GLYPHS[candidate] === span.text);
    return {
      base: assetUrl("tiles", "floor"),
      overlay: kind ? assetUrl("rooms", kind) : undefined,
      overlayRotate: 0,
      stateClass: `mark ${classes.find((candidate) => candidate !== "mark")}`,
      isAvatar: false,
    };
  }

  const code = classes[0];
  if (code === "wall") {
    const { corner, rotate } = wallOrientation(tiles, x, y);
    return corner
      ? { base: assetUrl("tiles", "floor"), overlay: assetUrl("tiles", "wall-corner"), overlayRotate: rotate, stateClass: undefined, isAvatar: false }
      : { base: assetUrl("tiles", "wall"), overlay: undefined, overlayRotate: 0, stateClass: undefined, isAvatar: false };
  }

  return { base: code ? assetUrl("tiles", code) : undefined, overlay: undefined, overlayRotate: 0, stateClass: undefined, isAvatar: false };
}

function OverworldMap({ overworld, revealed, avatar, playerClassName, compact = false, onTileClick, label }: OverworldRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => drawOverworldLines(overworld, revealed, avatar.x, avatar.y, 0, overworld.height),
    [overworld, revealed, avatar.x, avatar.y],
  );
  const avatarImg = playerClassName ? assetUrl("avatars", slugify(playerClassName)) : undefined;

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!onTileClick || !box || box.width === 0 || box.height === 0) return;
    onTileClick({
      x: Math.floor(((event.clientX - box.left) / box.width) * overworld.width),
      y: Math.floor(((event.clientY - box.top) / box.height) * overworld.height),
    });
  };

  return (
    <div
      ref={ref}
      className={["tile-map", compact ? "compact" : "", onTileClick ? "" : "static"].filter(Boolean).join(" ")}
      role="img"
      aria-label={label}
      onClick={onTileClick ? onClick : undefined}
      style={{ gridTemplateColumns: `repeat(${overworld.width}, var(--tile-size))` }}
    >
      {lines.map((spans, y) =>
        spans.map((span, x) => {
          const { base, overlay, overlayRotate, stateClass, isAvatar } = cellImages(span, overworld.tiles, x, y);
          return (
            <div
              key={`${y}-${x}`}
              className={["tile-cell", isAvatar ? "avatar" : "", stateClass ?? ""].filter(Boolean).join(" ")}
            >
              {base && <img src={base} alt="" draggable={false} />}
              {overlay && (
                <img
                  className="tile-overlay"
                  src={overlay}
                  alt=""
                  draggable={false}
                  style={overlayRotate ? { transform: `rotate(${overlayRotate}deg)` } : undefined}
                />
              )}
              {isAvatar &&
                (avatarImg ? (
                  <img className="avatar-token" src={avatarImg} alt="" draggable={false} />
                ) : (
                  <span className="avatar-glyph" aria-hidden="true">
                    @
                  </span>
                ))}
            </div>
          );
        }),
      )}
    </div>
  );
}

export const OverworldRenderer = memo(OverworldMap);
