# Scripted combat: writing your own attacks

- **Status:** brainstorm (2026-09-15). Nothing here is decided; an ADR follows once a direction is chosen.
- **Related:** PROMPT.md section 7 (combat today), ADR-0004 (encounter rules), `ideas/game-content/mechanics-backlog.md`
  ("Automation realm", "Reverse fight", "Spell fusion")

## The problem

Today a fight is a task: the tests are the enemy's HP, and solving the task kills it. That teaches well, but the code
is the lock, not the weapon. The player asked for the opposite: code as the attack, scripting as the main gameplay
loop, without it being "programmer lingo" dressed as a fight, and without the obvious way to break it (an infinite loop,
`damage = 10**9`, spamming the one best move).

## The rule that makes it safe: code decides, the engine resolves

A script never produces a number that matters. It looks at the battle and returns **intents** ("strike the unshielded
one with frost", "raise a ward"). The engine, outside the sandbox, checks each intent against the rules and a budget and
resolves it deterministically. This is the same split the engine already uses for runs (`decide` returns events,
`evolve` applies them): the player's code is just a smarter source of commands.

So power can only come from **decisions**: which target, when to defend, which element, how to read what the enemy is
about to do, what to remember between turns. That is exactly where programming concepts live.

| Degenerate script | What happens | What it teaches |
|---|---|---|
| An infinite loop | The spell overruns its channel (the sandbox already interrupts at a deadline): it **fizzles**, the turn is lost, small backlash | Termination |
| `return [strike(foe)] * 1_000_000` | Only as many intents run as the turn's Action Points pay for | Budgets |
| Hardcoding a winning sequence | Casting runs several hidden, seeded variants of the battle; all must be won | Overfitting vs. tests |
| Spamming the strongest move | Enemies adapt: an identical action repeated stacks resistance | Adaptive logic |
| Building a huge structure | Memory cap ("arcane burden"): fizzle | Space complexity |
| Crashing on a missing value | The spell fails that turn, nothing else | Defensive code |
| Reading hidden enemy state | The script only receives the `battle` view; `scan()` reveals more and costs Action Points | Information has a cost |

## Ideas for the modes

### 1. Spellwright duels (candidate for the main loop)

You write a battle policy, `turn(battle)`, before the fight. The fight then plays out turn by turn with your function
choosing each turn's actions, and you watch the replay. When it goes wrong you see exactly which turn and why, edit, and
go again. **Probe** fights a training dummy on the visible variants; **Cast** is the real fight on hidden seeds and costs
Focus, just like today. Prior art: Final Fantasy XII's gambits, Gladiabots, Screeps, Robocode, Noita's wand building,
but in real Python or JavaScript.

A Foundry-level spell:

```python
def turn(battle):
    me, foes = battle.me, battle.foes
    # The Kiln Warden telegraphs its blast; a frost ward halves it.
    if any(foe.intent == "stoking" for foe in foes) and me.focus >= 2:
        return [ward("frost")]
    # Otherwise hit the weakest foe that isn't shielded, with the rune it is weak to.
    open_foes = [foe for foe in foes if not foe.shielded] or foes
    target = min(open_foes, key=lambda foe: foe.hp)
    return [strike(target, rune=target.weakness)]
```

Enemies are designed around one concept each, so beating them *is* the lesson:

- **Off-By-One Goblin:** its ward breaks only on exactly the third hit in a row; a loop that stops one short never
  breaks it, one that goes one over wastes a turn into its counter.
- **Null Wraith:** on its turns, some fields of `battle` come back empty (`None`); an unguarded spell fizzles.
- **Type Mimic:** its HP sometimes arrives as the string `"12"`; comparisons quietly misbehave until you convert.
- **Regex Sphinx:** announces its next attack as a riddle string; parse it to raise the right ward.
- **Tally Wisp:** splits into many wisps with ids; you need a dictionary to track which ones you have already weakened.
- **Kiln Warden (boss):** phases. A small `battle.memory` dictionary survives between turns, so the winning spell is a
  state machine.

### 2. The Spellbook: your library is your power

Functions you prove in ordinary challenge fights become **Spells**, importable in duels (`from spellbook import
weakest`). The Compiler (Brannoc) only admits a function with tests that pass, his and yours. You get stronger because
your own standard library grows, and the growth is honest: you already had to prove every piece. This is the Forge the
spec describes, given a job.

### 3. Language features as runes

The static scanner that already enforces banned tokens becomes progression. A new Maintainer's spells may only use
conditionals; loops unlock at mastery 2 on loops, dictionaries later, recursion later. New power arrives exactly when a
concept is learned, and the curriculum sets the pace instead of grinding.

### 4. Trials stay

Today's challenge fights remain the place where concepts are learned (and where runes and spells are earned). Duels are
where you use what you learned. That keeps the pedagogy honest and the planner useful.

### 5. Other shapes for other realms

- **Hexes (Oracle class):** write tests as attacks against an enemy's buggy implementation; each distinct bug exposed is
  a hit. Damage is capped by how many bugs exist, so it can never be infinite (mutation testing).
- **Shell duels (Kernel Halls):** each turn is one pipeline against the enemy's filesystem; damage is what it matches.
- **Targeting queries (the Archives):** your targeting rule is a SQL query over the battlefield table.

## Keeping balance sane

- **Action Points per turn** (say 3) and **Focus per battle**; every verb has a cost and overkill is wasted. All numbers
  in `config/balance.yaml`.
- **A visible channel meter:** "your spell used 40% of its channel". Efficient code leaves room for reactions, but
  never deals damage by itself.
- **Seeded variants:** a Cast runs several hidden battles; the result is the worst one. Deterministic replays mean every
  loss can be reproduced exactly.
- **Adaptation:** stacking resistance to repeated identical actions.
- **Validation in content:** every duel enemy ships with a reference spell proving it can be beaten, and a *cheese
  suite* (infinite loop, a million actions, a hardcoded sequence, always-strike) that must lose. `pnpm content:validate`
  runs both.

## What building it would take

- A pure, seeded battle simulator in `packages/core`: state, verbs, enemy behaviours, resolution into events.
- A turn protocol in the runners: one long-lived sandbox per battle; each turn the engine sends the `battle` view as JSON
  and the script answers with intents, under a per-turn interrupt budget. QuickJS supports this directly; Python fits
  the existing child-process protocol.
- A small battle library per language (`battle.me`, `strike`, `ward`, `scan`) with in-game docs.
- A replay viewer: the world renderer can draw an arena with the existing creature sprites.
- A content kind for duels: behaviours as YAML verbs, variants, the reference spell, the cheese suite.

## A first slice worth prototyping

Sergeant Assert's training dummy in the Testing Grounds: three verbs (`strike`, `ward`, `focus`), one enemy behaviour (a
telegraphed heavy blow), Python and JavaScript, a text replay before any animation, five hidden seeds. If it is fun,
give the Off-By-One Goblin a duel variant next.

## Open questions

- Do duels become the main combat everywhere, or a second fight type alongside Trials?
- Replays that play out on their own, or a step-through debugger you walk turn by turn?
- Numbers on screen (damage, resistances), or narrative only with numbers on hover?
