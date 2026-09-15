import type { RoomKind } from "@rootward/shared";
import { memo, type MouseEvent, useMemo, useRef } from "react";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { drawLines, type Span, wallOrientation } from "./grid.ts";
import type { MapRendererProps } from "./MapRenderer.ts";
import { ROOM_GLYPHS } from "./rooms.ts";

// The sole MapRenderer: grid.ts's shared grid computation, drawn as generated images instead of glyphs. Falls
// back to no image (a plain background square, or the "@" glyph for the avatar) wherever the AssetRegistry
// doesn't have an asset, so this never depends on a specific piece of art existing.

const TERRAIN_CODES = new Set(["wall", "floor", "corridor", "prop", "rubble"]);
const ROOM_KINDS = Object.keys(ROOM_GLYPHS) as RoomKind[];

interface CellImages {
  base: string | undefined;
  overlay: string | undefined;
  /** Degrees to rotate `overlay` (the corner mask, a door, or a room marker never need it, so this only matters
   * for the wall-corner case). */
  overlayRotate: number;
  /** CSS state modifier for the cell: "mark <roomState>" or "door <doorState>", tinting the overlay. */
  stateClass: string | undefined;
  isAvatar: boolean;
  avatarImg: string | undefined;
}

function cellImages(span: Span, avatarImg: string | undefined, tiles: readonly string[], x: number, y: number): CellImages {
  const classes = span.className.split(" ").filter(Boolean);

  if (classes.includes("avatar")) {
    const underlyingCode = span.underlying?.split(" ")[0];
    const code = underlyingCode !== undefined && TERRAIN_CODES.has(underlyingCode) ? underlyingCode : "floor";
    return { base: assetUrl("tiles", code), overlay: undefined, overlayRotate: 0, stateClass: undefined, isAvatar: true, avatarImg };
  }

  if (classes.includes("door")) {
    // A door is a small icon over the wall tile (like a room marker over floor), not its own full tile -- a
    // generated top-down "door texture" kept coming out as a front-on architectural scene instead.
    const state = classes.includes("open") ? "open" : classes.includes("locked") ? "locked" : "closed";
    return {
      base: assetUrl("tiles", "wall"),
      overlay: assetUrl("doors", state),
      overlayRotate: 0,
      stateClass: `door ${state}`,
      isAvatar: false,
      avatarImg: undefined,
    };
  }

  if (classes.includes("mark")) {
    const kind = ROOM_KINDS.find((candidate) => ROOM_GLYPHS[candidate] === span.text);
    return {
      base: assetUrl("tiles", "floor"),
      overlay: kind ? assetUrl("rooms", kind) : undefined,
      overlayRotate: 0,
      stateClass: `mark ${classes.find((candidate) => candidate !== "mark")}`,
      isAvatar: false,
      avatarImg: undefined,
    };
  }

  const code = classes[0];
  if (code === "wall") {
    const { corner, rotate } = wallOrientation(tiles, x, y);
    return corner
      ? {
          base: assetUrl("tiles", "floor"),
          overlay: assetUrl("tiles", "wall-corner"),
          overlayRotate: rotate,
          stateClass: undefined,
          isAvatar: false,
          avatarImg: undefined,
        }
      : { base: assetUrl("tiles", "wall"), overlay: undefined, overlayRotate: 0, stateClass: undefined, isAvatar: false, avatarImg: undefined };
  }

  return {
    base: code ? assetUrl("tiles", code) : undefined,
    overlay: undefined,
    overlayRotate: 0,
    stateClass: undefined,
    isAvatar: false,
    avatarImg: undefined,
  };
}

function TileMap({ expedition, revealed, avatar, playerClassName, rows, compact = false, onTileClick, label }: MapRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const from = Math.max(0, rows?.from ?? 0);
  const to = Math.min(expedition.height, rows?.to ?? expedition.height);
  const lines = useMemo(
    () => drawLines(expedition, revealed, avatar.x, avatar.y, from, to),
    [expedition, revealed, avatar.x, avatar.y, from, to],
  );
  const avatarImg = playerClassName ? assetUrl("avatars", slugify(playerClassName)) : undefined;

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!onTileClick || !box || box.width === 0 || box.height === 0) return;
    onTileClick({
      x: Math.floor(((event.clientX - box.left) / box.width) * expedition.width),
      y: from + Math.floor(((event.clientY - box.top) / box.height) * (to - from)),
    });
  };

  return (
    <div
      ref={ref}
      className={["tile-map", compact ? "compact" : "", onTileClick ? "" : "static"].filter(Boolean).join(" ")}
      role="img"
      aria-label={label}
      onClick={onTileClick ? onClick : undefined}
      style={{ gridTemplateColumns: `repeat(${expedition.width}, var(--tile-size))` }}
    >
      {lines.map((spans, row) =>
        spans.map((span, col) => {
          const y = from + row;
          const { base, overlay, overlayRotate, stateClass, isAvatar, avatarImg: cellAvatarImg } = cellImages(
            span,
            avatarImg,
            expedition.tiles,
            col,
            y,
          );
          return (
            <div
              key={`${y}-${col}`}
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
                (cellAvatarImg ? (
                  <img className="avatar-token" src={cellAvatarImg} alt="" draggable={false} />
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

export const TileMapRenderer = memo(TileMap);
