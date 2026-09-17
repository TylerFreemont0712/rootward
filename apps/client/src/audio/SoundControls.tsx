import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.ts";
import { sound } from "./engine.ts";
import { type Control, useSound } from "./settings.ts";

// The sound controls (ADR-0023): a volume and a mute for everything, for the music, and for game sounds. `SoundSettings`
// is the panel itself, used wherever options are; `SoundButton` opens it from any screen.

const CONTROLS: readonly { control: Control; label: "sound.master" | "sound.music" | "sound.effects" }[] = [
  { control: "master", label: "sound.master" },
  { control: "music", label: "sound.music" },
  { control: "effects", label: "sound.effects" },
];

export function SoundSettings() {
  const t = useT();
  const state = useSound();
  const volumeOf = (control: Control) => (control === "master" ? state.master : control === "music" ? state.music : state.effects);
  const mutedOf = (control: Control) =>
    control === "master" ? state.masterMuted : control === "music" ? state.musicMuted : state.effectsMuted;
  return (
    <div className="sound-settings" role="group" aria-label={t("sound.title")}>
      {CONTROLS.map(({ control, label }) => {
        const volume = Math.round(volumeOf(control) * 100);
        const muted = mutedOf(control);
        return (
          <div key={control} className={`sound-row${muted ? " muted" : ""}`}>
            <label htmlFor={`sound-${control}`}>{t(label)}</label>
            <input
              id={`sound-${control}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(event) => {
                state.setVolume(control, Number(event.target.value) / 100);
              }}
              onPointerUp={() => {
                // Letting go of the game sounds slider plays one, so its level can be heard.
                if (control !== "music") sound.play("sfx-chime");
              }}
            />
            <span className="sound-value">{muted ? t("sound.muted") : `${volume}%`}</span>
            <button
              type="button"
              className={muted ? "btn primary" : "btn"}
              aria-pressed={muted}
              onClick={() => {
                state.toggleMute(control);
              }}
            >
              {t("sound.mute")}
            </button>
          </div>
        );
      })}
      <p className="meta sound-hint">{t("sound.hint")}</p>
    </div>
  );
}

/** A speaker button that opens the sound panel over the page, from any screen. */
export function SoundButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const silent = useSound((s) => s.masterMuted || (s.musicMuted && s.effectsMuted) || s.master === 0);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="sound-control" ref={root}>
      <button
        type="button"
        className="btn sound-button"
        aria-expanded={open}
        aria-haspopup="true"
        title={t("sound.title")}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">{silent ? "🔇" : "🔊"}</span> {t("sound.button")}
      </button>
      {open && (
        <div className="sound-panel">
          <h3>{t("sound.title")}</h3>
          <SoundSettings />
        </div>
      )}
    </div>
  );
}
