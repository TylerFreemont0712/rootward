import "../theme/menu.css";
import type { ShardrunPlaystyleView, ShardrunView } from "@rootward/shared";
import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import { assetUrl } from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { LanguagePicker } from "../i18n/LanguagePicker.tsx";
import { useShardrun } from "../state/shardrun.ts";
import { useGame } from "../state/store.ts";
import { Ambience } from "../world/Ambience.tsx";
import { whereabouts } from "./title.ts";

const ENDED = new Set(["won", "lost", "abandoned"]);

interface ShardrunDoors {
  spellbook: ShardrunView | null;
  deck: ShardrunView | null;
  playstyles: ShardrunPlaystyleView[];
}

/**
 * The main menu for the chosen character: one door into each mode. The World is the classic game (a town, quests, and
 * fights that are programming problems); Shardrun is the roguelite, and Shardrun (Experimental) the same climb played
 * with a deck of cards (ADR-0020). Only the mode you pick runs.
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
  const choosePlaystyle = useShardrun((s) => s.choosePlaystyle);
  const profileId = profile?.id;
  const t = useT();
  // Each Shardrun door shows its own run (a character keeps one of each), so the menu asks about both.
  const [doors, setDoors] = useState<{ profileId: string; doors: ShardrunDoors } | undefined>();

  useEffect(() => {
    if (profileId === undefined) return;
    void loadProfiles();
    let cancelled = false;
    Promise.all([api.shardrun(profileId, "spellbook"), api.shardrun(profileId, "deck")])
      .then(([spellbook, deck]) => {
        if (!cancelled) setDoors({ profileId, doors: { spellbook: spellbook.run, deck: deck.run, playstyles: spellbook.playstyles } });
      })
      .catch((error: unknown) => {
        // The doors still open without a status line; the Shardrun screen reports the error properly when entered.
        console.warn("Shardrun status is unavailable", error);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, loadProfiles]);

  if (!profile) return null;
  const summary = summaries[profile.id];
  const classCard = classes.find((candidate) => candidate.id === profile.classId);
  const portrait = assetUrl("portraits", profile.classId);
  const backdrop = assetUrl("backgrounds", "title");
  const worldArt = assetUrl("backgrounds", "title");
  const shardrunArt = assetUrl("backgrounds", "arena-salvage") ?? assetUrl("backgrounds", "salvage");
  const experimentalArt = assetUrl("backgrounds", "arena-heap") ?? shardrunArt;
  const emblem = assetUrl("brand", "emblem");
  const known = doors?.profileId === profile.id ? doors.doors : undefined;
  const status = (run: ShardrunView | null | undefined) =>
    run && !ENDED.has(run.status)
      ? t("menu.shardrun.running", { layer: run.layer.name, integrity: run.integrity, max: run.integrityMax })
      : t("menu.shardrun.idle");
  const open = (playstyle: ShardrunPlaystyleView) => {
    choosePlaystyle(playstyle);
    showShardrun();
  };

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

          <button
            type="button"
            className="menu-mode shardrun"
            onClick={() => {
              open("spellbook");
            }}
          >
            {shardrunArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${shardrunArt}")` }} aria-hidden="true" />}
            <span className="menu-mode-tag">{t("menu.shardrun.tag")}</span>
            <span className="menu-mode-name">{t("menu.shardrun.name")}</span>
            <span className="menu-mode-text">{t("menu.shardrun.text")}</span>
            <span className="menu-mode-status">{status(known?.spellbook)}</span>
          </button>
          {/* Shown until the server says otherwise: a pack without a deck playstyle hides it. */}
          {(known?.playstyles.includes("deck") ?? true) && (
            <button
              type="button"
              className="menu-mode shardrun experimental"
              onClick={() => {
                open("deck");
              }}
            >
              {experimentalArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${experimentalArt}")` }} aria-hidden="true" />}
              <span className="menu-mode-tag">{t("menu.experimental.tag")}</span>
              <span className="menu-mode-name">{t("menu.experimental.name")}</span>
              <span className="menu-mode-text">{t("menu.experimental.text")}</span>
              <span className="menu-mode-status">{status(known?.deck)}</span>
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
