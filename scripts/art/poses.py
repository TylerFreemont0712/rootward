"""OpenPose skeleton sheets for pose-guided renders.

A text prompt cannot make a model draw the same character with its legs in four different places: asked for "a walk
cycle", it draws the same pose four times. An OpenPose ControlNet takes a picture of stick figures instead and puts a
body on each one, so the poses come from here and the look still comes from the prompt. All figures share one render,
which keeps them one design.

The drawing follows the OpenPose convention the ControlNets were trained on: 18 COCO keypoints, limbs as colored bars at
60% brightness, joints as full-color dots, on black. "Right" and "left" are the figure's own sides, so facing the
viewer its right hand is on the image's left.

Preview a sheet:  $PY scripts/art/poses.py walk 1280 1024 /tmp/walk-pose.png
"""

from __future__ import annotations

import math
import sys

from PIL import Image, ImageDraw

(NOSE, NECK, R_SHOULDER, R_ELBOW, R_WRIST, L_SHOULDER, L_ELBOW, L_WRIST, R_HIP, R_KNEE, R_ANKLE,
 L_HIP, L_KNEE, L_ANKLE, R_EYE, L_EYE, R_EAR, L_EAR) = range(18)

LIMBS = [
    (NECK, R_SHOULDER), (NECK, L_SHOULDER), (R_SHOULDER, R_ELBOW), (R_ELBOW, R_WRIST), (L_SHOULDER, L_ELBOW),
    (L_ELBOW, L_WRIST), (NECK, R_HIP), (R_HIP, R_KNEE), (R_KNEE, R_ANKLE), (NECK, L_HIP), (L_HIP, L_KNEE),
    (L_KNEE, L_ANKLE), (NECK, NOSE), (NOSE, R_EYE), (R_EYE, R_EAR), (NOSE, L_EYE), (L_EYE, L_EAR),
]
COLORS = [
    (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0), (170, 255, 0), (85, 255, 0), (0, 255, 0), (0, 255, 85),
    (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255), (0, 0, 255), (85, 0, 255), (170, 0, 255),
    (255, 0, 255), (255, 0, 170), (255, 0, 85),
]

Pose = dict[int, tuple[float, float]]

# Chibi proportions in figure units: the head fills the top third, x is centered on the body, y runs from the top of
# the head (0) to the soles (1).
HEAD = {NOSE: (0.0, 0.2), R_EYE: (-0.05, 0.17), L_EYE: (0.05, 0.17), R_EAR: (-0.11, 0.18), L_EAR: (0.11, 0.18)}
TORSO = {NECK: (0.0, 0.36), R_SHOULDER: (-0.11, 0.38), L_SHOULDER: (0.11, 0.38), R_HIP: (-0.07, 0.66), L_HIP: (0.07, 0.66)}


def facing_viewer(legs: dict[str, tuple[float, float, float]], arms: dict[str, tuple[float, float]], rise: float) -> Pose:
    """A front view. `legs` gives each side's (knee lift, ankle lift, ankle drop); `arms` each wrist's (dx, dy)."""
    pose: Pose = {**HEAD, **TORSO}
    for side, knee, ankle, hip in (("r", R_KNEE, R_ANKLE, R_HIP), ("l", L_KNEE, L_ANKLE, L_HIP)):
        knee_lift, ankle_lift, drop = legs[side]
        x = pose[hip][0] * 1.08
        pose[knee] = (x, 0.82 - knee_lift)
        pose[ankle] = (x * 1.05, 0.97 - ankle_lift + drop)
    for side, shoulder, elbow, wrist in (("r", R_SHOULDER, R_ELBOW, R_WRIST), ("l", L_SHOULDER, L_ELBOW, L_WRIST)):
        dx, dy = arms[side]
        sx = pose[shoulder][0]
        pose[elbow] = (sx * 1.35 + dx * 0.5, 0.52 + dy * 0.5)
        pose[wrist] = (sx * 1.45 + dx, 0.64 + dy)
    return {k: (x, y - rise if k not in (R_ANKLE, L_ANKLE) else y) for k, (x, y) in pose.items()}


def from_behind(pose: Pose) -> Pose:
    """The same body seen from the back: its right side is now on the image's right, and the face is hidden."""
    swapped: Pose = {}
    pairs = {R_SHOULDER: L_SHOULDER, R_ELBOW: L_ELBOW, R_WRIST: L_WRIST, R_HIP: L_HIP, R_KNEE: L_KNEE, R_ANKLE: L_ANKLE, R_EAR: L_EAR}
    pairs.update({v: k for k, v in pairs.items()})
    for key, (x, y) in pose.items():
        if key in (NOSE, R_EYE, L_EYE):
            continue
        swapped[pairs.get(key, key)] = (x, y)
    return swapped


def side_on(near: tuple[float, float, float, float], far: tuple[float, float, float, float], swing: float, rise: float) -> Pose:
    """Facing the image's right, left side toward the viewer. A leg is (knee dx, knee dy, ankle dx, ankle dy)."""
    pose: Pose = {
        NOSE: (0.09, 0.22), L_EYE: (0.06, 0.18), L_EAR: (-0.04, 0.19),
        NECK: (0.0, 0.36), L_SHOULDER: (0.015, 0.38), R_SHOULDER: (-0.015, 0.38),
        L_HIP: (0.015, 0.66), R_HIP: (-0.015, 0.66),
        L_ELBOW: (-swing * 0.5, 0.52), L_WRIST: (-swing, 0.63), R_ELBOW: (swing * 0.5, 0.52), R_WRIST: (swing, 0.63),
    }
    pose = {k: (x, y - rise) for k, (x, y) in pose.items()}
    for (knee_dx, knee_y, ankle_dx, ankle_y), knee, ankle in ((near, L_KNEE, L_ANKLE), (far, R_KNEE, R_ANKLE)):
        pose[knee] = (knee_dx, knee_y)
        pose[ankle] = (ankle_dx, ankle_y)
    return pose


def walk_poses() -> dict[str, list[Pose]]:
    """Per direction: a standing pose, then a four-frame walk (contact, passing, other contact, other passing)."""
    still = {"r": (0.0, 0.0, 0.0), "l": (0.0, 0.0, 0.0)}
    rest_arms = {"r": (0.0, 0.0), "l": (0.0, 0.0)}
    # From the front, a stride shows as depth: the forward foot lands lower on the screen, the trailing one sits higher,
    # and a passing leg lifts its knee.
    # The first render with gentle numbers came back with legs that barely moved, so these are exaggerated on purpose:
    # at 32px only a clearly raised foot reads as a step.
    front = [
        facing_viewer(still, rest_arms, 0.0),
        facing_viewer({"r": (0.0, 0.0, 0.03), "l": (0.14, 0.2, 0.0)}, {"r": (0.06, -0.08), "l": (-0.04, 0.04)}, 0.0),
        facing_viewer({"r": (0.0, 0.0, 0.0), "l": (0.2, 0.3, 0.0)}, rest_arms, 0.03),
        facing_viewer({"r": (0.14, 0.2, 0.0), "l": (0.0, 0.0, 0.03)}, {"r": (0.04, 0.04), "l": (-0.06, -0.08)}, 0.0),
        facing_viewer({"r": (0.2, 0.3, 0.0), "l": (0.0, 0.0, 0.0)}, rest_arms, 0.03),
    ]
    back = [from_behind(pose) for pose in front]
    # From the side the legs scissor: contact spreads them wide, passing tucks the free leg under the body.
    plant = (0.01, 0.815, 0.0, 0.97)
    side = [
        side_on((0.01, 0.82, 0.01, 0.97), (-0.01, 0.82, -0.01, 0.97), 0.0, 0.0),
        side_on((0.08, 0.81, 0.16, 0.97), (-0.06, 0.815, -0.15, 0.955), 0.1, 0.0),
        side_on(plant, (0.07, 0.775, -0.02, 0.885), 0.03, 0.02),
        side_on((-0.06, 0.815, -0.15, 0.955), (0.08, 0.81, 0.16, 0.97), -0.1, 0.0),
        side_on((0.07, 0.775, -0.02, 0.885), plant, -0.03, 0.02),
    ]
    return {"down": front, "right": side, "up": back}


def draw_sheet(rows: list[list[Pose]], width: int, height: int, figure: float = 0.86) -> Image.Image:
    """Lay poses out in a grid, one row per list, each figure `figure` of its cell's height, feet near the cell bottom."""
    image = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(image)
    columns = max(len(row) for row in rows)
    cell_w, cell_h = width / columns, height / len(rows)
    size = cell_h * figure
    stick = max(3, round(size / 64))
    for r, row in enumerate(rows):
        for c, pose in enumerate(row):
            ox = cell_w * (c + 0.5)
            oy = cell_h * (r + 1) - cell_h * (1 - figure) * 0.4 - size
            points = {k: (ox + x * size, oy + y * size) for k, (x, y) in pose.items()}
            for i, (a, b) in enumerate(LIMBS):
                if a not in points or b not in points:
                    continue
                (x1, y1), (x2, y2) = points[a], points[b]
                color = tuple(int(v * 0.6) for v in COLORS[i])
                # LEARN: OpenPose draws each limb as a filled ellipse along the bone; a polygon of 16 points is close.
                length = math.hypot(x2 - x1, y2 - y1) / 2
                angle = math.atan2(y2 - y1, x2 - x1)
                mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                polygon = [
                    (mx + length * math.cos(t) * math.cos(angle) - stick * math.sin(t) * math.sin(angle),
                     my + length * math.cos(t) * math.sin(angle) + stick * math.sin(t) * math.cos(angle))
                    for t in (2 * math.pi * k / 16 for k in range(16))
                ]
                draw.polygon(polygon, fill=color)
            for key, (x, y) in points.items():
                draw.ellipse((x - stick, y - stick, x + stick, y + stick), fill=COLORS[key])
    return image


SHEETS = {"walk": lambda: [poses for poses in walk_poses().values()]}


def sheet(name: str, width: int, height: int) -> Image.Image:
    if name not in SHEETS:
        raise ValueError(f"unknown pose sheet {name!r}; known: {', '.join(SHEETS)}")
    return draw_sheet(SHEETS[name](), width, height)


if __name__ == "__main__":
    sheet(sys.argv[1], int(sys.argv[2]), int(sys.argv[3])).save(sys.argv[4])
