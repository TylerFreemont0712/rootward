import type { Point } from "@rootward/core/map";
import type { ExpeditionView } from "@rootward/shared";
import type { ComponentType } from "react";

/**
 * Draws an expedition map, decoupled from movement/fog/the screens (AGENT.md) so a renderer can be swapped
 * without touching those. TileMapRenderer is the only implementation now; grid.ts's shared computation is what
 * would let a second one (or an ASCII fallback) reuse the same logic if one is ever needed again.
 */
export interface MapRendererProps {
  expedition: ExpeditionView;
  /** Tile keys the player has uncovered (see fog.ts). */
  revealed: ReadonlySet<number>;
  avatar: Point;
  /** The player's class name (e.g. "Artificer"), for the avatar token. Absent falls back to the "@" glyph. */
  playerClassName?: string | undefined;
  /** The rows to draw, for a cropped minimap. The whole map when absent. */
  rows?: { from: number; to: number } | undefined;
  /** A small, non-interactive rendering. */
  compact?: boolean | undefined;
  /** Absent when the map cannot be walked (for example after the run ended). */
  onTileClick?: ((point: Point) => void) | undefined;
  label: string;
}

export type MapRenderer = ComponentType<MapRendererProps>;
