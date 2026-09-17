// The English message catalog (ADR-0017). English is the project's source language, so this file is the definition:
// a key exists because it is here, and `MessageKey` is derived from it, which makes a typo in any other locale a type
// error. Values may contain `{name}` placeholders, filled by `t()`.
//
// Keys are `screen.thing`, lowercase and dotted. Keep them about *where the string is*, not about what it says, so a
// reworded string keeps its key and its translations.

export const en = {
  "language.label": "Language",

  "menu.character": "Your character",
  "menu.version": "Maintainer v{version}",
  "menu.switch": "Switch character",
  "menu.world.tag": "Classic",
  "menu.world.name": "The World",
  "menu.world.text":
    "Walk the Bastion, take quests from its people, and fight Bit Rot with real programming problems. Every fight you win becomes mastery in your Chronicle.",
  "menu.world.here": "You are in {zone}",
  "menu.world.nowhere": "You have not arrived yet",
  "menu.shardrun.tag": "Roguelite",
  "menu.shardrun.name": "Shardrun",
  "menu.shardrun.text":
    "Find shards of real code, chain them into spells, and climb three layers of the Machine in turn-based fights. Short runs, new every time.",
  "menu.shardrun.running": "Run in progress: {layer}, Integrity {integrity}/{max}",
  "menu.shardrun.idle": "No run in progress",
  "menu.experimental.tag": "Experimental",
  "menu.experimental.name": "Shardrun (Experimental)",
  "menu.experimental.text":
    "The same climb, played with cards. Your shards are a deck: every turn, draw a hand and build two spells from it, card by card, in the order they should run.",
  "menu.codex": "Shardrun Codex: every shard, relic, and foe",

  "title.tagline": "Bit Rot is eating the Machine. Mend it with real code.",
  "title.continue": "Continue",
  "title.newMaintainer": "A new Maintainer",
  "title.begin": "Begin",
  "title.start": "Begin",
  "title.class": "Class",
  "title.playable": "playable",
  "title.comingLater": "coming later",
  "title.plannedHint": "{name}: {discipline}. Coming later.",
  "title.name": "Character name",
  "title.lastPlayed": "last played",
  "title.foot": "Everything runs on this machine: code in sandboxes, progress saved as you play, no telemetry.",

  "title.fights.one": "{count} fight",
  "title.fights.many": "{count} fights",
  "title.quests.none": "no quests under way",
  "title.quests.one": "{count} quest under way",
  "title.quests.many": "{count} quests under way",
  "title.notArrived": "{fights} · has not arrived in the Bastion yet",
  "title.where": "In {zone} · {quests} · {fights}",

  "stats.title": "Stats",
  "stats.rules": "The rules you play by",
  "stats.was": "was {value}",
  "stats.run": "This run",
  "stats.damageBySpell": "Damage by spell",
  "stats.nothingYet": "Nothing has landed yet.",
  "stats.layers": "Layers cleared",
  "stats.fights": "Fights",
  "stats.turns": "Turns",
  "stats.casts": "Casts",
  "stats.damage": "Damage dealt",
  "stats.bestCast": "Biggest cast",
  "stats.bolts": "Bolts fired",
  "stats.fizzled": "Bolts fizzled",
  "stats.manaSpent": "Mana spent",
  "stats.shards": "Shards salvaged",
  "stats.relics": "Relics claimed",

  "battle.integrity": "Integrity",
  "battle.block": "{amount} block",
  "battle.blockHint": "Block soaks enemy hits until your next turn",
  "battle.mana": "{mana}/{max} mana",
  "battle.turn": "Turn {turn}",
  "battle.kind.fight": "fight",
  "battle.kind.elite": "elite",
  "battle.kind.boss": "guardian",
  "battle.endTurn": "End turn",
  "battle.log": "Battle log",
  "battle.guardian": "Guardian of {layer}",
  "battle.intentHint": "What it will do when you end your turn",

  "fx.weak": "WEAK",
  "fx.resist": "resisted",
  "fx.nullified": "nullified",
  "fx.glanced": "glanced off",
  "fx.blocked": "{amount} blocked",
  "fx.block": "+{amount} block",
  "fx.shield": "+{amount} shield",
  "fx.stoked": "stoked!",
  "fx.fizzle": "fizzle",
  "fx.hits.one": "{count} hit",
  "fx.hits.many": "{count} hits",

  "options.shake": "Shake the stage on heavy hits",
  "options.on": "On",
  "options.off": "Off",
} as const;

/** Every key the game can ask for. Other locales are typed against it, so a stale key cannot go unnoticed. */
export type MessageKey = keyof typeof en;
