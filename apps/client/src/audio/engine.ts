import { z } from "zod";
import { audioUrl, LOOP_POINTS_URL, type SoundId } from "./catalog.ts";
import { channelGain, currentSettings, type SoundSettings, useSound } from "./settings.ts";

// The sound engine (ADR-0023), on the Web Audio API:
//
//   music track ─ fade ─┐
//                       ├─ music bus ─ duck ─┐
//   (the one before) ───┘                    ├─ destination
//   game sounds ─ volume ─── effects bus ────┘
//
// Music and game sounds meet only at the speakers, so each has its own volume and mute. A scene asks for a track by
// id; changing it crossfades, and a track left behind remembers where it was, so coming back from a fight picks the
// map's music up where it stopped. Every file is optional: an id without a file is silence, never an error.

const LoopPoints = z.record(z.string(), z.strictObject({ loopStart: z.number().nonnegative(), loopEnd: z.number().positive() }));
interface Loop {
  loopStart: number;
  loopEnd: number;
}

/** Seconds a track takes to fade out, and the next to fade in, when the scene changes. */
const FADE = 1.6;
/** Coming back to a track within this many seconds picks it up where it was left. */
const RESUME_WITHIN = 240;
/** The same sound again within this many seconds is skipped: forty hits in one volley would otherwise be a roar. */
const SAME_SOUND_GAP = 0.035;

interface Playing {
  id: string;
  source: AudioBufferSourceNode;
  fade: GainNode;
  duration: number;
  loop: Loop | undefined;
  /** Context time the source started, and where in the file it started from. */
  startedAt: number;
  offset: number;
}

export interface PlayOptions {
  /** 0 to 1, on top of the effects volume. */
  volume?: number;
  /** Seconds from now. */
  delay?: number;
  /** Playback speed, and with it pitch: a little variety keeps a repeated sound from sounding mechanical. */
  rate?: number;
}

/** Where a track is after `elapsed` seconds from `offset`, following its loop. */
export function positionIn(offset: number, elapsed: number, duration: number, loop: Loop | undefined): number {
  const at = offset + elapsed;
  if (loop && loop.loopEnd > loop.loopStart) {
    if (at < loop.loopEnd) return at;
    return loop.loopStart + ((at - loop.loopStart) % (loop.loopEnd - loop.loopStart));
  }
  return duration > 0 ? at % duration : 0;
}

class SoundEngine {
  private context: AudioContext | undefined;
  private musicBus: GainNode | undefined;
  private duck: GainNode | undefined;
  private effectsBus: GainNode | undefined;
  private readonly buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private loops: Promise<Readonly<Record<string, Loop>>> | undefined;
  private wanted: string | undefined;
  private playing: Playing | undefined;
  private switches = 0;
  private readonly left = new Map<string, { offset: number; at: number }>();
  private readonly lastPlayed = new Map<string, number>();
  private settings: SoundSettings = currentSettings();

  /** Listen for the first gesture, follow the settings, and rest while the page is hidden. Call once. */
  install(): void {
    // LEARN: browsers only let a page make sound after the person has interacted with it, so the audio context is
    // created (or resumed) inside a click or key handler, and the music asked for before then starts at that moment.
    window.addEventListener("pointerdown", this.unlock, { capture: true });
    window.addEventListener("keydown", this.unlock, { capture: true });
    useSound.subscribe((state) => {
      this.apply(state);
    });
    document.addEventListener("visibilitychange", () => {
      const context = this.context;
      if (!context) return;
      if (document.hidden) void context.suspend();
      else void context.resume();
    });
  }

  private readonly unlock = (): void => {
    if (typeof AudioContext === "undefined") return;
    if (!this.context) {
      const context = new AudioContext();
      const musicBus = context.createGain();
      const duck = context.createGain();
      const effectsBus = context.createGain();
      musicBus.connect(duck).connect(context.destination);
      effectsBus.connect(context.destination);
      this.context = context;
      this.musicBus = musicBus;
      this.duck = duck;
      this.effectsBus = effectsBus;
      this.apply(this.settings);
    }
    const context = this.context;
    if (context.state === "running") {
      void this.switchTo(this.wanted);
      return;
    }
    void context.resume().then(() => this.switchTo(this.wanted));
  };

  apply(settings: SoundSettings): void {
    this.settings = settings;
    const context = this.context;
    if (!context || !this.musicBus || !this.effectsBus) return;
    this.musicBus.gain.setTargetAtTime(channelGain(settings, "music"), context.currentTime, 0.05);
    this.effectsBus.gain.setTargetAtTime(channelGain(settings, "effects"), context.currentTime, 0.02);
  }

  /** The music the screen wants; the same id again changes nothing. */
  setMusic(id: string | undefined): void {
    if (this.wanted === id) return;
    this.wanted = id;
    void this.switchTo(id);
  }

  /** The id of the music playing, for tests and for anyone curious (also on `<html data-music>`). */
  get music(): string | undefined {
    return this.playing?.id;
  }

  /** A game sound, on the effects bus. */
  play(id: SoundId, options: PlayOptions = {}): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus || context.state !== "running" || channelGain(this.settings, "effects") === 0) return;
    const url = audioUrl(id);
    if (url === undefined) return;
    const when = context.currentTime + (options.delay ?? 0);
    if (when - (this.lastPlayed.get(id) ?? Number.NEGATIVE_INFINITY) < SAME_SOUND_GAP) return;
    this.lastPlayed.set(id, when);
    void this.load(id, url).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.rate ?? 1;
      const volume = context.createGain();
      volume.gain.value = Math.min(1, Math.max(0, options.volume ?? 1));
      source.connect(volume).connect(bus);
      source.start(Math.max(context.currentTime, when));
    });
  }

  /** Lower the music for a moment, so a fanfare or a lament is heard over it. */
  duckMusic(seconds: number, level = 0.3): void {
    const context = this.context;
    const duck = this.duck;
    if (!context || !duck) return;
    const now = context.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setTargetAtTime(level, now, 0.08);
    duck.gain.setTargetAtTime(1, now + seconds, 0.6);
  }

  private async switchTo(id: string | undefined): Promise<void> {
    const context = this.context;
    const bus = this.musicBus;
    if (!context || !bus || context.state !== "running") return;
    if (this.playing?.id === id) return;
    const token = ++this.switches;
    if (this.playing) this.fadeOut(this.playing);
    this.playing = undefined;
    document.documentElement.dataset.music = "";
    const url = id === undefined ? undefined : audioUrl(id);
    if (id === undefined || url === undefined) return;
    const [buffer, loops] = await Promise.all([this.load(id, url), this.loopPoints()]);
    // Another scene may have asked for other music while this one loaded.
    if (!buffer || token !== this.switches) return;
    const loop = loops[id];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (loop && loop.loopEnd <= buffer.duration && loop.loopStart < loop.loopEnd) {
      source.loopStart = loop.loopStart;
      source.loopEnd = loop.loopEnd;
    }
    const fade = context.createGain();
    const now = context.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE);
    source.connect(fade).connect(bus);
    const left = this.left.get(id);
    const offset = left && now - left.at < RESUME_WITHIN ? left.offset : 0;
    source.start(now, offset);
    this.playing = { id, source, fade, duration: buffer.duration, loop, startedAt: now, offset };
    document.documentElement.dataset.music = id;
  }

  private fadeOut(playing: Playing): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    this.left.set(playing.id, { offset: positionIn(playing.offset, now - playing.startedAt, playing.duration, playing.loop), at: now });
    playing.fade.gain.cancelScheduledValues(now);
    playing.fade.gain.setValueAtTime(playing.fade.gain.value, now);
    playing.fade.gain.linearRampToValueAtTime(0, now + FADE);
    playing.source.stop(now + FADE + 0.05);
  }

  private load(id: string, url: string): Promise<AudioBuffer | undefined> {
    const context = this.context;
    if (!context) return Promise.resolve(undefined);
    let buffer = this.buffers.get(id);
    if (!buffer) {
      buffer = fetch(url)
        // LEARN: the server answers a path it has no file for with the app's own page (so deep links load the game),
        // and that page arrives as a 200. Only a response that is audio is a sound; anything else is one not made yet.
        .then((response) => (response.ok && /^(audio\/|application\/ogg)/.test(response.headers.get("content-type") ?? "") ? response.arrayBuffer() : undefined))
        .then((data) => (data ? context.decodeAudioData(data) : undefined))
        .catch((error: unknown) => {
          // A file that cannot be fetched or decoded is silence, like one that was never made; say so once.
          console.warn(`Rootward: no sound for ${id}`, error);
          return undefined;
        });
      this.buffers.set(id, buffer);
    }
    return buffer;
  }

  private loopPoints(): Promise<Readonly<Record<string, Loop>>> {
    this.loops ??= fetch(LOOP_POINTS_URL)
      .then((response) => (response.ok ? response.json() : {}))
      .then((json: unknown) => {
        const parsed = LoopPoints.safeParse(json);
        return parsed.success ? parsed.data : {};
      })
      // Without loop points each track loops whole, which still plays; it is not worth a warning.
      .catch(() => ({}));
    return this.loops;
  }
}

export const sound = new SoundEngine();
