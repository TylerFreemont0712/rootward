import type { RoomKind, RoomState } from "@rootward/shared";

/** One ASCII letter per room kind, so the map never tells kinds apart by color alone. */
export const ROOM_GLYPHS: Readonly<Record<RoomKind, string>> = {
  encounter: "x",
  elite: "X",
  boss: "B",
  shrine: "S",
  puzzle: "?",
  rest: "r",
};

export const ROOM_NAMES: Readonly<Record<RoomKind, string>> = {
  encounter: "Encounter",
  elite: "Elite",
  boss: "Boss",
  shrine: "Shrine",
  puzzle: "Puzzle",
  rest: "Rest",
};

export const ROOM_STATE_LABELS: Readonly<Record<RoomState, string>> = {
  cleared: "cleared",
  current: "you are here",
  open: "door open",
  ahead: "ahead",
  sealed: "sealed",
};
