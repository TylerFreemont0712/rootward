// Images for the effects canvas (ADR-0019): generated effect art by id, and foe sprites by URL (their pixels become the
// shards a defeated foe breaks into). Everything is loaded lazily and may never arrive: every caller draws a plain
// shape when an image is missing, because art is optional (AGENT.md).

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class SpriteBank {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly tints = new Map<string, HTMLCanvasElement>();
  private readonly pixelCache = new Map<string, Pixels | null>();
  private readonly dots = new Map<string, HTMLCanvasElement>();
  private readonly urlFor: (id: string) => string | undefined;

  constructor(urlFor: (id: string) => string | undefined) {
    this.urlFor = urlFor;
  }

  /** Start loading, so the first cast does not wait on the network. */
  preload(ids: readonly string[]): void {
    for (const id of ids) this.image(id);
  }

  /** A loaded image, by effect id or by URL; undefined until it has loaded (or when there is none). */
  image(key: string): HTMLImageElement | undefined {
    let image = this.images.get(key);
    if (!image) {
      const url = key.includes("/") ? key : this.urlFor(key);
      if (url === undefined) return undefined;
      image = new Image();
      image.decoding = "async";
      image.src = url;
      this.images.set(key, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : undefined;
  }

  /** The image recolored to one color, keeping its shading and its alpha: one rune circle serves every element. */
  tinted(key: string, color: string): HTMLCanvasElement | undefined {
    const cacheKey = `${key}|${color}`;
    const cached = this.tints.get(cacheKey);
    if (cached) return cached;
    const image = this.image(key);
    if (!image) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0);
    // LEARN: the "color" blend keeps each pixel's lightness and takes hue and saturation from the fill, so the art's
    // shading survives the recolor. It also paints the transparent pixels, so "destination-in" with the image again
    // cuts the result back to the image's own shape and alpha.
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(image, 0, 0);
    this.tints.set(cacheKey, canvas);
    return canvas;
  }

  /** A soft round glow in one color, drawn once and reused: the cheapest way to make light on a canvas. */
  dot(color: string): HTMLCanvasElement | undefined {
    const cached = this.dots.get(color);
    if (cached) return cached;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, withAlpha(color, 0.55));
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.dots.set(color, canvas);
    return canvas;
  }

  /** An image's pixels, read once. Undefined while it loads; null if the browser refuses to read it. */
  pixels(key: string): Pixels | null | undefined {
    if (this.pixelCache.has(key)) return this.pixelCache.get(key);
    const image = this.image(key);
    if (!image) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let result: Pixels | null = null;
    if (ctx) {
      ctx.drawImage(image, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        result = { width: canvas.width, height: canvas.height, data: data.data };
      } catch (error) {
        // A tainted canvas (an image from another origin) cannot be read. The art is same-origin, so this is a
        // misconfiguration worth seeing in the console, not something to hide; the defeat just skips its shards.
        console.warn(`Shardrun effects could not read the pixels of ${key}`, error);
      }
    }
    this.pixelCache.set(key, result);
    return result;
  }
}

/** The brightest, most saturated color in a sprite: what a foe's aura and embers are made of. */
export function glowColor(pixels: Pixels): string | undefined {
  let best: [number, number, number] | undefined;
  let bestScore = 0;
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4 * 3) {
    const alpha = data[i + 3] ?? 0;
    if (alpha < 200) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const score = (max / 255) * ((max - min) / Math.max(1, max)) * (max / 255);
    if (score > bestScore) {
      bestScore = score;
      best = [r, g, b];
    }
  }
  return best && bestScore > 0.25 ? `rgb(${best[0]} ${best[1]} ${best[2]})` : undefined;
}

/** `#rrggbb` or `rgb(r g b)` with an alpha. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `rgb(${r} ${g} ${b} / ${alpha})`;
  }
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(color);
  return match ? `rgb(${match[1]} ${match[2]} ${match[3]} / ${alpha})` : color;
}
