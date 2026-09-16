import "../theme/menu.css";
import { useEffect } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { LanguagePicker } from "../i18n/LanguagePicker.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";
import { Ambience } from "../world/Ambience.tsx";
import { whereabouts } from "./title.ts";

const ENDED = new Set(["won", "lost", "abandoned"]);

/**
 * The main menu for the chosen character: one door into each mode. The World is the classic game (a town, quests, and
 * fights that are programming problems); Shardrun is the roguelite. Only the mode you pick runs.
 */
export function MainMenu() {
  const profile = useGame((s) => s.activeProfile);
  const summaries = useGame((s) => s.profileSummaries);
  const classes = useGame((s) => s.classes);
  const showWorld = useGame((s) => s.showWorld);
  const showShardrun = useGame((s) => s.showShardrun);
  const showCodex = useGame((s) => s.showCodex);
  const switchProfile = useGame((s) => s.switchProfile);
  const loadProfiles = useGame((s) => s.loadProfiles);
  const shardrun = useShardrun((s) => s.run);
  const dev = useShardrun((s) => s.dev);
  const loadShardrun = useShardrun((s) => s.load);
  const profileId = profile?.id;
  const t = useT();

  useEffect(() => {
    if (profileId === undefined) return;
    void loadProfiles();
    void loadShardrun(profileId);
  }, [profileId, loadProfiles, loadShardrun]);

  if (!profile) return null;
  const summary = summaries[profile.id];
  const classCard = classes.find((candidate) => candidate.id === profile.classId);
  const portrait = assetUrl("portraits", profile.classId);
  const backdrop = assetUrl("backgrounds", "title");
  const worldArt = assetUrl("backgrounds", "title");
  const shardrunArt = assetUrl("backgrounds", "arena-salvage") ?? assetUrl("backgrounds", "salvage");
  const emblem = assetUrl("brand", "emblem");
  const runInProgress = shardrun && !ENDED.has(shardrun.status) ? shardrun : undefined;

  return (
    <div className="menu-screen">
      <div className="title-backdrop" style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined} aria-hidden="true" />
      <Ambience kind="embers" />
      <div className="menu-layout">
        <header className="menu-brand">
          {emblem && <img src={emblem} alt="" draggable={false} />}
          <h1>ROOTWARD</h1>
        </header>

        <section className="menu-character" aria-label={t("menu.character")}>
          <div className="class-portrait">{portrait ? <img src={portrait} alt="" draggable={false} /> : <span aria-hidden="true">@</span>}</div>
          <div className="menu-character-info">
            <div className="class-name">{profile.name}</div>
            <div className="meta">
              {summary?.className ?? classCard?.name ?? profile.classId} ·{" "}
              {t("menu.version", { version: summary?.version ?? "1.0.0" })}
            </div>
            <div className="meta">{whereabouts(summary, t)}</div>
          </div>
          <button type="button" className="btn" onClick={switchProfile}>
            {t("menu.switch")}
          </button>
        </section>

        <div className="menu-modes">
          <button type="button" className="menu-mode" onClick={showWorld}>
            {worldArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${worldArt}")` }} aria-hidden="true" />}
            <span className="menu-mode-tag">{t("menu.world.tag")}</span>
            <span className="menu-mode-name">{t("menu.world.name")}</span>
            <span className="menu-mode-text">{t("menu.world.text")}</span>
            <span className="menu-mode-status">
              {summary?.zoneName ? t("menu.world.here", { zone: summary.zoneName }) : t("menu.world.nowhere")}
            </span>
          </button>

          <button type="button" className="menu-mode shardrun" onClick={showShardrun}>
            {shardrunArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${shardrunArt}")` }} aria-hidden="true" />}
            <span className="menu-mode-tag">{t("menu.shardrun.tag")}</span>
            <span className="menu-mode-name">{t("menu.shardrun.name")}</span>
            <span className="menu-mode-text">{t("menu.shardrun.text")}</span>
            <span className="menu-mode-status">
              {runInProgress
                ? t("menu.shardrun.running", {
                    layer: runInProgress.layer.name,
                    integrity: runInProgress.integrity,
                    max: runInProgress.integrityMax,
                  })
                : t("menu.shardrun.idle")}
            </span>
          </button>
          {dev && (
            <button type="button" className="menu-mode shardrun dev" onClick={showShardrun}>
              {shardrunArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${shardrunArt}")` }} aria-hidden="true" />}
              <span className="menu-mode-tag">{t("menu.dev.tag")}</span>
              <span className="menu-mode-name">{t("menu.dev.name")}</span>
              <span className="menu-mode-text">{t("menu.dev.text")}</span>
              <span className="menu-mode-status">{t("menu.dev.status")}</span>
            </button>
          )}
        </div>

        <div className="menu-extra">
          <button type="button" className="btn" onClick={showCodex}>
            {t("menu.codex")}
          </button>
          <LanguagePicker />
        </div>
      </div>
    </div>
  );
}
