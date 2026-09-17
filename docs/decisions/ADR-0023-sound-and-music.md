# ADR-0023: Sound and music

- **Status:** accepted
- **Date:** 2026-09-17
- **Related:** ADR-0019 (the battle stage and its cue timeline), ADR-0021 (the layer map), `assets/README.md`,
  `scripts/audio/`

## Context

Until now the game has been silent. ADR-0019 noted that the battle timeline was "the natural place to hang" sound, since
every cue already knows what happened and when. The player asked for:

- background music and gameplay sounds, first as "simple bgm instrumentals and game play sounds";
- then "bgm soundtracks, along with an options menu to adjust the volume along with being able to possibly mute the
  sound";
- "Make sure the sound is able to be distinguished from the game sounds vs the bgm music";
- "The bgm should be fairly memorable but not too electronic or bubbly. Focus on thematic and extensive soundtracks
  where available."

The project's rules for assets still hold: every file is optional, generated or CC0, and nothing may depend on it.
The assets catalog also said audio should be "opt-in (settings toggle, default off)", which predates the player asking
for a soundtrack.

## Options considered

- **Where the music comes from.**
  - A CC0 music pack. It would be generic, the same across every place, and not thematic.
  - A music model on this machine's ComfyUI (chosen). ACE-Step 1.5 turbo is MIT-licensed (its ComfyUI repackage is
    Apache-2.0) and writes whole instrumental pieces from a description.
  - A hosted API. Not needed, and it would send prompts off the machine.
- **Where game sounds come from.** ACE-Step is a music model: it writes a fanfare or a lament well, but not a punch or
  a glass shatter. The CC0 Kenney packs already on disk have both.
- **How music loops.**
  - A short loop cut from each piece. The first try did this, and it throws most of an "extensive" piece away.
  - Playing the whole piece and restarting it. That leaves an audible seam and replays the ending.
  - The whole piece with loop points (chosen): the introduction plays once, then a body of whole phrases loops.
- **Defaults.** Off by default, as the catalog note said, or on at a moderate volume. The player asked for a
  soundtrack with a mute, and the browser keeps a page silent until its first click anyway.

## Decision

- **Two channels that meet only at the speakers.** Music and game sounds each have a volume and a mute, under a master
  volume and mute. The Web Audio graph (`apps/client/src/audio/engine.ts`) has a music bus and an effects bus. A volume
  is squared into a gain, so the slider follows loudness as the ear hears it.
- **One sound menu everywhere.** A *Sound* button sits on the title screen, the main menu, and the top bar of every
  other screen, and the same controls lead Shardrun's Options panel.
  - The settings are a per-browser preference (`rootward:sound`), read with zod and falling back to the defaults for
    anything unreadable.
  - Defaults: on, master 80%, music 60%, game sounds 80%.
- **Music follows the place, and places name it in content.**
  - A World zone names its `music`, and a Shardrun layer names `music`, `battle_music`, and `boss_music`. These travel
    through the views like `backdrop` and `ambience`.
  - Screens that are not places have themes in `audio/music.ts`: the title, menus and Codex play the main theme, and
    a fight in code plays a quiet one to think to.
  - What a screen asks for is a list, best first, and the engine plays the first track that has a file. A layer's own
    music comes before the Salvage's theme, a zone's before the Bastion's, and a guardian's before the guardian theme,
    then battle. A place whose piece was never made still gets music that suits it, instead of silence.
  - `MusicDirector` computes the track from the screen and hands it to the engine. Changing track crossfades over
    1.6 seconds.
  - A track left behind remembers where it was for four minutes, so returning from a fight picks the map's music up
    where it stopped.
  - A fight's music plays on while its last blow does.
- **Nine orchestral pieces, one per place, from `scripts/audio/generate.py`.**
  - The prompts ask for acoustic instruments only (orchestra, folk instruments, organ, choir), a memorable melody that
    returns, and song-like sections, over 150 to 180 seconds.
  - The pieces are the main theme, the Bastion, the Foundry, a study theme for fights in code, the Salvage, the Heap,
    the Kernel, battle, and guardian.
  - Cues: a victory fanfare, a defeat lament, and a treasure flourish.
  - The pipeline cuts loop points on bar lines from the requested tempo (which the model holds, measured) and writes
    them to `generated/audio/music.json`. It crossfades the last moments before the loop's end into the audio before
    its start, so the jump back is seamless.
  - Every file gets one fixed gain to a target loudness, since loudness normalizers that ride the level would break a
    loop's seam, and is encoded as Opus.
- **Game sounds from the battle timeline and from accepted choices.**
  - `audio/cues.ts` maps each stage cue to a sound (casts by element, hits by how hard they land, glances, wards,
    enemy blows, shatters, turns, a fight's end), and each accepted Shardrun command to one (rewards, forge work,
    rest, cards). A World fight's result gets one too: tests passing or failing, a win, a loss.
  - Map walks have footsteps, and a treasure room opens with a flourish.
  - A fanfare or a lament lowers the music while it plays.
  - The same sound twice within 35 ms is played once, so a volley of forty bolts does not roar.
  - The recorded sounds go through the same pipeline (a manifest entry with a `source`): trimmed, leveled by their
    loudest 100 ms, and encoded, so all game sounds sit at one level.
- **Optional, as ever.** An id without a file is silence, whether it is missing from `audio/catalog.ts` or not yet
  made, and nothing waits on sound. Audio starts on the first click or key press, the browser's rule, and rests while
  the tab is hidden.

## Consequences

- A soundtrack costs 8 to 11 minutes of GPU time per 150-second piece on this laptop, because llama.cpp holds a third
  of its memory. The first set is one take each; a take that does not suit is a new seed in the manifest and one render.
- **Made so far:** seven of the nine pieces (the main theme, the Bastion, the Foundry, the study theme, the Salvage, the
  Heap, and battle) and all sixteen game sounds. The batch was stopped before the Kernel's piece, the guardian theme,
  and the three cues, to reach a playable version first. Until they are rendered, the Kernel plays the Salvage's theme
  and guardians the battle theme (the lists above), and a fight's end and a treasure room have no cue.
  `scripts/audio/generate.py --only 'music-kernel,music-guardian,cue-*'` makes them.
- The model writes whole pieces with endings, and sometimes drops out mid-piece (the first main theme went silent for
  ten seconds). Loops come from the longest stretch of music between dropouts (three seconds or more under -55 dB,
  longer than a rest between phrases), so a piece that stops early or breaks loops a shorter body.
- A loop's end is the file's end, written to a tenth of a millisecond, so it can fall a few samples past the audio
  decoded. The engine clamps it to the buffer; refusing it would loop the introduction as well.
- A missing file is a 200 with the app's page (the server's fallback for deep links), so the engine decodes only
  responses that are audio.
- The catalog note "audio must be opt-in (default off)" is replaced by this decision.
- Not done: sounds in the World's map walking and dialogue, and per-layer battle music (every layer's fights share
  one battle theme, which content can change).
