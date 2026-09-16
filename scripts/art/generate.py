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
import io
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

import poses

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = Path(__file__).with_name("manifest.json")
OUT_DIR = ROOT / "assets" / "generated"
CACHE_DIR = ROOT / "assets" / ".art-cache"

GENERATION_KEYS = (
    "checkpoint", "lora", "lora_strength", "prefix", "prompt", "suffix", "negative",
    "width", "height", "steps", "cfg", "sampler", "scheduler", "seed", "candidates", "rmbg", "control", "control_digest",
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


def build_graph(job: dict, prefix: str, control_image: str | None = None) -> dict:
    """An API-format txt2img graph; with `rmbg`, BiRefNet's mask is saved beside the render as its own image, and with
    `control`, an uploaded pose sheet steers where the bodies go."""
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
    positive, negative = ["3", 0], ["4", 0]
    control = job.get("control")
    if control and control_image:
        graph["12"] = {"class_type": "LoadImage", "inputs": {"image": control_image}}
        graph["13"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": control["model"]}}
        graph["14"] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": positive, "negative": negative, "control_net": ["13", 0], "image": ["12", 0], "vae": ["1", 2],
                "strength": control.get("strength", 1.0),
                "start_percent": control.get("start", 0.0), "end_percent": control.get("end", 1.0),
            },
        }
        positive, negative = ["14", 0], ["14", 1]
    graph["6"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": model, "positive": positive, "negative": negative, "latent_image": ["5", 0],
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


def pose_sheet(job: dict) -> Image.Image | None:
    control = job.get("control")
    return poses.sheet(control["pose"], job["width"], job["height"]) if control else None


def upload_image(comfy: str, image: Image.Image, name: str) -> str:
    """Put an image in ComfyUI's input folder (its /upload/image endpoint takes a multipart form) and return its name."""
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    boundary = uuid.uuid4().hex
    body = b"".join([
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode(),
        buffer.getvalue(),
        f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n'.encode(),
    ])
    request = urllib.request.Request(
        f"{comfy}/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())["name"]
    except urllib.error.URLError as error:
        sys.exit(f"Could not upload {name} to ComfyUI: {error}")


def render(comfy: str, job: dict) -> tuple[list[Image.Image], list[Image.Image] | None]:
    prefix = f"rootward-art/{job['id']}"
    pose = pose_sheet(job)
    control_image = upload_image(comfy, pose, f"rootward-pose-{job['id']}.png") if pose else None
    queued = http_json(f"{comfy}/prompt", {"prompt": build_graph(job, prefix, control_image), "client_id": str(uuid.uuid4())})
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
    """Float RGBA arrays in 0..1, one per candidate, rendering only when the cache is missing or stale. An asset with
    `raw_from` renders nothing of its own: it post-processes another asset's cached render (a larger battle sprite from
    the render a map sprite was cut from, so the two stay one design)."""
    if job.get("raw_from"):
        source = CACHE_DIR / job["raw_from"]
        if not (source / "meta.json").exists():
            print(f"  skip {job['id']}: {job['raw_from']} has no cached render yet (render it first)")
            return None
        return read_raws(source, job["candidates"])
    folder = CACHE_DIR / job["id"]
    meta_path = folder / "meta.json"
    pose = pose_sheet(job)
    if pose is not None:
        # Editing poses.py changes the sheet, and a changed sheet must render again even though the manifest did not.
        job["control_digest"] = hashlib.sha256(pose.tobytes()).hexdigest()
    digest = generation_hash(job)
    cached = meta_path.exists() and json.loads(meta_path.read_text()).get("hash") == digest
    if not cached or force:
        if reprocess_only:
            print(f"  skip {job['id']}: no cached render (drop --reprocess to render it)")
            return None
        print(f"  render {job['id']} ({job['candidates']} candidate(s), seed {job['seed']})", flush=True)
        rgbs, masks = render(comfy, job)
        folder.mkdir(parents=True, exist_ok=True)
        if pose is not None:
            pose.save(folder / "pose.png")
        for i, rgb in enumerate(rgbs):
            rgb.convert("RGB").save(folder / f"rgb_{i}.png")
            if masks:
                masks[i].convert("L").save(folder / f"mask_{i}.png")
        meta_path.write_text(json.dumps({"hash": digest, "prompt": job["prompt"], "seed": job["seed"]}, indent=2))
    return read_raws(folder, job["candidates"])


def read_raws(folder: Path, candidates: int) -> list[np.ndarray]:
    raws = []
    for i in range(candidates):
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


def sheet_figures(rgba: np.ndarray, min_fraction: float) -> list[np.ndarray]:
    """The separate figures on a character sheet, top row first and left to right, each cropped with its alpha. Figures
    drawn in one render share one design, which separate renders of "the same character" never quite do."""
    height, width = rgba.shape[:2]
    mask = Image.fromarray((rgba[..., 3] > 0.5).astype(np.uint8) * 255)
    small = np.asarray(mask.resize((width // 4, height // 4), Image.Resampling.BOX)) > 40
    labels = np.zeros(small.shape, dtype=np.int32)
    boxes: list[tuple[int, int, int, int, int]] = []
    for start_y, start_x in zip(*np.nonzero(small)):
        if labels[start_y, start_x]:
            continue
        label = len(boxes) + 1
        labels[start_y, start_x] = label
        stack, count = [(start_y, start_x)], 0
        y0 = y1 = start_y
        x0 = x1 = start_x
        while stack:
            y, x = stack.pop()
            count += 1
            y0, y1, x0, x1 = min(y0, y), max(y1, y), min(x0, x), max(x1, x)
            # A two-pixel reach bridges the hairline gaps pixel art leaves inside one figure.
            for ny in range(y - 2, y + 3):
                for nx in range(x - 2, x + 3):
                    if 0 <= ny < small.shape[0] and 0 <= nx < small.shape[1] and small[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        stack.append((ny, nx))
        boxes.append((count, y0, y1, x0, x1))
    largest = max((box[0] for box in boxes), default=0)
    kept = sorted((box for box in boxes if box[0] >= largest * min_fraction), key=lambda box: (round(box[1] / 40), box[3]))
    return [
        rgba[max(0, y0 * 4 - 4) : min(height, (y1 + 1) * 4 + 4), max(0, x0 * 4 - 4) : min(width, (x1 + 1) * 4 + 4)]
        for _, y0, y1, x0, x1 in kept
    ]


def stride(frame: np.ndarray, lifted: str) -> np.ndarray:
    """One step of a walk: the body rises a pixel while one foot stays planted and the other lifts with it."""
    solid = frame[..., 3] > 0
    rows = np.nonzero(solid.any(axis=1))[0]
    cols = np.nonzero(solid.any(axis=0))[0]
    top, bottom = rows.min(), rows.max()
    foot_top = bottom - max(3, round((bottom - top + 1) * 0.16)) + 1
    middle = (cols.min() + cols.max()) // 2
    out = np.zeros_like(frame)
    out[top - 1 : foot_top - 1] = frame[top:foot_top]
    bridge = out[foot_top - 1]
    gap = bridge[:, 3] == 0
    bridge[gap] = frame[foot_top - 1][gap]
    feet = frame[foot_top : bottom + 1]
    raised_columns = np.zeros(frame.shape[1], dtype=bool)
    if lifted == "left":
        raised_columns[: middle + 1] = True
    else:
        raised_columns[middle + 1 :] = True
    planted, raised = feet.copy(), feet.copy()
    planted[:, raised_columns] = 0
    raised[:, ~raised_columns] = 0
    ground = out[foot_top : bottom + 1]
    ground[planted[..., 3] > 0] = planted[planted[..., 3] > 0]
    lift = out[foot_top - 1 : bottom]
    lift[raised[..., 3] > 0] = raised[raised[..., 3] > 0]
    return out


def walk_strip(sprite: Image.Image) -> Image.Image:
    """Four frames side by side: stand, step, stand, other step. Two transparent rows on top give the body room to rise.
    LEARN: at 32px a whole-body bob with alternating planted feet reads as a stride; drawing real leg poses would need
    the model to keep one design across frames, which it cannot promise."""
    frame = np.concatenate([np.zeros((2, sprite.width, 4), dtype=np.uint8), np.asarray(sprite.convert("RGBA"))], axis=0)
    frames = [frame, stride(frame, "left"), frame, stride(frame, "right")]
    return Image.fromarray(np.concatenate(frames, axis=1), "RGBA")


def sheet_alpha(raw: np.ndarray, post: dict) -> np.ndarray:
    """A sheet of figures with its background cut away. Background removal is made for one subject; across a sheet it
    smears a band that joins every figure into one blob. Sheets are drawn on plain white, so anything clearly darker than
    white is a figure, except pale ground lines and shadows in `background_colors`."""
    solid = raw[..., :3].min(axis=2) < post.get("background_cut", 0.9)
    for color in post.get("background_colors", []):
        target = np.array(hex_rgb(color), dtype=np.float32) / 255
        near = np.sqrt(((raw[..., :3] - target) ** 2).sum(axis=2)) < post.get("background_tolerance", 0.14)
        solid &= ~near
    return np.dstack([raw[..., :3], solid.astype(np.float32)])


def post_walk_cycle(rgba: np.ndarray, post: dict, job: dict) -> list[tuple[str, Image.Image]]:
    """A pose-guided sheet (rows of directions; a standing pose, then walk frames) cut into one strip per direction.

    Every figure is scaled by the same factor, so the character is one size whichever way it faces, and anchored by the
    middle of its head with its lowest foot on the frame's bottom row, so the head holds still while the legs move and
    the body's rise on a passing step survives. All frames share one palette, so colors do not flicker between frames."""
    frame_w, frame_h = post["size"]
    pad, headroom = 1, post.get("headroom", 2)
    directions, columns = post["rows"], post["columns"]
    cell_h, cell_w = rgba.shape[0] // len(directions), rgba.shape[1] // columns
    figures = []
    for r, direction in enumerate(directions):
        for c in range(columns):
            cell = drop_fragments(rgba[r * cell_h : (r + 1) * cell_h, c * cell_w : (c + 1) * cell_w], post.get("keep_fraction", 0.2))
            ys, xs = np.nonzero(cell[..., 3] > 0.5)
            if len(xs) == 0:
                raise ValueError(f"{job['id']}: no figure in row {r} column {c}")
            crop = cell[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
            head = np.nonzero(crop[: max(1, round(crop.shape[0] * 0.3)), :, 3] > 0.5)[1]
            figures.append((direction, crop, float(head.mean())))
    # LEARN: the head's middle anchors the figure, so the space it needs is twice its farthest reach from that point.
    scale = min(
        min((frame_w - 2 * pad) / (2 * max(head_x, crop.shape[1] - head_x)), (frame_h - 2 * pad - headroom) / crop.shape[0])
        for _, crop, head_x in figures
    )
    frames = []
    for direction, crop, head_x in figures:
        size = (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale)))
        small = resize_premultiplied(crop, size)
        small = np.dstack([adjust(small[..., :3], post), small[..., 3:4]])
        canvas = np.zeros((frame_h, frame_w, 4), dtype=np.float32)
        top, left = frame_h - pad - size[1], round(frame_w / 2 - head_x * scale)
        x0, x1 = max(pad, left), min(frame_w - pad, left + size[0])
        canvas[top : top + size[1], x0:x1] = small[:, x0 - left : x1 - left]
        frames.append((direction, canvas))
    opaque_pixels = np.concatenate([np.round(f[..., :3][f[..., 3] > post.get("alpha_cut", 0.5)] * 255) for _, f in frames])
    palette = palette_of(opaque_pixels, post.get("colors", 16))
    by_direction: dict[str, list[np.ndarray]] = {}
    for direction, canvas in frames:
        opaque = canvas[..., 3] > post.get("alpha_cut", 0.5)
        out = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
        out[opaque, :3] = apply_palette(np.round(canvas[..., :3] * 255), palette)[opaque]
        out[opaque, 3] = 255
        by_direction.setdefault(direction, []).append(outline(out, post.get("outline_color", "#140c1c")))
    outputs = []
    for direction, strip in by_direction.items():
        outputs.append((f"{job['out']}-walk-{direction}", Image.fromarray(np.concatenate(strip, axis=1), "RGBA")))
        if direction == "down":
            outputs.append((job["out"], Image.fromarray(strip[0], "RGBA")))
    return outputs


def post_pose_strip(rgba: np.ndarray, post: dict, job: dict) -> Image.Image:
    """A pose-guided sheet cut into one strip of registered frames: the battle poses of one character, in sheet order.

    Unlike a walk cycle, a battle pose moves the whole body (a lunge carries it forward, a hurt knocks it back), so frames
    are not centered on the figure. Every cell is cropped to the same box, the union of all the figures, and scaled by one
    factor, so a body keeps the place the pose sheet gave it. Only height is re-anchored, lowest foot to the bottom row,
    so no frame floats. All frames share one palette."""
    frame_w, frame_h = post["size"]
    rows, columns = post["rows"], post["columns"]
    pad = 1
    cell_h, cell_w = rgba.shape[0] // rows, rgba.shape[1] // columns
    cells = []
    for r in range(rows):
        for c in range(columns):
            cell = drop_fragments(rgba[r * cell_h : (r + 1) * cell_h, c * cell_w : (c + 1) * cell_w], post.get("keep_fraction", 0.2))
            ys, xs = np.nonzero(cell[..., 3] > 0.5)
            if len(xs) == 0:
                raise ValueError(f"{job['id']}: no figure in row {r} column {c}")
            cells.append((cell, ys, xs))
    left = min(int(xs.min()) for _, _, xs in cells)
    right = max(int(xs.max()) for _, _, xs in cells) + 1
    tallest = max(int(ys.max() - ys.min()) + 1 for _, ys, _ in cells)
    scale = min((frame_w - 2 * pad) / (right - left), (frame_h - 2 * pad) / tallest)
    frames = []
    for cell, ys, _ in cells:
        top, bottom = int(ys.min()), int(ys.max()) + 1
        crop = cell[top:bottom, left:right]
        size = (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale)))
        small = resize_premultiplied(crop, size)
        small = np.dstack([adjust(small[..., :3], post), small[..., 3:4]])
        canvas = np.zeros((frame_h, frame_w, 4), dtype=np.float32)
        y0, x0 = frame_h - pad - size[1], (frame_w - size[0]) // 2
        canvas[max(0, y0) : y0 + size[1], x0 : x0 + size[0]] = small[max(0, -y0) :]
        frames.append(canvas)
    cut = post.get("alpha_cut", 0.5)
    palette = palette_of(np.concatenate([np.round(f[..., :3][f[..., 3] > cut] * 255) for f in frames]), post.get("colors", 24))
    strip = []
    for canvas in frames:
        opaque = canvas[..., 3] > cut
        out = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
        out[opaque, :3] = apply_palette(np.round(canvas[..., :3] * 255), palette)[opaque]
        out[opaque, 3] = 255
        strip.append(outline(out, post.get("outline_color", "#140c1c")))
    return Image.fromarray(np.concatenate(strip, axis=1), "RGBA")


def post_glow(raw: np.ndarray, post: dict) -> Image.Image:
    """A light effect rendered on black, made into a sprite whose alpha is its brightness.

    LEARN: fire, lightning and magic are light, and light adds: drawn with additive blending ("lighter" on a canvas),
    black contributes nothing, so a render on black is already the effect. Turning brightness into alpha (and dividing
    the color back out) also lets the same sprite draw correctly with ordinary blending. Alpha is cut into a few hard
    steps, like the palette, so a glow still reads as pixel art rather than a soft airbrush."""
    rgb = raw[..., :3]
    edges = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    if edges.mean() > 0.35:
        print(f"  warning: a glow was rendered on a light background (edge brightness {edges.mean():.2f}); do not pick it")
    if post.get("flip"):
        rgb = rgb[:, ::-1]
    if post.get("rotate"):
        rotated = Image.fromarray(np.round(rgb * 255).astype(np.uint8), "RGB").rotate(post["rotate"], resample=Image.Resampling.BICUBIC)
        rgb = np.asarray(rotated, dtype=np.float32) / 255
    black = post.get("black", 0.08)
    alpha = np.clip((rgb.max(axis=2) - black) / (1 - black), 0, 1) ** post.get("alpha_gamma", 0.8)
    if post.get("vignette", 0.3) > 0:
        # Light that runs off the edge of the render would end in a hard square edge; fade it out toward the border.
        height, width = alpha.shape
        ys, xs = np.mgrid[0:height, 0:width]
        reach = np.sqrt(((xs - width / 2) / (width / 2)) ** 2 + ((ys - height / 2) / (height / 2)) ** 2)
        alpha = alpha * np.clip((1 - reach) / post.get("vignette", 0.3), 0, 1)
    ys, xs = np.nonzero(alpha > post.get("crop_threshold", 0.12))
    if len(xs) == 0:
        raise ValueError("the render is black: nothing to make a glow from")
    margin = post.get("margin", 0.04)
    height, width = alpha.shape
    my, mx = round(height * margin), round(width * margin)
    y0, y1 = max(0, ys.min() - my), min(height, ys.max() + 1 + my)
    x0, x1 = max(0, xs.min() - mx), min(width, xs.max() + 1 + mx)
    out_w, out_h = post["size"]
    scale = min(out_w / (x1 - x0), out_h / (y1 - y0))
    size = (max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale)))
    # The render's color is already weighted by its brightness, so it averages like premultiplied color.
    small = resize_float(np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1, None]]), size)
    small_alpha = small[..., 3]
    color = np.where(small_alpha[..., None] > 1e-3, small[..., :3] / np.maximum(small_alpha[..., None], 1e-3), 0)
    color = adjust(np.clip(color, 0, 1), post)
    levels = post.get("alpha_levels", 4)
    stepped = np.ceil(small_alpha * levels - post.get("alpha_floor", 0.35)) / levels
    stepped = np.clip(stepped, 0, 1)
    visible = stepped > 0
    rgb_u8 = np.round(color * 255)
    quantized = apply_palette(rgb_u8, palette_of(rgb_u8[visible], post.get("colors", 24)))
    canvas = np.zeros((out_h, out_w, 4), dtype=np.uint8)
    top, left = (out_h - size[1]) // 2, (out_w - size[0]) // 2
    region = canvas[top : top + size[1], left : left + size[0]]
    region[visible, :3] = quantized[visible]
    region[..., 3] = np.round(stepped * 255).astype(np.uint8)
    return Image.fromarray(canvas, "RGBA")


def process(job: dict, raw: np.ndarray) -> list[tuple[str, Image.Image]]:
    post = job["post"]
    kind = post["kind"]
    if kind == "pose-strip":
        # Background removal's own mask, unless told to cut the white instead: on a sheet of well-spaced figures it keeps
        # pale skin and white eyes that a white cut would punch holes through.
        alpha = sheet_alpha(raw, post) if post.get("alpha") == "white" else raw
        return [(job["out"], post_pose_strip(alpha, post, job))]
    if kind == "glow":
        return [(job["out"], post_glow(raw, post))]
    if kind == "sprite":
        return with_copies([(job["out"], post_sprite(raw, post))], post)
    if kind == "tiles":
        variants = post_tiles(raw, post)
        return [(f"{job['out']}-{i}", image) for i, image in enumerate(variants)]
    if kind == "picture":
        return with_copies([(job["out"], post_picture(raw, post))], post)
    if kind == "walk-cycle":
        return post_walk_cycle(sheet_alpha(raw, post), post, job)
    if kind == "walk-sheet":
        figures = sheet_figures(sheet_alpha(raw, post), post.get("figure_fraction", 0.25))
        outputs = []
        for direction, index in post["views"].items():
            if index >= len(figures):
                raise ValueError(f"{job['id']}: view {direction} wants figure {index}, but the sheet has {len(figures)}")
            sprite = post_sprite(figures[index], {**post, "keep_fraction": post.get("keep_fraction", 0.2)})
            outputs.append((f"{job['out']}-walk-{direction}", walk_strip(sprite)))
            if direction == "down":
                outputs.append((job["out"], sprite))
        return outputs
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
