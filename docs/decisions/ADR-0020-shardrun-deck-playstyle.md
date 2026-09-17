# ADR-0020: Shardrun (Experimental), a deck playstyle beside the spellbook

- **Status:** accepted (experimental: its numbers are a first guess, to be played and tuned)
- **Date:** 2026-09-17
- **Related:** ADR-0012 (Shardrun), ADR-0013 (layers, the code view, the dev sandbox), ADR-0015 (the work bill), ADR-0016
  (big numbers), ADR-0019 (the battle stage); `WIP.md` section 1 (the player's working notes)

## Context

In the spellbook playstyle a run builds its spells between fights and casts them in fights. Mana is plentiful (6 a turn
against starting spells of 2 each), and every spell casts once a turn, so a turn is "cast everything, end turn": the
decisions are all made at the workbench. The player likes that mode as it is, and asked for a second one rather than a
change to it:

> Instead of completely changing the current mode (honestly, I like this mode right now) I want to see if we can just
> add a different "playstyle" [...] where there is a card system, but instead of being bolt or ward, the cards would be
> the amplifications that you can add to the spell. Having 2 different spells [...] with a deck of 20-30 cards [...]
> that you can later add/subtract from. [...] this would just be a different game mode that (for now) uses the same
> exact tower system.

It replaces the menu's Shardrun (DEV) card, which the start screen had made redundant: its *Sandbox in …* buttons
start a sandbox run from either card.

## Options considered

**The turn.**

1. **Change the spellbook's turn** (a hand of spells, scarcer mana). Rejected: the player likes that mode.
2. **A second playstyle whose cards are whole spells.** Spells would still be built at a workbench, so the per-turn
   decision is only which prebuilt spell to cast.
3. **A second playstyle whose cards are shards, played every turn into blank spells.** Building the spell becomes the
   turn's decision, and building it is the programming: the order cards are played in is the pipeline's order, so
   Fork → Amplify is not Amplify → Fork.

Option 3. It also costs the least for what it changes: a spell is already an ordered list of shards, so the sandbox
harness, the previews, the work bill, the code view, the effects stage, the foes, the map, and the relics carry over
untouched. What changes is *when* the list is built.

**The run slot.** Shardrun kept one run in progress per character. Sharing that slot would make the Experimental card
open (or be blocked by) a spellbook run. One run in progress per playstyle lets a player try the experiment without
ending the run they care about.

## Decision

**Rules** (`packages/core/src/shardrun/engine.ts`, `types.ts`).

- A run has a `playstyle`, `spellbook` or `deck`. Saved runs have none and load as spellbook runs (a schema default).
- A deck run starts with the content's blank spells and its cards in `deck`; its inventory stays empty.
- A fight shuffles the whole deck into `battle.draw` and draws `hand_size` cards into `battle.hand`. The shuffle draws
  from the run's seed and the command's revision, so the same state always deals the same hand.
- `compose` moves cards between the hand and the spells: in any order, up to each spell's capacity, and never into a
  spell already cast this turn. Like `arrange`, it may move cards but never create or destroy one: the multiset of
  hand and spell cards before and after must match.
- A cast spends its spell's cards onto `battle.discard` and leaves the spell blank. A blank spell still casts one plain
  bolt for the base cost, so a bad hand is never a dead turn.
- Ending a turn discards the hand and every uncast card, then draws a new hand; an empty draw pile is replaced by the
  shuffled discard pile. Every card of the deck is always in exactly one pile or one spell.
- A won card joins the deck. A forge can rework a card in the deck, melt one down (`purge`, never below `min_cards`),
  widen a spell, or bind a new one. `arrange` is refused: a deck run has no workbench.
- A deck run has its own income, `deck.mana_per_turn`. Relics, foes, rewards, rests and layers are shared.
- Dev tools grant a card into the deck, and during a fight into the hand too, so it can be tried at once.

**Content and balance** (data, per AGENT.md). `shardrun/run.yaml` names the blank spells and the starting cards under
`deck`; `config/balance.yaml` sets `shardrun.deck.hand_size` (5), `mana_per_turn` (4, +1 per layer) and `min_cards`
(5). The first deck is Amplify ×4, Ward ×4, Fork ×2, Kindle and Chill, played into Left Hand and Right Hand (3 slots
each): four Wards keep a bad hand survivable, and the two elements answer the first layer's weaknesses. With 4 mana
and two 3-card spells costing about 2 each, a turn can usually cast both; the squeeze is meant to come from what the
hand holds and from rarer, costlier cards. These numbers are a starting point, not a result.

**Server.** Migration 0005 gives `shardrun_runs` a `playstyle` column (every existing run is a spellbook run), and the
service looks up the run in progress by character and playstyle. Routes take `?playstyle=deck` (the spellbook when
absent); `start` takes `playstyle` in its body. Views add `playstyle`, `deck`, the battle's `hand`, `drawPile` and
`discardPile` (counts only: the draw order stays hidden), `forge.purge`, the deck's rules, and the shards a cast ran
(`replay.shards`), since a deck run's spell is blank again by the time its cast plays as code. The status response
lists the `playstyles` the content offers.

**Client.** The main menu's **Shardrun (Experimental)** card replaces **Shardrun (DEV)**; each Shardrun card shows its
own run and opens the Shardrun screen for its playstyle (the store's `playstyle`, passed on every call). In a fight the
hand sits under the spells, between the draw and discard piles (`Hand.tsx`): a click plays a card into the targeted
spell (the first with room, or the one picked with *play here*), a drag drops it into a slot, and a click on a played
card takes it back. A cast spell says its cards are in the discard pile. Between fights `DeckPanel.tsx` lists the deck
with counts and the code of the card looked at; the reward, rest and forge panels speak of cards, and the forge offers
*Melt a card down*. The smoke test plays a deck turn in the browser.

## Consequences

- Two playstyles share the tower, the foes, the relics, the sandbox and the presentation. A change to any of those
  reaches both, which is the point, and a balance change for one can unbalance the other: the deck has its own knobs
  for the numbers that matter most to it.
- Previews run again for every arrangement a player tries. Runs are cached by their exact input, so trying an
  arrangement twice is free, but the sandbox does more work per turn than in a spellbook run.
- A deck run's spell names become function names in the code view (`cast_left_hand`), like any spell's.
- Relics are not deck-aware yet: the Second Grimoire and a guardian's spell simply add another blank spell. Deck relics
  (draw more, keep a card between turns, a card that draws another) are the obvious next content.
- It is not balanced by play yet. Whether a deck keeps up with the tower's compounding foe HP (×1, ×2.6, ×6.8) is an
  open question for playtests and for headless balance runs.
