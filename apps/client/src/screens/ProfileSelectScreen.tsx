import { useState } from "react";
import { useGame } from "../state/store.ts";

/** Which character to play as (ADR-0010): its own runs and mastery, independent of every other character. */
export function ProfileSelectScreen() {
  const profiles = useGame((s) => s.profiles);
  const selectProfile = useGame((s) => s.selectProfile);
  const createProfile = useGame((s) => s.createProfile);
  const busy = useGame((s) => s.busy);
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim() || busy !== undefined) return;
    void createProfile(name);
    setName("");
  };

  return (
    <div className="select">
      <header className="hero">
        <h1>WHO IS PLAYING?</h1>
        <p className="narr">Each character keeps its own Chronicle and its own progress through the Machine.</p>
      </header>

      {profiles.length > 0 && (
        <section className="block card wide" aria-labelledby="characters-title">
          <h2 id="characters-title">Characters</h2>
          <ul className="floors">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== undefined}
                  onClick={() => {
                    selectProfile(profile);
                  }}
                >
                  {profile.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block card wide" aria-labelledby="new-character-title">
        <h2 id="new-character-title">New character</h2>
        <div className="actions spaced">
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
  );
}
