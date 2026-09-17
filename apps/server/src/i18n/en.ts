// The server's message catalog (ADR-0018): the prose the server composes while building a view, as opposed to the
// prose that comes from `content/` (translated by overlay) or belongs to a screen (translated in the browser).
//
// A sentence lands here when it is assembled from content plus numbers — "Strike for 14", "Bolts under 4 power
// glance off" — because there is no English string in any file for a content overlay to match. English defines the
// keys, exactly as on the client; `MessageKey` is derived from this object.

export const en = {
  // A foe's next move, shown on its card.
  "intent.strike": "Strike for {power}",
  "intent.multi": "Strike {times} times for {power}",
  "intent.shield": "Shield {amount}",
  "intent.stoke": "Stoke: its next strike doubles",
  "intent.heal": "Heal {amount}",
  "intent.watching": "Watching",

  // The Codex: where a shard or relic is found.
  "found.fights": "fights",
  "found.elites": "elites",
  "found.guardians": "guardians",
  "found.treasure": "treasure rooms",
  "found.forge.upgrade": "upgrading {shard} at a forge",
  "found.forge.repair": "repairing {shard} at a forge",
  "found.startingSpell": "the {spell} spell you start with",
  "found.startingSpares": "your starting spare shards",

  // Rules a foe bends.
  "trait.nullify.name": "Nullify",
  "trait.nullify.text": "The first bolt that hits it each turn does nothing.",
  "trait.thickHide.name": "Thick hide",
  "trait.thickHide.text": "Bolts under {threshold} power glance off.",
  "trait.shifting.name": "Shifting",
  "trait.shifting.text": "Its weakness moves each turn: {cycle}.",
  "trait.patternWard.name": "Pattern ward",
  "trait.patternWard.text": "Only this turn's element in {pattern} hits at full strength.",

  // How a cast's work becomes mana.
  "workCurve.log": "its logarithm",
  "workCurve.sqrt": "its square root",
  "workCurve.linear": "all of it",

  // The Stats panel: every rule the run plays by, and what changed it.
  "modifier.manaPerTurn": "Mana each turn",
  "modifier.boltCap": "Bolts that land",
  "modifier.workBilling": "Work billed as",
  "modifier.boltPower": "Power added to every bolt",
  "modifier.boltMult": "Multiplier added to every bolt",
  "modifier.boltMultFactor": "Every bolt's multiplier is then times",
  "modifier.damageMultiplier": "Damage multiplier",
  "modifier.weakMultiplier": "Weakness multiplier",
  "modifier.turnBlock": "Block at the start of a turn",
  "modifier.firstCastDiscount": "First cast each turn costs less",
  "modifier.healAfterFight": "Integrity healed after a fight",
  "modifier.maxIntegrity": "Maximum Integrity",
  "modifier.spellCapacity": "Slots added to every spell",
  "modifier.handSize": "Cards drawn each turn",
  "modifier.hold": "Cards held into the next turn",
  "modifier.from.layer": "layer {layer}",
} as const;

/** Every key the server can ask for. Other locales are typed against it. */
export type MessageKey = keyof typeof en;
