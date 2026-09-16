import "../theme/menu.css";
import { useEffect } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";
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

        <section className="menu-character" aria-label="Your character">
          <div className="class-portrait">{portrait ? <img src={portrait} alt="" draggable={false} /> : <span aria-hidden="true">@</span>}</div>
          <div className="menu-character-info">
            <div className="class-name">{profile.name}</div>
            <div className="meta">
              {summary?.className ?? classCard?.name ?? profile.classId} · Maintainer v{summary?.version ?? "1.0.0"}
            </div>
            <div className="meta">{whereabouts(summary)}</div>
          </div>
          <button type="button" className="btn" onClick={switchProfile}>
            Switch character
          </button>
        </section>

        <div className="menu-modes">
          <button type="button" className="menu-mode" onClick={showWorld}>
            {worldArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${worldArt}")` }} aria-hidden="true" />}
            <span className="menu-mode-tag">Classic</span>
            <span className="menu-mode-name">The World</span>
            <span className="menu-mode-text">
              Walk the Bastion, take quests from its people, and fight Bit Rot with real programming problems. Every fight you win becomes
              mastery in your Chronicle.
            </span>
            <span className="menu-mode-status">{summary?.zoneName ? `You are in ${summary.zoneName}` : "You have not arrived yet"}</span>
          </button>

          <button type="button" className="menu-mode shardrun" onClick={showShardrun}>
            {shardrunArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${shardrunArt}")` }} aria-hidden="true" />}
            <span className="menu-mode-tag">Roguelite</span>
            <span className="menu-mode-name">Shardrun</span>
            <span className="menu-mode-text">
              Find shards of real code, chain them into spells, and climb three layers of the Machine in turn-based fights. Short runs, new
              every time.
            </span>
            <span className="menu-mode-status">
              {runInProgress
                ? `Run in progress: ${runInProgress.layer.name}, Integrity ${runInProgress.integrity}/${runInProgress.integrityMax}`
                : "No run in progress"}
            </span>
          </button>
          {dev && (
            <button type="button" className="menu-mode shardrun dev" onClick={showShardrun}>
              {shardrunArt && <span className="menu-mode-art" style={{ backgroundImage: `url("${shardrunArt}")` }} aria-hidden="true" />}
              <span className="menu-mode-tag">Sandbox</span>
              <span className="menu-mode-name">Shardrun (DEV)</span>
              <span className="menu-mode-text">
                The same mode with the shelves open: grant any shard or relic, add a spell, set Integrity and mana, spawn any fight, and jump
                between layers. Start one with the Sandbox buttons.
              </span>
              <span className="menu-mode-status">This server runs with ROOTWARD_DEV</span>
            </button>
          )}
        </div>

        <div className="menu-extra">
          <button type="button" className="btn" onClick={showCodex}>
            Shardrun Codex: every shard, relic, and foe
          </button>
        </div>
      </div>
    </div>
  );
}
