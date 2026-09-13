import { TILE } from "@rootward/core/map";
import type { ExpeditionView } from "@rootward/shared";
import { memo, type MouseEvent, useMemo, useRef } from "react";
import { tileKey } from "./fog.ts";
import type { MapRendererProps } from "./MapRenderer.ts";
import { ROOM_GLYPHS } from "./rooms.ts";

// The first MapRenderer: plain ASCII in the CRT font. Every glyph is a single-width character, so the grid stays
// aligned and a click position maps straight to a tile.

interface Span {
  text: string;
  className: string;
}

const DOOR_GLYPHS: Readonly<Record<string, string>> = { "door open": "+", door: "'", "door locked": "=" };

const TILE_STYLE: Readonly<Record<string, Span>> = {
  [TILE.wall]: { text: "#", className: "wall" },
  [TILE.floor]: { text: ".", className: "floor" },
  [TILE.corridor]: { text: "·", className: "corridor" },
  [TILE.prop]: { text: "&", className: "prop" },
  [TILE.rubble]: { text: "~", className: "rubble" },
};

function AsciiMap({ expedition, revealed, avatar, rows, compact = false, onTileClick, label }: MapRendererProps) {
  const ref = useRef<HTMLPreElement>(null);
  const from = Math.max(0, rows?.from ?? 0);
  const to = Math.min(expedition.height, rows?.to ?? expedition.height);
  const lines = useMemo(
    () => drawLines(expedition, revealed, avatar.x, avatar.y, from, to),
    [expedition, revealed, avatar.x, avatar.y, from, to],
  );

  const onClick = (event: MouseEvent<HTMLPreElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!onTileClick || !box || box.width === 0 || box.height === 0) return;
    onTileClick({
      x: Math.floor(((event.clientX - box.left) / box.width) * expedition.width),
      y: from + Math.floor(((event.clientY - box.top) / box.height) * (to - from)),
    });
  };

  return (
    <pre
      ref={ref}
      className={["ascii-map", compact ? "compact" : "", onTileClick ? "" : "static"].filter(Boolean).join(" ")}
      role="img"
      aria-label={label}
      onClick={onTileClick ? onClick : undefined}
    >
      {lines.map((spans, row) => (
        <span key={from + row}>
          {spans.map((span, index) => (
            <span key={index} className={span.className}>
              {span.text}
            </span>
          ))}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

export const AsciiMapRenderer = memo(AsciiMap);

/** Each row as runs of same-styled characters, so a 64-column map costs dozens of elements rather than thousands. */
function drawLines(
  expedition: ExpeditionView,
  revealed: ReadonlySet<number>,
  avatarX: number,
  avatarY: number,
  from: number,
  to: number,
): Span[][] {
  const doors = new Map<number, string>([[tileKey(expedition, expedition.entrance.doorOut), "door"]]);
  const markers = new Map<number, Span>();
  for (const room of expedition.rooms) {
    const passable = room.state === "cleared" || room.state === "current";
    doors.set(tileKey(expedition, room.doorIn), room.state === "open" ? "door open" : passable ? "door" : "door locked");
    if (room.doorOut) doors.set(tileKey(expedition, room.doorOut), passable ? "door" : "door locked");
    markers.set(tileKey(expedition, room.center), { text: ROOM_GLYPHS[room.kind], className: `mark ${room.state}` });
  }

  const lines: Span[][] = [];
  for (let y = from; y < to; y++) {
    const row = expedition.tiles[y] ?? "";
    const spans: Span[] = [];
    const push = ({ text, className }: Span) => {
      const last = spans.at(-1);
      if (last?.className === className) last.text += text;
      else spans.push({ text, className });
    };
    for (let x = 0; x < expedition.width; x++) {
      const key = tileKey(expedition, { x, y });
      const marker = markers.get(key);
      if (x === avatarX && y === avatarY) push({ text: "@", className: "avatar" });
      else if (marker && (!revealed.has(key) || row[x] !== TILE.prop)) push(marker);
      else if (!revealed.has(key)) push({ text: " ", className: "" });
      else push(tileSpan(row[x], doors.get(key)));
    }
    lines.push(spans);
  }
  return lines;
}

function tileSpan(code: string | undefined, doorClass: string | undefined): Span {
  if (code === TILE.door) {
    const className = doorClass ?? "door locked";
    return { text: DOOR_GLYPHS[className] ?? "+", className };
  }
  return (code === undefined ? undefined : TILE_STYLE[code]) ?? { text: " ", className: "" };
}
