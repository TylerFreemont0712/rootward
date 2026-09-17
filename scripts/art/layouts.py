"""Composition sketches for layout-guided renders (Shardrun's arenas, ADR-0019).

A prompt cannot place things. Asked for "a battle arena with a wide floor", a model paints a wall with a staircase in
the middle and props exactly where the fighters stand. A layout sketch fixes the composition instead: it is drawn here
in broad, blurred shapes of value and color, and the render starts from it (img2img) rather than from noise, so the
model invents every detail but keeps the big shapes: dark above, a lit floor below, an open middle, framed edges.

What Shardrun's stage needs from a backdrop, and so what every sketch draws:
- a dark ceiling band on top, where the code view and a guardian's health bar sit, so text stays readable;
- a broad, flat, uncluttered floor across the lower two fifths, lit where the fighters stand (the Maintainer near 20%
  of the width, foes from 50% to 95%);
- an open middle, where bolts fly;
- a glow far back in the distance, for depth, placed behind where a guardian stands in its own room;
- darker structures framing both edges, so the eye stays inside.

Preview a sketch:  $PY scripts/art/layouts.py salvage 1536 640 /tmp/salvage-layout.png
"""

from __future__ import annotations

import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Color = tuple[int, int, int]


def hex_color(value: str) -> Color:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def mix(a: Color, b: Color, t: float) -> Color:
    return (round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t), round(a[2] + (b[2] - a[2]) * t))


# Each arena: its colors, where its distant glow sits (a share of width and height), and how its edges are framed.
ARENAS: dict[str, dict] = {
    # The first layer: an ancient machine vault of warm stone and brass under amber lanterns. Warm, because the
    # Maintainer and the Null Wraith are violet: a violet room swallowed them both.
    "salvage": {
        "ceiling": "#0c0908", "wall": "#3a2c22", "haze": "#7a624c", "glow": "#ffd7a0",
        "floor_far": "#5a463a", "floor_near": "#1a120e", "pool": "#8a6c52", "frame": "#0a0706",
        "accents": [("#ffb347", 0.1, 0.3), ("#ffb347", 0.9, 0.3)],
        "focal": (0.52, 0.42), "floor_top": 0.6, "structures": "arches",
    },
    # The second layer: caverns of stacked slate memory blocks in a cold mist, with a leak glowing on the open floor
    # between the fighters. The mist is muted: a bright green light came back as a neon bar where the bolts fly, and
    # the Memory Leak Ooze is green.
    "heap": {
        "ceiling": "#06090d", "wall": "#1e2a33", "haze": "#3f5a5a", "glow": "#8fc9b0",
        "floor_far": "#2f3d42", "floor_near": "#0a0f12", "pool": "#4b6660", "frame": "#040607",
        "accents": [("#7dff6a", 0.4, 0.72)],
        "focal": (0.5, 0.44), "floor_top": 0.62, "structures": "stacks",
    },
    # The third layer: the core, an obsidian and gold circuit cathedral lit white-gold from far away.
    "kernel": {
        "ceiling": "#050407", "wall": "#1d1822", "haze": "#5c4a3a", "glow": "#fff1c4",
        "floor_far": "#3b3036", "floor_near": "#0b090c", "pool": "#6b5a48", "frame": "#030203",
        "accents": [("#ff4a3d", 0.08, 0.36), ("#ff4a3d", 0.92, 0.36)],
        "focal": (0.5, 0.4), "floor_top": 0.6, "structures": "pillars",
    },
    # The Kiln Warden's forge: cold stone, and the kiln's fire behind where the guardian stands.
    "kiln": {
        "ceiling": "#0a0a0d", "wall": "#2a2b30", "haze": "#6a4a38", "glow": "#ff9a3c",
        "floor_far": "#4a3d36", "floor_near": "#141113", "pool": "#7a5a44", "frame": "#060607",
        "accents": [],
        "focal": (0.72, 0.38), "floor_top": 0.62, "structures": "furnace",
    },
    # The Deadlock Golem's vault: bronze doors and chains in warm lamplight, so its blue chains stand out.
    "vault": {
        "ceiling": "#0b0806", "wall": "#3a2a1c", "haze": "#7a5a36", "glow": "#ffd28a",
        "floor_far": "#4e3c2c", "floor_near": "#140e0a", "pool": "#8a6a44", "frame": "#070504",
        "accents": [("#ffc062", 0.08, 0.46), ("#ffc062", 0.94, 0.46)],
        "focal": (0.72, 0.4), "floor_top": 0.6, "structures": "vault",
    },
    # The Root Daemon's throne: obsidian and gold, with a white-hot core behind the throne to cut its silhouette out.
    "throne": {
        "ceiling": "#040305", "wall": "#18131c", "haze": "#4a3a2c", "glow": "#fff6dc",
        "floor_far": "#342a2e", "floor_near": "#080608", "pool": "#5e4e40", "frame": "#020102",
        "accents": [("#ffc84a", 0.2, 0.3), ("#ffc84a", 0.8, 0.3)],
        "focal": (0.72, 0.36), "floor_top": 0.62, "structures": "throne",
    },
}


def arena(name: str, width: int, height: int) -> Image.Image:
    spec = ARENAS[name]
    rng = random.Random(name)
    color = {key: hex_color(spec[key]) for key in ("ceiling", "wall", "haze", "glow", "floor_far", "floor_near", "pool", "frame")}
    fx, fy = spec["focal"]
    horizon = spec["floor_top"]
    image = Image.new("RGB", (width, height))
    pixels = image.load()

    # Ceiling to wall: dark at the top, lifting toward the horizon and toward the glow.
    for y in range(round(height * horizon)):
        t = y / (height * horizon)
        base = mix(color["ceiling"], color["wall"], min(1.0, t * 1.3))
        for x in range(width):
            dx, dy = (x / width - fx) * 1.6, (y / height - fy) * 2.2
            glow = max(0.0, 1 - math.hypot(dx, dy) / 0.55) ** 2.2
            haze = max(0.0, 1 - abs(y / height - horizon) / 0.22) * 0.35
            # Soft, not blinding: a glow that is too strong comes back as a giant star right where the bolts fly.
            pixels[x, y] = mix(mix(base, color["haze"], haze), color["glow"], glow * 0.6)

    # Floor: far and lit near the horizon, dark toward the viewer, with a pool of light where the fighters stand.
    for y in range(round(height * horizon), height):
        t = (y / height - horizon) / (1 - horizon)
        base = mix(color["floor_far"], color["floor_near"], t ** 0.8)
        for x in range(width):
            px, py = (x / width - 0.56) / 0.46, (y / height - 0.8) / 0.16
            pool = max(0.0, 1 - math.hypot(px, py)) ** 1.6
            dx = (x / width - fx) * 1.4
            reflection = max(0.0, 1 - abs(dx) / 0.3) * max(0.0, 1 - t * 2.2) * 0.35
            pixels[x, y] = mix(mix(base, color["pool"], pool * 0.7), color["glow"], reflection)

    draw = ImageDraw.Draw(image)
    structures(draw, spec["structures"], width, height, horizon, color, rng, (fx, fy))

    # Perspective seams across the floor, converging on the glow: they tell the model "this is a floor".
    for i in range(-9, 10):
        x0 = width * (0.5 + i * 0.12)
        draw.line([(x0, height), (width * fx, height * horizon)], fill=mix(color["floor_near"], color["floor_far"], 0.55), width=3)
    for i in range(1, 6):
        y = height * (horizon + (1 - horizon) * (i / 6) ** 1.7)
        draw.line([(0, y), (width, y)], fill=mix(color["floor_near"], color["floor_far"], 0.45), width=2)

    # Accent lights: braziers, leaks, warning lamps.
    for accent, ax, ay in spec["accents"]:
        tone = hex_color(accent)
        radius = height * 0.06
        draw.ellipse([width * ax - radius, height * ay - radius, width * ax + radius, height * ay + radius], fill=tone)

    # Framing: darker masses up both edges, and a dark lip along the very bottom.
    for side in (0, 1):
        edge = round(width * 0.075)
        for y in range(height):
            wobble = edge + round(math.sin(y / height * 7 + side * 2) * width * 0.012)
            x_range = range(0, wobble) if side == 0 else range(width - wobble, width)
            for x in x_range:
                depth = (wobble - x) / wobble if side == 0 else (x - (width - wobble)) / wobble
                pixels[x, y] = mix(pixels[x, y], color["frame"], min(1.0, 0.55 + depth * 0.45))
    draw.rectangle([0, height * 0.965, width, height], fill=color["frame"])

    # Blur away the drawing: only values and colors should guide the render, never these hard edges. A little grain,
    # seeded by the arena's name so the sketch (and so the render cache) is the same every time, gives the model texture
    # to grow detail from.
    image = image.filter(ImageFilter.GaussianBlur(radius=height * 0.012))
    grain = np.random.default_rng(sum(name.encode())).normal(128, 18, (height, width, 1)).clip(0, 255).astype(np.uint8)
    noise = Image.fromarray(np.repeat(grain, 3, axis=2), "RGB")
    return Image.blend(image, noise, 0.06)


def structures(draw: ImageDraw.ImageDraw, kind: str, width: int, height: int, horizon: float, color: dict[str, Color], rng: random.Random, focal: tuple[float, float]) -> None:
    """Silhouettes along the back wall, smaller toward the glow, never on the floor."""
    back = mix(color["wall"], color["frame"], 0.45)
    far = mix(color["wall"], color["haze"], 0.35)
    base = height * horizon
    fx = width * focal[0]
    if kind in ("arches", "pillars", "throne"):
        count = 7
        for i in range(count):
            t = i / (count - 1)
            x = width * (0.08 + t * 0.84)
            near = abs(x - fx) / width
            w = width * (0.035 + near * 0.05)
            top = base - height * (0.3 + near * 0.55)
            draw.rectangle([x - w / 2, top, x + w / 2, base], fill=back if near > 0.18 else far)
            if kind == "arches" and i < count - 1:
                nx = width * (0.08 + (i + 1) / (count - 1) * 0.84)
                draw.arc([x, top - height * 0.05, nx, top + height * 0.12], 180, 360, fill=back, width=round(height * 0.02))
        if kind == "throne":
            draw.polygon([(fx - width * 0.08, base), (fx + width * 0.08, base), (fx + width * 0.04, base - height * 0.3), (fx - width * 0.04, base - height * 0.3)], fill=back)
    elif kind == "stacks":
        for _ in range(26):
            x = rng.uniform(0.05, 0.95) * width
            if abs(x - fx) < width * 0.12:
                continue
            w = rng.uniform(0.04, 0.1) * width
            h = rng.uniform(0.12, 0.42) * height * (0.6 + abs(x - fx) / width)
            draw.rectangle([x - w / 2, base - h, x + w / 2, base], fill=back if rng.random() < 0.6 else far)
    elif kind == "furnace":
        draw.rectangle([fx - width * 0.14, base - height * 0.46, fx + width * 0.14, base], fill=back)
        draw.ellipse([fx - width * 0.08, base - height * 0.36, fx + width * 0.08, base - height * 0.06], fill=color["glow"])
        for x in (0.12, 0.3):
            draw.rectangle([width * x - width * 0.03, base - height * 0.5, width * x + width * 0.03, base], fill=back)
    elif kind == "vault":
        draw.ellipse([fx - width * 0.17, base - height * 0.55, fx + width * 0.17, base + height * 0.05], fill=far)
        draw.ellipse([fx - width * 0.1, base - height * 0.42, fx + width * 0.1, base - height * 0.05], fill=color["glow"])
        for x in (0.1, 0.28, 0.9):
            draw.rectangle([width * x - width * 0.025, base - height * 0.48, width * x + width * 0.025, base], fill=back)


# A layer map's rooms (ADR-0021): one small chamber carved into the layer's rock, seen in cross-section, lit from inside,
# with a flat floor for whatever waits there (a foe, a campfire, a chest) to stand on. The client puts the contents in,
# so every room of a layer shares one chamber and the map reads as one place. Keep the light warm and dim: a white light
# in the middle of the sketch came back as a pillar of light right where the foes stand.
CHAMBERS: dict[str, dict[str, str]] = {
    "salvage": {"rock": "#120d09", "rim": "#4a3828", "inside": "#3a2c22", "light": "#ffcf8a", "floor": "#6b5240"},
    "heap": {"rock": "#080c0e", "rim": "#2a3a3e", "inside": "#1e2a2e", "light": "#a8f0c8", "floor": "#34484a"},
    "kernel": {"rock": "#050407", "rim": "#3a3020", "inside": "#141118", "light": "#e0a84a", "floor": "#1e1a22"},
}


def chamber(name: str, width: int, height: int) -> Image.Image:
    spec = {key: hex_color(value) for key, value in CHAMBERS[name].items()}
    image = Image.new("RGB", (width, height), spec["rock"])
    draw = ImageDraw.Draw(image)
    left, right, top, bottom = width * 0.1, width * 0.9, height * 0.12, height * 0.84
    rim = height * 0.035
    # The rock's lit edge, then the room: an arched ceiling, square at the floor.
    draw.rounded_rectangle([left - rim, top - rim, right + rim, bottom + rim], radius=height * 0.36, fill=spec["rim"])
    draw.rounded_rectangle([left, top, right, bottom], radius=height * 0.33, fill=spec["inside"])
    draw.rectangle([left, bottom - height * 0.3, right, bottom], fill=spec["inside"])
    pixels = image.load()
    floor_top = bottom - height * 0.2
    for y in range(round(top), round(bottom)):
        for x in range(round(left), round(right)):
            if pixels[x, y] != spec["inside"]:
                continue
            dx, dy = (x / width - 0.5) * 1.6, (y / height - 0.34) * 2.0
            glow = max(0.0, 1 - math.hypot(dx, dy) / 0.62) ** 1.8
            base = spec["floor"] if y >= floor_top else spec["inside"]
            pixels[x, y] = mix(base, spec["light"], glow * 0.55)
    image = image.filter(ImageFilter.GaussianBlur(radius=height * 0.012))
    grain = np.random.default_rng(sum(f"chamber-{name}".encode())).normal(128, 18, (height, width, 1)).clip(0, 255).astype(np.uint8)
    return Image.blend(image, Image.fromarray(np.repeat(grain, 3, axis=2), "RGB"), 0.06)


def sheet(name: str, width: int, height: int) -> Image.Image:
    if name.startswith("chamber-") and name.removeprefix("chamber-") in CHAMBERS:
        return chamber(name.removeprefix("chamber-"), width, height)
    if name not in ARENAS:
        raise ValueError(f"unknown layout {name!r}; known: {', '.join([*ARENAS, *(f'chamber-{c}' for c in CHAMBERS)])}")
    return arena(name, width, height)


if __name__ == "__main__":
    sheet(sys.argv[1], int(sys.argv[2]), int(sys.argv[3])).save(sys.argv[4])
