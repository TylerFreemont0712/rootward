#!/usr/bin/env python3
"""Rootward's art pipeline: a JSON manifest of prompts -> ComfyUI (SDXL) -> clean, game-ready pixel art.

Why a script and not only a saved ComfyUI graph: the sampling half is a plain txt2img graph, but what makes the output
read as pixel art in the game -- a grid-aligned downscale, a small palette, hard alpha, a dark outline, ground tiles
whose variants wrap seamlessly into each other -- is post-processing ComfyUI has no stock nodes for. Raw renders are
cached under assets/.art-cache (git-ignored), so changing only post-processing never touches the GPU again.

Usage (any Python 3.10+ with Pillow and numpy; ComfyUI's own venv has both):
  PY=~/personal-project/ComfyUI/.venv/bin/python
  $PY scripts/art/generate.py                        # render what is not cached yet, post-process everything
  $PY scripts/art/generate.py --only npc-smith,tile-*  # ids, or prefixes ending in *
  $PY scripts/art/generate.py --only npc-smith --force # render again even though a raw is cached
  $PY scripts/art/generate.py --reprocess --sheet      # post-process cached raws only, write a contact sheet
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = Path(__file__).with_name("manifest.json")
OUT_DIR = ROOT / "assets" / "generated"
CACHE_DIR = ROOT / "assets" / ".art-cache"

GENERATION_KEYS = (
    "checkpoint", "lora", "lora_strength", "prefix", "prompt", "suffix", "negative",
    "width", "height", "steps", "cfg", "sampler", "scheduler", "seed", "candidates", "rmbg",
)


# ---------------------------------------------------------------------------------------------------------------------
# Manifest


def resolve(asset: dict, styles: dict) -> dict:
    """An asset's settings: its style's defaults, overridden by the asset; `post` merges one level deeper."""
    style = dict(styles[asset["style"]])
    post = {**style.pop("post", {}), **asset.get("post", {})}
    job = {**style, **{k: v for k, v in asset.items() if k != "post"}, "post": post}
    job.setdefault("candidates", 1)
    job.setdefault("pick", 0)
    if "seed" not in job:
        job["seed"] = int(hashlib.sha256(job["id"].encode()).hexdigest()[:8], 16)
    return job


def selected(assets: list[dict], only: str | None) -> list[dict]:
    if not only:
        return assets
    wanted = [token.strip() for token in only.split(",") if token.strip()]

    def matches(asset_id: str) -> bool:
        return any(asset_id.startswith(w[:-1]) if w.endswith("*") else asset_id == w for w in wanted)

    picked = [a for a in assets if matches(a["id"])]
    if not picked:
        sys.exit(f"--only {only!r} matched no asset ids")
    return picked


def generation_hash(job: dict) -> str:
    return hashlib.sha256(json.dumps({k: job.get(k) for k in GENERATION_KEYS}, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------------------------------------------------
# ComfyUI


def build_graph(job: dict, prefix: str) -> dict:
    """An API-format txt2img graph; with `rmbg`, BiRefNet's mask is saved beside the render as its own image."""
    graph: dict[str, dict] = {"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": job["checkpoint"]}}}
    model, clip = ["1", 0], ["1", 1]
    if job.get("lora"):
        strength = job.get("lora_strength", 1.0)
        graph["2"] = {
            "class_type": "LoraLoader",
            "inputs": {"model": model, "clip": clip, "lora_name": job["lora"], "strength_model": strength, "strength_clip": strength},
        }
        model, clip = ["2", 0], ["2", 1]
    text = f"{job.get('prefix', '')}{job['prompt']}{job.get('suffix', '')}"
    graph["3"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip, "text": text}}
    graph["4"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip, "text": job.get("negative", "")}}
    graph["5"] = {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": job["width"], "height": job["height"], "batch_size": job["candidates"]},
    }
    graph["6"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": model, "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
            "seed": job["seed"], "steps": job["steps"], "cfg": job["cfg"],
            "sampler_name": job["sampler"], "scheduler": job["scheduler"], "denoise": 1.0,
        },
    }
    graph["7"] = {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}}
    graph["8"] = {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": f"{prefix}_rgb"}}
    if job.get("rmbg"):
        graph["9"] = {
            "class_type": "BiRefNetRMBG",
            "inputs": {
                "image": ["7", 0], "model": "BiRefNet_toonout", "sensitivity": 1.0, "mask_blur": 0, "mask_offset": 0,
                "invert_output": False, "refine_foreground": False, "background": "Alpha",
            },
        }
        graph["10"] = {"class_type": "MaskToImage", "inputs": {"mask": ["9", 1]}}
        graph["11"] = {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": f"{prefix}_mask"}}
    return graph


def http_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        sys.exit(f"ComfyUI rejected {url}: {error.code} {error.read().decode(errors='replace')[:2000]}")
    except urllib.error.URLError as error:
        sys.exit(f"Cannot reach ComfyUI at {url} ({error.reason}). Is it running?")


def render(comfy: str, job: dict) -> tuple[list[Image.Image], list[Image.Image] | None]:
    prefix = f"rootward-art/{job['id']}"
    queued = http_json(f"{comfy}/prompt", {"prompt": build_graph(job, prefix), "client_id": str(uuid.uuid4())})
    prompt_id = queued["prompt_id"]
    started = time.monotonic()
    while True:
        history = http_json(f"{comfy}/history/{prompt_id}").get(prompt_id)
        if history and history.get("status", {}).get("completed"):
            break
        if history and history.get("status", {}).get("status_str") == "error":
            sys.exit(f"ComfyUI failed rendering {job['id']}: {json.dumps(history['status'])[:2000]}")
        if time.monotonic() - started > 900:
            sys.exit(f"Timed out waiting for {job['id']} ({prompt_id})")
        time.sleep(1.5)

    def fetch(node: str) -> list[Image.Image]:
        images = []
        for ref in history["outputs"][node]["images"]:
            query = urllib.parse.urlencode({"filename": ref["filename"], "subfolder": ref["subfolder"], "type": ref["type"]})
            with urllib.request.urlopen(f"{comfy}/view?{query}", timeout=60) as response:
                image = Image.open(response)
                image.load()
                images.append(image)
        return images

    return fetch("8"), fetch("11") if job.get("rmbg") else None


def ensure_raws(comfy: str, job: dict, force: bool, reprocess_only: bool) -> list[np.ndarray] | None:
    """Float RGBA arrays in 0..1, one per candidate, rendering only when the cache is missing or stale."""
    folder = CACHE_DIR / job["id"]
    meta_path = folder / "meta.json"
    digest = generation_hash(job)
    cached = meta_path.exists() and json.loads(meta_path.read_text()).get("hash") == digest
    if not cached or force:
        if reprocess_only:
            print(f"  skip {job['id']}: no cached render (drop --reprocess to render it)")
            return None
        print(f"  render {job['id']} ({job['candidates']} candidate(s), seed {job['seed']})", flush=True)
        rgbs, masks = render(comfy, job)
        folder.mkdir(parents=True, exist_ok=True)
        for i, rgb in enumerate(rgbs):
            rgb.convert("RGB").save(folder / f"rgb_{i}.png")
            if masks:
                masks[i].convert("L").save(folder / f"mask_{i}.png")
        meta_path.write_text(json.dumps({"hash": digest, "prompt": job["prompt"], "seed": job["seed"]}, indent=2))
    raws = []
    for i in range(job["candidates"]):
        rgb = np.asarray(Image.open(folder / f"rgb_{i}.png").convert("RGB"), dtype=np.float32) / 255
        mask_path = folder / f"mask_{i}.png"
        alpha = (
            np.asarray(Image.open(mask_path).convert("L"), dtype=np.float32) / 255
            if mask_path.exists()
            else np.ones(rgb.shape[:2], dtype=np.float32)
        )
        raws.append(np.dstack([rgb, alpha]))
    return raws


# ---------------------------------------------------------------------------------------------------------------------
# Post-processing


def resize_float(array: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Area-average resize of a float HxWxC array to (width, height), channel by channel (PIL "F" images)."""
    channels = [np.asarray(Image.fromarray(np.ascontiguousarray(array[..., c])).resize(size, Image.Resampling.BOX)) for c in range(array.shape[2])]
    return np.stack(channels, axis=-1)


def resize_premultiplied(rgba: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    # LEARN: averaging RGB straight would mix the removed background's color into every edge pixel (a pale halo).
    # Weighting color by alpha before averaging, then dividing back out, only averages the pixels that are really there.
    alpha = rgba[..., 3:4]
    small = resize_float(np.dstack([rgba[..., :3] * alpha, alpha]), size)
    small_alpha = small[..., 3:4]
    color = np.where(small_alpha > 1e-4, small[..., :3] / np.maximum(small_alpha, 1e-4), 0)
    return np.dstack([np.clip(color, 0, 1), small_alpha])


def palette_of(pixels_u8: np.ndarray, colors: int) -> Image.Image:
    strip = Image.fromarray(pixels_u8.reshape(1, -1, 3).astype(np.uint8), "RGB")
    return strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, kmeans=3, dither=Image.Dither.NONE)


def apply_palette(rgb_u8: np.ndarray, palette: Image.Image) -> np.ndarray:
    image = Image.fromarray(rgb_u8.astype(np.uint8), "RGB")
    return np.asarray(image.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB"))


def adjust(rgb: np.ndarray, post: dict) -> np.ndarray:
    """Saturation around luma, contrast around the image mean, a color tint, then brightness: ground wants to recede and
    sprites to pop, and a tint pulls one terrain away from a neighbor it would otherwise blend into."""
    out = rgb
    if "saturation" in post:
        luma = (out * np.array([0.299, 0.587, 0.114], dtype=np.float32)).sum(axis=-1, keepdims=True)
        out = luma + (out - luma) * post["saturation"]
    if "contrast" in post:
        mean = out.reshape(-1, 3).mean(axis=0)
        out = mean + (out - mean) * post["contrast"]
    if "tint" in post:
        out = out * np.array(post["tint"], dtype=np.float32)
    if "brightness" in post:
        out = out * post["brightness"]
    return np.clip(out, 0, 1)


def hex_rgb(value: str) -> list[int]:
    value = value.lstrip("#")
    return [int(value[i : i + 2], 16) for i in (0, 2, 4)]


def outline(rgba_u8: np.ndarray, color: str) -> np.ndarray:
    solid = rgba_u8[..., 3] > 0
    grown = solid.copy()
    grown[1:, :] |= solid[:-1, :]
    grown[:-1, :] |= solid[1:, :]
    grown[:, 1:] |= solid[:, :-1]
    grown[:, :-1] |= solid[:, 1:]
    out = rgba_u8.copy()
    out[grown & ~solid] = [*hex_rgb(color), 255]
    return out


def drop_fragments(rgba: np.ndarray, keep_fraction: float) -> np.ndarray:
    """Remove specks background removal left floating around the subject: any connected blob smaller than
    `keep_fraction` of the largest one. Labeled on a 256px copy of the mask, which is plenty to tell blobs apart."""
    height, width = rgba.shape[:2]
    small = np.asarray(Image.fromarray((rgba[..., 3] > 0.5).astype(np.uint8) * 255).resize((256, 256), Image.Resampling.NEAREST)) > 0
    labels = np.zeros(small.shape, dtype=np.int32)
    sizes = [0]
    # LEARN: a flood fill from every unlabeled solid pixel gives each connected blob its own number (its "label");
    # counting pixels per label then says which blobs are the subject and which are leftovers.
    for start_y, start_x in zip(*np.nonzero(small)):
        if labels[start_y, start_x]:
            continue
        label = len(sizes)
        labels[start_y, start_x] = label
        stack, count = [(start_y, start_x)], 0
        while stack:
            y, x = stack.pop()
            count += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < 256 and 0 <= nx < 256 and small[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = label
                    stack.append((ny, nx))
        sizes.append(count)
    largest = max(sizes)
    keep = np.isin(labels, [i for i, size in enumerate(sizes) if i and size >= largest * keep_fraction])
    keep_full = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).resize((width, height), Image.Resampling.NEAREST)) > 0
    out = rgba.copy()
    out[..., 3] = np.where(keep_full, rgba[..., 3], 0)
    return out


def post_sprite(rgba: np.ndarray, post: dict) -> Image.Image:
    """Crop to the subject, fit it in `size` (anchored bottom-center, so feet sit on the tile), hard alpha, palette, outline."""
    width, height = post["size"]
    pad = 1 if post.get("outline", True) else 0
    rgba = drop_fragments(rgba, post.get("keep_fraction", 0.08))
    solid = rgba[..., 3] > 0.5
    ys, xs = np.nonzero(solid)
    if len(xs) == 0:
        raise ValueError("background removal left nothing")
    crop = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    scale = min((width - 2 * pad) / crop.shape[1], (height - 2 * pad) / crop.shape[0])
    size = (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale)))
    small = resize_premultiplied(crop, size)
    small = np.dstack([adjust(small[..., :3], post), small[..., 3:4]])
    opaque = small[..., 3] > post.get("alpha_cut", 0.5)
    rgb_u8 = np.round(small[..., :3] * 255)
    quantized = apply_palette(rgb_u8, palette_of(rgb_u8[opaque], post.get("colors", 16)))

    canvas = np.zeros((height, width, 4), dtype=np.uint8)
    top = height - pad - size[1] if post.get("anchor", "bottom") == "bottom" else (height - size[1]) // 2
    left = (width - size[0]) // 2
    region = canvas[top : top + size[1], left : left + size[0]]
    region[opaque, :3] = quantized[opaque]
    region[opaque, 3] = 255
    if pad:
        canvas = outline(canvas, post.get("outline_color", "#140c1c"))
    return Image.fromarray(canvas, "RGBA")


def post_tiles(rgba: np.ndarray, post: dict) -> list[Image.Image]:
    """Ground tile variants that sit seamlessly next to each other in any order, sharing one palette."""
    tile = post["size"][0]
    grid = post.get("grid", 8)
    height, width = rgba.shape[:2]
    small = adjust(resize_float(rgba[..., :3], (width // grid, height // grid)), post)
    count = post.get("variants", 1)
    span = small.shape[0] - tile
    offsets = [(round(span * ((i * 0.37 + 0.11) % 1)), round(span * ((i * 0.61 + 0.23) % 1))) for i in range(count)]
    crops = [small[y : y + tile, x : x + tile] for x, y in offsets]

    # LEARN: rolling a tile by half its size moves its seams into the middle, so the rolled copy's edges wrap onto
    # themselves perfectly. Every variant keeps its own center but fades to that one rolled copy at the edges, so all
    # variants share identical borders and any two can be placed side by side with no visible seam.
    border = np.roll(crops[0], (tile // 2, tile // 2), axis=(0, 1))
    ramp = np.minimum(np.arange(tile), np.arange(tile)[::-1]) / (tile / 2)
    weight = np.clip(np.minimum.outer(ramp, ramp) * post.get("edge_sharpness", 2.5), 0, 1)[..., None]
    blended = [np.round((crop * weight + border * (1 - weight)) * 255) for crop in crops]
    palette = palette_of(np.concatenate([b.reshape(-1, 3) for b in blended]), post.get("colors", 12))
    return [Image.fromarray(apply_palette(b, palette), "RGB") for b in blended]


def post_picture(rgba: np.ndarray, post: dict) -> Image.Image:
    """Portraits and backdrops: cover-crop to `size`, palette, keeping (or dropping) the background."""
    width, height = post["size"]
    image = rgba
    if post.get("transparent"):
        solid = rgba[..., 3] > 0.5
        ys, xs = np.nonzero(solid)
        image = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    h, w = image.shape[:2]
    aspect = width / height
    if w / h > aspect:
        crop_w = round(h * aspect)
        x0 = (w - crop_w) // 2
        image = image[:, x0 : x0 + crop_w]
    else:
        crop_h = round(w / aspect)
        focus = post.get("focus_y", 0.5)
        y0 = round((h - crop_h) * focus)
        image = image[y0 : y0 + crop_h]
    small = resize_premultiplied(image, (width, height)) if post.get("transparent") else resize_float(image, (width, height))
    rgb = adjust(small[..., :3], post)
    rgb_u8 = np.round(rgb * 255)
    opaque = small[..., 3] > 0.5
    quantized = apply_palette(rgb_u8, palette_of(rgb_u8[opaque], post.get("colors", 48)))
    alpha = np.where(opaque, 255, 0).astype(np.uint8) if post.get("transparent") else np.full(opaque.shape, 255, np.uint8)
    rgba_u8 = np.dstack([quantized, alpha]).astype(np.uint8)
    if post.get("transparent") and post.get("outline"):
        rgba_u8 = outline(rgba_u8, post.get("outline_color", "#140c1c"))
    return Image.fromarray(rgba_u8, "RGBA")


def process(job: dict, raw: np.ndarray) -> list[tuple[str, Image.Image]]:
    post = job["post"]
    kind = post["kind"]
    if kind == "sprite":
        return with_copies([(job["out"], post_sprite(raw, post))], post)
    if kind == "tiles":
        variants = post_tiles(raw, post)
        return [(f"{job['out']}-{i}", image) for i, image in enumerate(variants)]
    if kind == "picture":
        return with_copies([(job["out"], post_picture(raw, post))], post)
    raise ValueError(f"unknown post kind {kind!r} for {job['id']}")


def with_copies(outputs: list[tuple[str, Image.Image]], post: dict) -> list[tuple[str, Image.Image]]:
    """Extra files from the same result, scaled up with nearest-neighbor (an app icon from a 64px emblem, say)."""
    name, image = outputs[0]
    for copy in post.get("copies", []):
        scale = copy.get("scale", 1)
        outputs.append((copy["out"], image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)))
    return outputs


# ---------------------------------------------------------------------------------------------------------------------
# Contact sheet


def contact_sheet(entries: list[tuple[str, Image.Image]], path: Path, cell: int = 192) -> None:
    columns = 6
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell, rows * (cell + 14)), (38, 40, 34, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(entries):
        factor = max(1, min((cell - 8) // image.width, (cell - 8) // image.height))
        scaled = image.convert("RGBA").resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST)
        col, row = index % columns, index // columns
        x = col * cell + (cell - scaled.width) // 2
        y = row * (cell + 14) + (cell - scaled.height) // 2
        sheet.alpha_composite(scaled, (x, y))
        draw.text((col * cell + 4, row * (cell + 14) + cell), label[:30], fill=(230, 220, 190, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--only", help="comma-separated asset ids; a trailing * matches a prefix")
    parser.add_argument("--force", action="store_true", help="render again even when a cached raw matches")
    parser.add_argument("--reprocess", action="store_true", help="never render; post-process cached raws only")
    parser.add_argument("--sheet", nargs="?", const=CACHE_DIR / "sheet.png", type=Path, help="write a contact sheet of every candidate")
    parser.add_argument("--no-write", action="store_true", help="do not write into assets/generated (preview with --sheet)")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    comfy = manifest.get("comfy_url", "http://127.0.0.1:8188").rstrip("/")
    sheet_entries: list[tuple[str, Image.Image]] = []
    for asset in selected(manifest["assets"], args.only):
        job = resolve(asset, manifest["styles"])
        raws = ensure_raws(comfy, job, args.force, args.reprocess)
        if raws is None:
            continue
        for index, raw in enumerate(raws):
            outputs = process(job, raw)
            for name, image in outputs:
                sheet_entries.append((f"{job['id']}#{index}" if len(raws) > 1 else name.split("/")[-1], image))
            if index != job["pick"] or args.no_write:
                continue
            for name, image in outputs:
                target = OUT_DIR / f"{name}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                image.save(target, optimize=True)
                print(f"  wrote {target.relative_to(ROOT)} ({image.width}x{image.height})")
    if args.sheet and sheet_entries:
        contact_sheet(sheet_entries, args.sheet)
        print(f"  sheet {args.sheet}")


if __name__ == "__main__":
    main()
