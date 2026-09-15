import type { ProfileSummaryView, ProfileView } from "@rootward/shared";
import { useState } from "react";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { useGame } from "../state/store.ts";
import { Ambience } from "../world/Ambience.tsx";
import { orderProfiles, whereabouts } from "./title.ts";

/**
 * The opening screen: continue a character where they left off, or begin a new Maintainer (ADR-0010). Every piece of
 * art on it is optional; without the backdrop, emblem, or wanderer it falls back to a gradient and plain type.
 */
export function TitleScreen() {
  const profiles = useGame((s) => s.profiles);
  const summaries = useGame((s) => s.profileSummaries);
  const startingClass = useGame((s) => s.startingClass);
  const lastProfileId = useGame((s) => s.lastProfileId);
  const selectProfile = useGame((s) => s.selectProfile);
  const createProfile = useGame((s) => s.createProfile);
  const busy = useGame((s) => s.busy);
  const [name, setName] = useState("");

  const ordered = orderProfiles(profiles, lastProfileId);
  const backdrop = assetUrl("backgrounds", "title");
  const emblem = assetUrl("brand", "emblem");
  const wanderer = assetUrl("brand", "wanderer");
  const classPortrait = startingClass ? assetUrl("portraits", startingClass.id) : undefined;

  const submit = () => {
    if (!name.trim() || busy !== undefined) return;
    void createProfile(name);
    setName("");
  };

  return (
    <div className="title-screen">
      <div className="title-backdrop" style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined} aria-hidden="true" />
      <Ambience kind="embers" />
      {wanderer && <img className="title-wanderer" src={wanderer} alt="" draggable={false} />}

      <div className="title-layout">
        <header className="title-logo">
          {emblem && <img className="title-emblem" src={emblem} alt="" draggable={false} />}
          <h1>ROOTWARD</h1>
          <p className="title-tagline">Bit Rot is eating the Machine. Mend it with real code.</p>
        </header>

        <div className="title-panels">
          {ordered.length > 0 && (
            <section className="title-panel" aria-labelledby="characters-title">
              <h2 id="characters-title">Continue</h2>
              <ul className="character-list">
                {ordered.map((profile) => (
                  <CharacterCard
                    key={profile.id}
                    profile={profile}
                    summary={summaries[profile.id]}
                    latest={profile.id === lastProfileId}
                    disabled={busy !== undefined}
                    onPick={() => {
                      selectProfile(profile);
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          <section className="title-panel" aria-labelledby="new-character-title">
            <h2 id="new-character-title">{ordered.length > 0 ? "A new Maintainer" : "Begin"}</h2>
            {startingClass && (
              <div className="class-card">
                <div className="class-portrait">
                  {classPortrait ? <img src={classPortrait} alt="" draggable={false} /> : <span aria-hidden="true">{startingClass.name.slice(0, 1)}</span>}
                </div>
                <div>
                  <div className="class-name">{startingClass.name}</div>
                  <div className="meta">{startingClass.discipline}</div>
                  <p className="narr">{startingClass.tagline}</p>
                </div>
              </div>
            )}
            <div className="actions">
              <input
                type="text"
                className="text-input"
                placeholder="Character name"
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                aria-label="Character name"
              />
              <button type="button" className="btn primary" disabled={!name.trim() || busy !== undefined} onClick={submit}>
                Begin
              </button>
            </div>
          </section>
        </div>

        <footer className="title-foot">Everything runs on this machine: code in sandboxes, progress saved as you play, no telemetry.</footer>
      </div>
    </div>
  );
}

interface CharacterCardProps {
  profile: ProfileView;
  summary: ProfileSummaryView | undefined;
  latest: boolean;
  disabled: boolean;
  onPick: () => void;
}

function CharacterCard({ profile, summary, latest, disabled, onPick }: CharacterCardProps) {
  const avatar = assetUrl("avatars", slugify(profile.classId));
  return (
    <li>
      <button type="button" className={latest ? "character-card latest" : "character-card"} disabled={disabled} onClick={onPick}>
        <span className="character-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" draggable={false} /> : "@"}
        </span>
        <span className="character-info">
          <span className="character-name">
            {profile.name}
            {latest && <small>last played</small>}
          </span>
          {summary && (
            <span className="meta">
              {summary.className} · Maintainer v{summary.version}
            </span>
          )}
          <span className="meta">{whereabouts(summary)}</span>
        </span>
        <span className="character-go" aria-hidden="true">
          ▸
        </span>
      </button>
    </li>
  );
}
