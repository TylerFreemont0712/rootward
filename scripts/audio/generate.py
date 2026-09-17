#!/usr/bin/env python3
"""Rootward's audio pipeline: a JSON manifest of prompts -> ComfyUI (ACE-Step 1.5) -> game-ready loops and cues.

The sibling of scripts/art/generate.py, and shaped like it. ComfyUI renders the music; what makes a render usable in
the game is the post-processing: a background track cut to a whole number of bars and crossfaded into its own start so
it loops without a seam, a short cue trimmed and faded, both brought to one loudness, encoded as Opus. Raw renders are
cached under assets/.audio-cache (git-ignored), so changing only post-processing never touches the GPU again.

Usage (any Python 3.10+ with numpy; ComfyUI's own venv has it; ffmpeg with libopus on PATH):
  PY=~/personal-project/ComfyUI/.venv/bin/python
  $PY scripts/audio/generate.py                                # render what is not cached, write each asset's pick
  $PY scripts/audio/generate.py --only 'bgm-*' --no-write --sheet   # candidates only, and a page to listen to them
  $PY scripts/audio/generate.py --reprocess --sheet            # post-process cached renders only, no GPU
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = Path(__file__).with_name("manifest.json")
OUT_DIR = ROOT / "assets" / "generated"
CACHE_DIR = ROOT / "assets" / ".audio-cache"
SAMPLE_RATE = 48000

# Everything that changes what the model renders. Post-processing settings are not here: editing them reprocesses the
# cached renders instead of rendering again.
GENERATION_KEYS = (
    "unet", "clip", "lm", "vae", "tags", "lyrics", "bpm", "seconds", "timesignature", "language", "keyscale", "steps",
    "cfg", "sampler", "scheduler", "shift", "audio_codes", "lm_cfg", "temperature", "top_p", "top_k", "min_p", "seed",
    "headroom_db",
)


# ---------------------------------------------------------------------------------------------------------------------
# Manifest


def resolve(asset: dict, manifest: dict) -> dict:
    """An asset's settings: the manifest's defaults, then its style's, then its own; `post` merges one level deeper."""
    defaults = dict(manifest.get("defaults", {}))
    style = dict(manifest["styles"][asset["style"]])
    post = {**defaults.pop("post", {}), **style.pop("post", {}), **asset.get("post", {})}
    job = {**defaults, **style, **{k: v for k, v in asset.items() if k != "post"}, "post": post}
    job.setdefault("candidates", 1)
    job.setdefault("pick", 0)
    if "seed" not in job:
        job["seed"] = int(hashlib.sha256(job["id"].encode()).hexdigest()[:8], 16)
    return job


def selected(assets: list[dict], only: str | None) -> list[dict]:
    if not only:
        return assets
    patterns = [pattern.strip() for pattern in only.split(",") if pattern.strip()]

    def matches(asset_id: str) -> bool:
        return any(asset_id.startswith(p[:-1]) if p.endswith("*") else asset_id == p for p in patterns)

    picked = [a for a in assets if matches(a["id"])]
    if not picked:
        sys.exit(f"--only {only!r} matched no asset ids")
    return picked


def generation_hash(job: dict, seed: int) -> str:
    keys = {k: job.get(k) for k in GENERATION_KEYS}
    keys["seed"] = seed
    return hashlib.sha256(json.dumps(keys, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------------------------------------------------
# ComfyUI


def build_graph(job: dict, seed: int, prefix: str) -> dict:
    """ComfyUI's ACE-Step 1.5 text-to-audio template (audio_ace_step_1_5_split), as an API prompt.

    LEARN: the text encoder pair is two models. The small one embeds the caption; the larger one is a language model
    that first writes a plan of "audio codes" for the whole piece, which the diffusion model then renders. Turning
    `audio_codes` off skips the plan: faster, and noticeably less structured music.
    """
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": job["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": job["clip"], "clip_name2": job["lm"], "type": "ace", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": job["vae"]}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": job["shift"]}},
        "5": {
            "class_type": "TextEncodeAceStepAudio1.5",
            "inputs": {
                "clip": ["2", 0],
                "tags": job["tags"],
                "lyrics": job["lyrics"],
                "seed": seed,
                "bpm": job["bpm"],
                "duration": float(job["seconds"]),
                "timesignature": str(job["timesignature"]),
                "language": job["language"],
                "keyscale": job["keyscale"],
                "generate_audio_codes": job["audio_codes"],
                "cfg_scale": job["lm_cfg"],
                "temperature": job["temperature"],
                "top_p": job["top_p"],
                "top_k": job["top_k"],
                "min_p": job["min_p"],
            },
        },
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptyAceStep1.5LatentAudio", "inputs": {"seconds": float(job["seconds"]), "batch_size": 1}},
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["4", 0],
                "positive": ["5", 0],
                "negative": ["6", 0],
                "latent_image": ["7", 0],
                "seed": seed,
                "steps": job["steps"],
                "cfg": job["cfg"],
                "sampler_name": job["sampler"],
                "scheduler": job["scheduler"],
                "denoise": 1.0,
            },
        },
        "9": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        # The model's waveform can go past full scale, and a 16-bit FLAC would clip it; the level is set again later.
        "11": {"class_type": "AudioAdjustVolume", "inputs": {"audio": ["9", 0], "volume": -int(job.get("headroom_db", 3))}},
        "10": {"class_type": "SaveAudio", "inputs": {"audio": ["11", 0], "filename_prefix": prefix}},
    }


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


def render(comfy: str, job: dict, seed: int) -> bytes:
    """One candidate, rendered and fetched back as FLAC bytes."""
    graph = build_graph(job, seed, f"rootward-audio/{job['id']}")
    queued = http_json(f"{comfy}/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})
    prompt_id = queued["prompt_id"]
    started = time.monotonic()
    while True:
        history = http_json(f"{comfy}/history/{prompt_id}").get(prompt_id)
        if history and history.get("status", {}).get("completed"):
            break
        if history and history.get("status", {}).get("status_str") == "error":
            sys.exit(f"ComfyUI failed rendering {job['id']}: {json.dumps(history['status'])[:2000]}")
        if time.monotonic() - started > 1800:
            sys.exit(f"Timed out waiting for {job['id']} ({prompt_id})")
        time.sleep(2)
    ref = history["outputs"]["10"]["audio"][0]
    query = urllib.parse.urlencode({"filename": ref["filename"], "subfolder": ref["subfolder"], "type": ref["type"]})
    with urllib.request.urlopen(f"{comfy}/view?{query}", timeout=120) as response:
        return response.read()


def ensure_raws(comfy: str, job: dict, force: bool, reprocess_only: bool) -> list[Path] | None:
    """One raw FLAC per candidate, each with its own seed (seed, seed + 1, ...), rendering only what is missing or stale.
    A candidate is its own render rather than a batch, so candidates differ in their plan as well as their details."""
    if job.get("source"):
        # A recorded sound (a CC0 pack under assets/): nothing to render, only to trim, level and encode like the rest.
        source = ROOT / "assets" / job["source"]
        if not source.exists():
            print(f"  skip {job['id']}: {job['source']} is not on disk (scripts/fetch-assets.sh fetches the packs)")
            return None
        return [source]
    folder = CACHE_DIR / job["id"]
    folder.mkdir(parents=True, exist_ok=True)
    raws = []
    for index in range(job["candidates"]):
        seed = job["seed"] + index
        raw = folder / f"raw_{index}.flac"
        meta_path = folder / f"raw_{index}.json"
        digest = generation_hash(job, seed)
        cached = raw.exists() and meta_path.exists() and json.loads(meta_path.read_text()).get("hash") == digest
        if not cached or force:
            if reprocess_only:
                print(f"  skip {job['id']}#{index}: no cached render (drop --reprocess to render it)")
                return None
            print(f"  render {job['id']}#{index} ({job['seconds']}s at {job['bpm']} bpm, seed {seed})", flush=True)
            started = time.monotonic()
            raw.write_bytes(render(comfy, job, seed))
            took = time.monotonic() - started
            meta_path.write_text(json.dumps({"hash": digest, "seed": seed, "tags": job["tags"], "seconds": round(took, 1)}, indent=2))
            print(f"    took {took:.0f}s", flush=True)
        raws.append(raw)
    return raws


# ---------------------------------------------------------------------------------------------------------------------
# Post-processing


def ffmpeg(args: list[str], stdin: bytes | None = None) -> subprocess.CompletedProcess:
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args], input=stdin, capture_output=True)
    if result.returncode != 0:
        sys.exit(f"ffmpeg failed ({' '.join(args[:6])} ...): {result.stderr.decode(errors='replace')[-1500:]}")
    return result


def decode(path: Path) -> np.ndarray:
    """Float stereo samples at SAMPLE_RATE, shape (frames, 2)."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def onset(audio: np.ndarray, threshold_db: float) -> int:
    """The first frame loud enough to be the piece rather than the silence before it."""
    level = np.abs(audio).max(axis=1)
    loud = np.nonzero(level > 10 ** (threshold_db / 20))[0]
    return int(loud[0]) if len(loud) else 0


def ending(audio: np.ndarray, threshold_db: float) -> int:
    """The frame after the last one loud enough to be the piece: the model writes a whole piece, and it often ends,
    then leaves silence, before the duration it was asked for."""
    level = np.abs(audio).max(axis=1)
    loud = np.nonzero(level > 10 ** (threshold_db / 20))[0]
    return int(loud[-1]) + 1 if len(loud) else len(audio)


def loudness(audio: np.ndarray) -> tuple[float, float]:
    """Integrated loudness (LUFS) and true peak (dBTP), measured by ffmpeg's EBU R128 filter."""
    result = ffmpeg(
        ["-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "2", "-i", "-", "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        stdin=audio.astype(np.float32).tobytes(),
    )
    text = result.stderr.decode(errors="replace")
    measured = json.loads(text[text.rindex("{") : text.rindex("}") + 1])
    return float(measured["input_i"]), float(measured["input_tp"])


def level(audio: np.ndarray, post: dict) -> np.ndarray:
    """One gain for the whole clip, to the target loudness, but never louder than the peak allows.

    LEARN: this is deliberately not loudnorm's own correction, which rides the level up and down through the clip. A
    loop's end has to meet its start at the same level, and one fixed gain is the only kind that guarantees it.
    """
    if len(audio) < 1.5 * SAMPLE_RATE:
        # Integrated loudness needs longer than a sound effect lasts: level a short clip by its loudest 100 ms instead,
        # which is what the ear judges a hit or a click by.
        window = round(0.1 * SAMPLE_RATE)
        power = np.convolve((audio.astype(np.float64) ** 2).mean(axis=1), np.ones(window) / window, mode="valid") if len(audio) > window else np.array([np.mean(audio.astype(np.float64) ** 2)])
        loudest = 10 * np.log10(power.max() + 1e-12)
        peak = 20 * np.log10(np.abs(audio).max() + 1e-12)
        gain_db = min(post.get("lufs", -18) - loudest, post.get("peak", -1.5) - peak)
        return audio * np.float32(10 ** (gain_db / 20))
    integrated, peak = loudness(audio)
    if not np.isfinite(integrated) or integrated < -70:
        return audio
    gain_db = min(post.get("lufs", -18) - integrated, post.get("peak", -1.5) - peak)
    return audio * np.float32(10 ** (gain_db / 20))


def post_loop(audio: np.ndarray, job: dict) -> tuple[np.ndarray, str]:
    """A whole number of phrases from the body of the piece, with the audio just past the cut crossfaded into the start,
    so the end runs into the beginning without a seam.

    The model writes a complete piece, with an introduction and an ending, even when asked for something loopable. So
    the loop starts `skip_bars` after the first sound and stops `tail_bars` before the last, and it is a multiple of
    four bars (a phrase) when there is room for one, at most `bars` long.
    """
    post = job["post"]
    beats = int(job["timesignature"])
    bar = round(beats * 60 / job["bpm"] * SAMPLE_RATE)
    threshold = post.get("threshold_db", -40)
    first, last = onset(audio, threshold), ending(audio, threshold)
    start = first + post.get("skip_bars", 4) * bar
    fade = round(post.get("crossfade_ms", 80) / 1000 * SAMPLE_RATE)
    limit = last - post.get("tail_bars", 2) * bar
    fits = (limit - start - fade) // bar
    if fits < 1:
        # A short piece: give up the skipped introduction before giving up the loop.
        start, fits = first, (last - first - fade) // bar
    if fits < 1:
        sys.exit(f"{job['id']}: the piece is too short for even one bar")
    bars = min(post.get("bars", 16), int(fits))
    if bars >= 4:
        bars -= bars % 4
    length = bars * bar
    body = audio[start : start + length].copy()
    tail = audio[start + length : start + length + fade]
    # LEARN: an equal-power crossfade keeps the loudness steady through the overlap, where a straight linear one dips.
    ramp = np.linspace(0, np.pi / 2, fade, dtype=np.float32)[:, None]
    body[:fade] = body[:fade] * np.sin(ramp) + tail * np.cos(ramp)
    note = f"{bars} bars from bar {(start - first) // bar}, a {length / SAMPLE_RATE:.1f}s loop of a {(last - first) / SAMPLE_RATE:.0f}s piece"
    return level(body, post), note


def sections(audio: np.ndarray, silence_db: float, min_gap: float) -> list[tuple[int, int]]:
    """The stretches of a render that are music, split wherever it drops out: at least `min_gap` seconds below
    `silence_db`. A soft passage is still music; a dropout is where the model stopped and started again."""
    window = SAMPLE_RATE // 4
    count = len(audio) // window
    power = (audio[: count * window].astype(np.float64) ** 2).reshape(count, window, -1).mean(axis=(1, 2))
    quiet = 10 * np.log10(power + 1e-12) < silence_db
    found, start, run = [], None, 0
    for index, silent in enumerate(quiet):
        if not silent:
            if start is None:
                start = index
            run = 0
            continue
        run += 1
        if start is not None and run * window >= min_gap * SAMPLE_RATE:
            found.append((start * window, (index - run + 1) * window))
            start = None
    if start is not None:
        found.append((start * window, (count - run) * window))
    return found


def post_bgm(audio: np.ndarray, job: dict) -> tuple[np.ndarray, str, dict]:
    """A whole piece for a scene's music: its introduction plays once, then a body of whole phrases loops.

    The game loops between `loopStart` and `loopEnd` (written beside the files in music.json), so nothing is thrown
    away but the ending. To make the jump from the loop's end back to its start seamless, the last moments before the
    end are crossfaded into the audio that leads into the start: when playback jumps, it is already sounding like what
    comes just before it.
    """
    post = job["post"]
    beats = int(job["timesignature"])
    bar = round(beats * 60 / job["bpm"] * SAMPLE_RATE)
    threshold = post.get("threshold_db", -40)
    # The loop lives in the longest stretch of music: a dropout inside a loop would come round every time it repeats.
    parts = sections(audio, post.get("silence_db", -55), post.get("min_gap", 1.0))
    if not parts:
        sys.exit(f"{job['id']}: the render is silent")
    body_start, body_end = max(parts, key=lambda part: part[1] - part[0])
    first = body_start + onset(audio[body_start:body_end], threshold)
    last = body_start + ending(audio[body_start:body_end], threshold)
    fade = round(post.get("crossfade_ms", 150) / 1000 * SAMPLE_RATE)
    intro = post.get("intro_bars", 4)
    tail = post.get("tail_bars", 4)
    loop_start = first + intro * bar
    bars = (last - tail * bar - loop_start) // bar
    if bars < 8:
        # A short piece: loop more of it rather than a sliver.
        loop_start, bars = first + bar, (last - bar - first - bar) // bar
    if bars < 2:
        sys.exit(f"{job['id']}: the piece is too short to loop")
    if bars >= 4:
        bars -= bars % 4
    loop_end = loop_start + bars * bar
    lead = min(first, round(0.02 * SAMPLE_RATE))
    begin = first - lead
    piece = audio[begin:loop_end].copy()
    a, b = loop_start - begin, loop_end - begin
    fade = min(fade, a)
    ramp = np.linspace(0, np.pi / 2, fade, dtype=np.float32)[:, None]
    before_start = audio[loop_start - fade : loop_start]
    piece[b - fade : b] = piece[b - fade : b] * np.cos(ramp) + before_start * np.sin(ramp)
    meta = {"loopStart": round(a / SAMPLE_RATE, 4), "loopEnd": round(b / SAMPLE_RATE, 4)}
    note = (
        f"{b / SAMPLE_RATE:.0f}s: {intro}-bar introduction, then {bars} bars ({(b - a) / SAMPLE_RATE:.0f}s) looping, from the "
        f"{(last - first) / SAMPLE_RATE:.0f}s stretch at {first / SAMPLE_RATE:.0f}s of a {len(audio) / SAMPLE_RATE:.0f}s render"
        + (f" ({len(parts) - 1} dropout(s) left out)" if len(parts) > 1 else "")
    )
    return level(piece, post), note, meta


def post_cue(audio: np.ndarray, job: dict) -> tuple[np.ndarray, str]:
    """A short one-shot: from the first sound, at most `max_seconds`, faded out, with a tiny fade in against clicks."""
    post = job["post"]
    start = max(0, onset(audio, post.get("threshold_db", -40)) - round(0.005 * SAMPLE_RATE))
    clip = audio[start : start + round(post.get("max_seconds", 3) * SAMPLE_RATE)].copy()
    fade_out = min(len(clip), round(post.get("fade_ms", 250) / 1000 * SAMPLE_RATE))
    fade_in = min(len(clip), round(0.004 * SAMPLE_RATE))
    clip[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    clip[len(clip) - fade_out :] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
    return level(clip, post), f"{len(clip) / SAMPLE_RATE:.1f}s cue"


def process(job: dict, raw: Path) -> tuple[np.ndarray, str, dict | None]:
    audio = decode(raw)
    kind = job["post"]["kind"]
    if kind == "bgm":
        return post_bgm(audio, job)
    if kind == "loop":
        return (*post_loop(audio, job), None)
    if kind == "cue":
        return (*post_cue(audio, job), None)
    sys.exit(f"{job['id']}: unknown post kind {kind!r}")


def encode(audio: np.ndarray, target: Path, post: dict) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg(
        ["-y", "-v", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "2", "-i", "-", "-c:a", "libopus", "-b:a", f"{post.get('bitrate', 112)}k", str(target)],
        stdin=np.clip(audio, -1, 1).astype(np.float32).tobytes(),
    )


def listening_page(entries: list[dict], path: Path) -> None:
    """A page of every candidate, playable in the browser from disk. Loops play looped, so the seam can be heard."""
    sections = []
    for entry in entries:
        job = entry["job"]
        players = "".join(
            f"<figure><figcaption>#{c['index']} · seed {c['seed']} · {html.escape(c['note'])}"
            f"{' · <b>pick</b>' if c['index'] == job['pick'] else ''}</figcaption>"
            f"<audio controls preload=\"none\"{' loop' if job['post']['kind'] in ('loop', 'bgm') else ''} src=\"{html.escape(os.path.relpath(c['file'], path.parent))}\"></audio></figure>"
            for c in entry["candidates"]
        )
        sections.append(
            f"<section><h2>{html.escape(job['id'])}</h2>"
            f"<p class=\"meta\">{job['post']['kind']} · "
            + (f"recorded: {html.escape(job['source'])}" if job.get("source") else f"{job['bpm']} bpm · {html.escape(job['keyscale'])} · {job['timesignature']}/4 · rendered {job['seconds']}s")
            + "</p>"
            f"<p>{html.escape(job.get('tags', ''))}</p>{players}</section>"
        )
    path.write_text(
        "<!doctype html><meta charset=\"utf-8\"><title>Rootward audio candidates</title>"
        "<style>body{font:14px/1.5 system-ui,sans-serif;background:#15100b;color:#e8dcc8;max-width:960px;margin:24px auto;padding:0 16px}"
        "h1{color:#f2a541}h2{margin:28px 0 4px;color:#f2a541;font:600 18px ui-monospace,monospace}.meta{color:#a8957a;margin:0}"
        "section p{margin:4px 0 8px}figure{margin:6px 0}figcaption{font-size:12px;color:#a8957a}audio{width:100%}b{color:#6ddf9a}</style>"
        "<h1>Rootward audio candidates</h1><p>Loops repeat on their own; listen for the seam where the end runs into the start.</p>"
        + "".join(sections)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--only", help="comma-separated asset ids; a trailing * matches a prefix")
    parser.add_argument("--force", action="store_true", help="render again even when a cached raw matches")
    parser.add_argument("--reprocess", action="store_true", help="never render; post-process cached raws only")
    parser.add_argument("--sheet", nargs="?", const=CACHE_DIR / "listen.html", type=Path, help="write a page to listen to every candidate")
    parser.add_argument("--no-write", action="store_true", help="do not write into assets/generated (listen with --sheet)")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    comfy = manifest.get("comfy_url", "http://127.0.0.1:8188").rstrip("/")
    entries = []
    music_path = OUT_DIR / "audio" / "music.json"
    music = json.loads(music_path.read_text()) if music_path.exists() else {}
    for asset in selected(manifest["assets"], args.only):
        job = resolve(asset, manifest)
        raws = ensure_raws(comfy, job, args.force, args.reprocess)
        if raws is None:
            continue
        candidates = []
        for index, raw in enumerate(raws):
            audio, note, meta = process(job, raw)
            if job.get("source"):
                preview = CACHE_DIR / job["id"] / "candidate_0.ogg"
                seed = "recorded"
            else:
                preview = raw.with_name(f"candidate_{index}.ogg")
                seed = json.loads(raw.with_suffix(".json").read_text())["seed"]
            encode(audio, preview, job["post"])
            candidates.append({"index": index, "seed": seed, "note": note, "file": preview})
            print(f"  {job['id']}#{index}: {note}")
            if index == job["pick"] and not args.no_write:
                target = OUT_DIR / f"{job['out']}.ogg"
                encode(audio, target, job["post"])
                if meta is not None:
                    music[Path(job["out"]).name] = meta
                print(f"  wrote {target.relative_to(ROOT)}")
        entries.append({"job": job, "candidates": candidates})
    if music and not args.no_write:
        music_path.parent.mkdir(parents=True, exist_ok=True)
        music_path.write_text(json.dumps(dict(sorted(music.items())), indent=2) + "\n")
    if args.sheet and entries:
        args.sheet.parent.mkdir(parents=True, exist_ok=True)
        listening_page(entries, args.sheet)
        print(f"  listen: {args.sheet}")


if __name__ == "__main__":
    main()
