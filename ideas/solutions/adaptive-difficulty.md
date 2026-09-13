# Adaptive difficulty implementation

See `ideas/pedagogy/assessment-and-difficulty.md` for the models; this is the implementation sketch.

## Data
```ts
interface NodeSkill { nodeId: string; rating: number; /* Elo, start 1000 */ attempts: number; lastSeen: string; mastery: 0|1|2|3|4|5; rotting: boolean }
interface ChallengeMeta { id: string; rating: number; /* 1000 + 100*(difficulty-5) */ concepts: string[]; lastSeenAt?: string }
```

## Selection
```
candidates = pool.filter(c => c.concepts includes node && !seenRecently(c) && runnerAvailable(c))
score(c) = -|P(success | Rp, Rc) - target| + oathBonus(c) + varietyBonus(c) + reviewBonus(c)
pick argmax; tie-break by least recently seen; log the score breakdown into the plan rationale
```
`P = 1 / (1 + 10^((Rc - Rp)/400))`; target = 0.75 (frontier), 0.9 (review), 0.55 (Elite).

## Update after an encounter
```
actual = unaided ? 1 : assisted ? 0.6 : retreat ? 0 : 0
K = tier <= 1 ? 32 : 24
Rp += clamp(K * (actual - P), -40, +40)
```
Puzzles: K/3. Bosses: apply to each concept with K/2. Do not update challenge ratings (population of one); allow the
author to recalibrate `difficulty` using the coverage/stats tool that shows realized success per challenge.

## Streak safety valves
Two consecutive failures on frontier -> next frontier pick uses target 0.85 and inserts a Shrine/Parsons; two
consecutive crits -> target 0.65 and offer an Elite branch.

## Cold start
Placement puzzles set `rating` per realm (600-1400). Users can also set a slider per realm in the Guild Hall.

## Explainability
The plan rationale is shown on request: "Chose *Tally Wisp* (difficulty 3) for `py.collections.dict` because your
rating there is 980 and this gives ~74% success. Review slot: `sh.permissions` is due (retrievability 0.62)."

## Simulation test
`scripts/simulate-learner.ts`: synthetic learner with hidden true ratings and noise; run 200 planned dungeons; assert
realized success in [0.65, 0.85] after warm-up and mastery levels monotone in true skill.
