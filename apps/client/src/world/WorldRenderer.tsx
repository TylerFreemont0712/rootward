import type { Point } from "@rootward/core/map";
import type { ZoneMarkerView, ZoneNpcView, ZonePropView, ZoneView } from "@rootward/shared";
import { type CSSProperties, memo, type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { assetUrl, terrainVariantUrls, WALK_STRIP_FRAMES, walkStripUrl } from "../assets/AssetRegistry.ts";
import { useImages } from "./images.ts";
import { type Facing, labelAt, tileKey, variantIndex, walkStrip } from "./interactions.ts";

// The world renderer (ADR-0011): the ground is painted once onto a canvas at art resolution, and everything standing
// on it (props, people, monsters, the Maintainer) is an absolutely placed sprite whose z-index comes from the row it
// stands on, so whatever is further down the screen is drawn in front. A camera translates the whole layer to keep
// the Maintainer centered.

/** Art is drawn on a 32px grid and shown at 2x: one art pixel becomes two screen pixels, which keeps it crisp. */
export const ART_TILE = 32;
export const SCALE = 2;
const TILE_PX = ART_TILE * SCALE;
/** Sprites stand a little above the bottom of their tile, so feet land inside the tile rather than on its edge. */
const FOOT_PX = 10;

export interface WorldRendererProps {
  zone: ZoneView;
  avatar: Point;
  facing: Facing;
  walking: boolean;
  stepMs: number;
  /** Tiles uncovered so far where sight is limited; undefined when the whole zone is visible. */
  revealed: ReadonlySet<number> | undefined;
  avatarArt: string | undefined;
  /** The class slug, for walk strips; without strips the static avatar bobs instead. */
  avatarClass: string | undefined;
  /** Whose name to show: the person the Maintainer is standing beside. */
  nearbyNpcId: string | undefined;
  onTileClick: (point: Point) => void;
}

const depth = (row: number, layer: number) => (row + 1) * 10 + layer;

const tileBox = (x: number, y: number, w = 1, h = 1): CSSProperties => ({
  left: x * TILE_PX,
  top: y * TILE_PX,
  width: w * TILE_PX,
  height: h * TILE_PX,
});

const spriteSize = (image: HTMLImageElement, bottom: number): CSSProperties => ({
  width: image.naturalWidth * SCALE,
  height: image.naturalHeight * SCALE,
  bottom,
});

const markerArt = (marker: ZoneMarkerView) => assetUrl("creatures", marker.enemyId) ?? assetUrl("rooms", marker.kind);

/** Where the camera's left (or top) edge goes: centered on the focus, clamped to the zone, or centering a small zone. */
function cameraEdge(view: number, world: number, focus: number): number {
  if (world <= view) return (world - view) / 2;
  return Math.min(Math.max(focus - view / 2, 0), world - view);
}

function WorldLayers({ zone, avatar, facing, walking, stepMs, revealed, avatarArt, avatarClass, nearbyNpcId, onTileClick }: WorldRendererProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLCanvasElement>(null);
  const fog = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ label: string; x: number; y: number } | undefined>(undefined);

  const urls = useMemo(() => {
    const list = new Set<string>();
    const add = (url: string | undefined) => {
      if (url !== undefined) list.add(url);
    };
    for (const { terrain } of Object.values(zone.legend)) for (const url of terrainVariantUrls(terrain)) list.add(url);
    for (const prop of zone.props) add(assetUrl("props", prop.propId));
    for (const npc of zone.npcs) add(assetUrl("npcs", npc.sprite));
    for (const marker of zone.markers) add(markerArt(marker));
    add(avatarArt);
    if (avatarClass !== undefined) for (const direction of ["down", "up", "right"] as const) add(walkStripUrl(avatarClass, direction));
    return [...list];
  }, [zone, avatarArt, avatarClass]);
  const images = useImages(urls);
  const image = (url: string | undefined) => (url === undefined ? undefined : images.get(url));

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The ground, redrawn when the zone changes or more tile art finishes loading.
  useEffect(() => {
    const context = ground.current?.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    const terrainAt = (x: number, y: number) => zone.legend[zone.tiles[y]?.[x] ?? ""];
    const open = (x: number, y: number) => terrainAt(x, y)?.walkable ?? true;
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        const entry = terrainAt(x, y);
        if (!entry) continue;
        const px = x * ART_TILE;
        const py = y * ART_TILE;
        const variants = terrainVariantUrls(entry.terrain).flatMap((url) => images.get(url) ?? []);
        const tile = variants[variantIndex(x, y, variants.length)];
        if (tile) {
          context.drawImage(tile, px, py, ART_TILE, ART_TILE);
        } else {
          context.fillStyle = entry.color;
          context.fillRect(px, py, ART_TILE, ART_TILE);
        }
        // LEARN: two cheap strokes give flat tiles depth: a soft shadow where open ground sits below something solid,
        // and a pale lip along the top edge of solid ground (a wall, a river bank) that faces open ground.
        if (y > 0 && open(x, y) && !open(x, y - 1)) {
          context.fillStyle = "rgb(0 0 0 / 34%)";
          context.fillRect(px, py, ART_TILE, 3);
          context.fillStyle = "rgb(0 0 0 / 14%)";
          context.fillRect(px, py + 3, ART_TILE, 4);
        }
        if (y > 0 && !open(x, y) && open(x, y - 1)) {
          context.fillStyle = "rgb(255 236 200 / 18%)";
          context.fillRect(px, py, ART_TILE, 1);
        }
      }
    }
  }, [zone, images]);

  // Fog: one canvas pixel per tile, stretched with smoothing so its edges come out soft.
  useEffect(() => {
    const context = fog.current?.getContext("2d");
    const sight = zone.sight;
    if (!context || !revealed || sight === undefined) return;
    context.clearRect(0, 0, zone.width, zone.height);
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        const lit = (x - avatar.x) ** 2 + (y - avatar.y) ** 2 <= sight * sight;
        const alpha = !revealed.has(tileKey(zone, { x, y })) ? 0.97 : lit ? 0 : 0.4;
        if (alpha === 0) continue;
        context.fillStyle = `rgb(9 7 5 / ${alpha})`;
        context.fillRect(x, y, 1, 1);
      }
    }
  }, [zone, revealed, avatar]);

  const worldWidth = zone.width * TILE_PX;
  const worldHeight = zone.height * TILE_PX;
  const cameraX = cameraEdge(size.width, worldWidth, (avatar.x + 0.5) * TILE_PX);
  const cameraY = cameraEdge(size.height, worldHeight, (avatar.y + 0.5) * TILE_PX);
  const seen = (point: Point) => !revealed || revealed.has(tileKey(zone, point));

  const tileAtPointer = (event: MouseEvent<HTMLDivElement>): { point: Point; x: number; y: number } | undefined => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const point = { x: Math.floor((x + cameraX) / TILE_PX), y: Math.floor((y + cameraY) / TILE_PX) };
    const inside = point.x >= 0 && point.y >= 0 && point.x < zone.width && point.y < zone.height;
    return inside ? { point, x, y } : undefined;
  };

  const avatarImage = image(avatarArt);
  const strip = walkStrip(facing);
  const stripImage = image(avatarClass === undefined ? undefined : walkStripUrl(avatarClass, strip.direction));
  const flipped = stripImage ? strip.mirrored : facing === "left";
  const light = {
    "--lx": `${(avatar.x + 0.5) * TILE_PX - cameraX}px`,
    "--ly": `${(avatar.y + 0.5) * TILE_PX - cameraY}px`,
  } as CSSProperties;

  return (
    <div
      ref={viewport}
      className="w-viewport"
      role="img"
      aria-label={`${zone.name}. Walk with the arrow keys or WASD; press E beside someone to talk.`}
      onClick={(event) => {
        const hit = tileAtPointer(event);
        if (hit) onTileClick(hit.point);
      }}
      onMouseMove={(event) => {
        const hit = tileAtPointer(event);
        const label = hit && seen(hit.point) ? labelAt(zone, hit.point) : undefined;
        setHover(hit && label !== undefined ? { label, x: hit.x, y: hit.y } : undefined);
      }}
      onMouseLeave={() => {
        setHover(undefined);
      }}
    >
      <div
        className="w-world"
        style={{ width: worldWidth, height: worldHeight, transform: `translate3d(${-cameraX}px, ${-cameraY}px, 0)` }}
      >
        <canvas ref={ground} className="w-ground" width={zone.width * ART_TILE} height={zone.height * ART_TILE} />
        {zone.portals.map(
          (portal) =>
            seen(portal) && (
              <div key={portal.id} className={portal.locked ? "w-portal locked" : "w-portal"} style={{ ...tileBox(portal.x, portal.y), zIndex: 1 }} />
            ),
        )}
        {zone.props.map((prop) => (
          <PropSprite key={`${prop.propId}:${prop.x}:${prop.y}`} prop={prop} image={image(assetUrl("props", prop.propId))} />
        ))}
        {zone.markers.map(
          (marker) => seen(marker) && <MarkerSprite key={marker.id} marker={marker} image={image(markerArt(marker))} />,
        )}
        {zone.npcs.map(
          (npc) =>
            seen(npc) && (
              <NpcSprite key={npc.id} npc={npc} image={image(assetUrl("npcs", npc.sprite))} named={npc.id === nearbyNpcId} />
            ),
        )}
        <div
          className={["w-avatar", walking ? "walking" : "", flipped ? "flip" : ""].filter(Boolean).join(" ")}
          style={{
            width: TILE_PX,
            height: TILE_PX,
            transform: `translate(${avatar.x * TILE_PX}px, ${avatar.y * TILE_PX}px)`,
            transitionDuration: `${stepMs}ms`,
            zIndex: depth(avatar.y, 6),
          }}
        >
          <div className="w-shadow" />
          {stripImage ? (
            <div
              className="w-avatar-strip"
              style={
                {
                  backgroundImage: `url("${stripImage.src}")`,
                  width: (stripImage.naturalWidth / WALK_STRIP_FRAMES) * SCALE,
                  height: stripImage.naturalHeight * SCALE,
                  backgroundSize: `${stripImage.naturalWidth * SCALE}px ${stripImage.naturalHeight * SCALE}px`,
                  bottom: FOOT_PX,
                  // The cycle runs from the first walk frame to the end of the strip, never showing the standing pose.
                  "--strip-start": `${(-stripImage.naturalWidth / WALK_STRIP_FRAMES) * SCALE}px`,
                  "--strip-end": `${-stripImage.naturalWidth * SCALE}px`,
                } as CSSProperties
              }
            />
          ) : avatarImage ? (
            <img src={avatarImage.src} alt="" draggable={false} style={spriteSize(avatarImage, FOOT_PX)} />
          ) : (
            <span className="avatar-glyph" aria-hidden="true">
              @
            </span>
          )}
        </div>
        {revealed && <canvas ref={fog} className="w-fog" width={zone.width} height={zone.height} />}
      </div>
      {zone.sight !== undefined && <div className="w-light" style={light} />}
      {hover && (
        <div className="w-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.label}
        </div>
      )}
    </div>
  );
}

function PropSprite({ prop, image }: { prop: ZonePropView; image: HTMLImageElement | undefined }) {
  return (
    <div className="w-thing w-prop" style={{ ...tileBox(prop.x, prop.y, prop.w, prop.h), zIndex: depth(prop.y + prop.h - 1, 2) }}>
      {image ? (
        <img src={image.src} alt="" draggable={false} style={spriteSize(image, 0)} />
      ) : (
        <span className="w-fallback" aria-hidden="true">
          {prop.name.slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function MarkerSprite({ marker, image }: { marker: ZoneMarkerView; image: HTMLImageElement | undefined }) {
  // Staggered so a room full of monsters does not bob in unison.
  const animationDelay = `${-((marker.x * 7 + marker.y * 13) % 26) / 10}s`;
  const above = (image ? image.naturalHeight * SCALE : TILE_PX) + FOOT_PX + 2;
  return (
    <div className={`w-thing w-marker ${marker.kind} ${marker.state}`} style={{ ...tileBox(marker.x, marker.y), zIndex: depth(marker.y, 4) }}>
      <div className="w-shadow" />
      {image ? (
        <img src={image.src} alt="" draggable={false} style={{ ...spriteSize(image, FOOT_PX), animationDelay }} />
      ) : (
        <span className="w-fallback" aria-hidden="true">
          {marker.kind === "boss" ? "☠" : "⚔"}
        </span>
      )}
      {marker.state !== "open" && (
        <span className={`w-badge ${marker.state}`} style={{ bottom: above }} aria-hidden="true">
          {marker.state === "cleared" ? "✓" : "⊘"}
        </span>
      )}
    </div>
  );
}

function NpcSprite({ npc, image, named }: { npc: ZoneNpcView; image: HTMLImageElement | undefined; named: boolean }) {
  const above = (image ? image.naturalHeight * SCALE : TILE_PX) + FOOT_PX + 4;
  return (
    <div className="w-thing w-npc" style={{ ...tileBox(npc.x, npc.y), zIndex: depth(npc.y, 5) }}>
      <div className="w-shadow" />
      {image ? (
        <img src={image.src} alt="" draggable={false} style={{ ...spriteSize(image, FOOT_PX), animationDelay: `${-((npc.x + npc.y) % 5) / 2}s` }} />
      ) : (
        <span className="w-fallback" aria-hidden="true">
          {npc.name.slice(0, 1)}
        </span>
      )}
      {npc.indicator && (
        <span className={`w-indicator ${npc.indicator}`} style={{ bottom: above }} aria-hidden="true">
          {npc.indicator === "offer" ? "!" : "?"}
        </span>
      )}
      {named && (
        <span className="w-name" style={{ bottom: above + (npc.indicator ? 30 : 0) }}>
          {npc.name}
        </span>
      )}
    </div>
  );
}

export const WorldRenderer = memo(WorldLayers);
