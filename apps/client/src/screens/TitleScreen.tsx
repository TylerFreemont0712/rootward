import "../theme/menu.css";
import type { ProfileSummaryView, ProfileView } from "@rootward/shared";
import { useState } from "react";
import { assetUrl, slugify } from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { LanguagePicker } from "../i18n/LanguagePicker.tsx";
import { useGame } from "../state/store.ts";
import { Ambience } from "../world/Ambience.tsx";
import { orderProfiles, whereabouts } from "./title.ts";

/**
 * The opening screen: continue a character where they left off, or begin a new Maintainer of a chosen class (ADR-0010).
 * Planned classes are shown so the road ahead is visible, but only playable ones can be picked. Every piece of art on it
 * is optional; without the backdrop, emblem, or portraits it falls back to a gradient, letters, and plain type.
 *
 * It carries the language picker (ADR-0017) because it is the first screen: someone who reads Japanese should not have
 * to cross an English screen to find the switch. Class names, disciplines and taglines stay in whatever language the
 * content pack is written in, since content localization belongs to the server and is not built yet.
 */
export function TitleScreen() {
  const profiles = useGame((s) => s.profiles);
  const summaries = useGame((s) => s.profileSummaries);
  const startingClass = useGame((s) => s.startingClass);
  const classes = useGame((s) => s.classes);
  const lastProfileId = useGame((s) => s.lastProfileId);
  const selectProfile = useGame((s) => s.selectProfile);
  const createProfile = useGame((s) => s.createProfile);
  const busy = useGame((s) => s.busy);
  const [name, setName] = useState("");
  const [pickedClass, setPickedClass] = useState<string | undefined>();
  const t = useT();

  const ordered = orderProfiles(profiles, lastProfileId);
  const backdrop = assetUrl("backgrounds", "title");
  const emblem = assetUrl("brand", "emblem");
  const wanderer = assetUrl("brand", "wanderer");
  const classId = pickedClass ?? startingClass?.id ?? classes.find((candidate) => candidate.playable)?.id;
  const chosen = classes.find((candidate) => candidate.id === classId);
  const chosenPortrait = chosen ? assetUrl("portraits", chosen.id) : undefined;

  const submit = () => {
    if (!name.trim() || busy !== undefined || classId === undefined) return;
    void createProfile(name, classId);
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
          <p className="title-tagline">{t("title.tagline")}</p>
        </header>

        <div className="title-panels">
          {ordered.length > 0 && (
            <section className="title-panel" aria-labelledby="characters-title">
              <h2 id="characters-title">{t("title.continue")}</h2>
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
            <h2 id="new-character-title">{t(ordered.length > 0 ? "title.newMaintainer" : "title.begin")}</h2>
            {classes.length > 0 && (
              <div className="class-picker" role="radiogroup" aria-label={t("title.class")}>
                {classes.map((option) => {
                  const portrait = assetUrl("portraits", option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={option.id === classId}
                      disabled={!option.playable}
                      title={
                        option.playable ? option.tagline : t("title.plannedHint", { name: option.name, discipline: option.discipline })
                      }
                      className={option.id === classId ? "class-option chosen" : "class-option"}
                      onClick={() => {
                        setPickedClass(option.id);
                      }}
                    >
                      {portrait ? <img src={portrait} alt="" draggable={false} /> : <span className="glyph">{option.name.slice(0, 1)}</span>}
                      <span>{option.name}</span>
                      <small>{t(option.playable ? "title.playable" : "title.comingLater")}</small>
                    </button>
                  );
                })}
              </div>
            )}
            {chosen && (
              <div className="class-card">
                <div className="class-portrait">
                  {chosenPortrait ? <img src={chosenPortrait} alt="" draggable={false} /> : <span aria-hidden="true">{chosen.name.slice(0, 1)}</span>}
                </div>
                <div>
                  <div className="class-name">{chosen.name}</div>
                  <div className="meta">{chosen.discipline}</div>
                  <p className="narr">{chosen.tagline}</p>
                  {chosen.subjects.length > 0 && (
                    <div className="class-subjects">
                      {chosen.subjects.map((subject) => (
                        <span key={subject}>{subject}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="actions">
              <input
                type="text"
                className="text-input"
                placeholder={t("title.name")}
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                aria-label={t("title.name")}
              />
              <button type="button" className="btn primary" disabled={!name.trim() || busy !== undefined || classId === undefined} onClick={submit}>
                {t("title.start")}
              </button>
            </div>
          </section>
        </div>

        <footer className="title-foot">
          <span>{t("title.foot")}</span>
          <LanguagePicker />
        </footer>
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
  const t = useT();
  return (
    <li>
      <button type="button" className={latest ? "character-card latest" : "character-card"} disabled={disabled} onClick={onPick}>
        <span className="character-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" draggable={false} /> : "@"}
        </span>
        <span className="character-info">
          <span className="character-name">
            {profile.name}
            {latest && <small>{t("title.lastPlayed")}</small>}
          </span>
          {summary && (
            <span className="meta">
              {summary.className} · {t("menu.version", { version: summary.version })}
            </span>
          )}
          <span className="meta">{whereabouts(summary, t)}</span>
        </span>
        <span className="character-go" aria-hidden="true">
          ▸
        </span>
      </button>
    </li>
  );
}
