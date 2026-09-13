import type { Point } from "@rootward/core/map";
import type { ExpeditionView } from "@rootward/shared";
import type { ComponentType } from "react";

/**
 * Draws an expedition map. The ASCII renderer is the first implementation; a tileset renderer can take its place
 * without touching movement, fog of war, or the screens, because assets stay optional (AGENT.md).
 */
export interface MapRendererProps {
  expedition: ExpeditionView;
  /** Tile keys the player has uncovered (see fog.ts). */
  revealed: ReadonlySet<number>;
  avatar: Point;
  /** The rows to draw, for a cropped minimap. The whole map when absent. */
  rows?: { from: number; to: number } | undefined;
  /** A small, non-interactive rendering. */
  compact?: boolean | undefined;
  /** Absent when the map cannot be walked (for example after the run ended). */
  onTileClick?: ((point: Point) => void) | undefined;
  label: string;
}

export type MapRenderer = ComponentType<MapRendererProps>;
