import { useEffect, useState } from "react";

// Art for the world is optional (AGENT.md): an image that fails to load simply is not there, and every caller has a
// fallback (a flat terrain color, a glyph). Images are loaded once per URL for the whole session.

const pending = new Map<string, Promise<HTMLImageElement | undefined>>();
const loaded = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement | undefined> {
  let promise = pending.get(url);
  if (!promise) {
    promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        loaded.set(url, image);
        resolve(image);
      };
      // A missing file is expected for art that has not been generated yet; the caller draws its fallback instead.
      image.onerror = () => {
        resolve(undefined);
      };
      image.src = url;
    });
    pending.set(url, promise);
  }
  return promise;
}

const splitKey = (key: string) => (key === "" ? [] : key.split("\n"));

/** Whatever has already loaded, from the session cache. */
function collect(key: string): ReadonlyMap<string, HTMLImageElement> {
  return new Map(
    splitKey(key).flatMap((url): [string, HTMLImageElement][] => {
      const image = loaded.get(url);
      return image ? [[url, image]] : [];
    }),
  );
}

/** The images among `urls` that have loaded, updating once the rest arrive. */
export function useImages(urls: readonly string[]): ReadonlyMap<string, HTMLImageElement> {
  // LEARN: joining the URLs into one string gives the effect a dependency that only changes when the list's contents
  // change, not every time the caller builds a new array with the same URLs in it.
  const key = urls.join("\n");
  const [state, setState] = useState(() => ({ key, images: collect(key) }));

  useEffect(() => {
    let alive = true;
    void Promise.all(splitKey(key).map(loadImage)).then(() => {
      if (alive) setState({ key, images: collect(key) });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  // Until a new list finishes loading, show whatever of it is already cached rather than the previous list's images.
  return state.key === key ? state.images : collect(key);
}
