# Learning science behind the mechanics

Each finding below is paired with the mechanic that implements it. When adding a mechanic, ask which finding it
serves; when a finding has no mechanic, that is a backlog item.

| Finding | What the research says | Mechanic in Rootward |
|---|---|---|
| **Retrieval practice / testing effect** | Recalling beats re-reading; effortful retrieval strengthens memory. | Every room asks the player to produce, not consume. Rest rooms are recall cards, not reading. |
| **Spacing** | Reviews spread over time beat massed practice; optimal gaps grow. | FSRS scheduling; Bit Rot; the planner reserves review slots. |
| **Interleaving** | Mixing problem types improves discrimination and transfer vs blocked practice. | Puzzle rooms interleave mastered concepts; dungeons mix realms; boss combines nodes. |
| **Desirable difficulties (Bjork)** | Harder-but-achievable conditions improve long-term retention. | Elo targets ~75% success; Constraint Curses force alternative approaches; variants prevent memorization. |
| **Deliberate practice (Ericsson)** | Focused practice on weaknesses with immediate feedback and expert guidance. | Learner model targets weak nodes; instant tests; Tutor feedback; error tags direct practice. |
| **Cognitive load theory (Sweller)** | Limit extraneous load; use worked examples for novices; fade scaffolding as expertise grows. | Shrines are short with one worked example; hint ladder is a faded example; UI keeps task, code, and results visible together (no split attention). |
| **Expertise reversal effect** | Worked examples help novices but hinder experts. | Hint ladder starts lower for high-mastery nodes; Shrines skipped above mastery 2. |
| **Worked examples and Parsons problems** | Reordering given code lines teaches structure with less load than writing from scratch. | Parsons puzzles precede free-form coding for new nodes. |
| **Self-explanation and teach-back (Feynman)** | Explaining in one's own words exposes gaps. | Teach-back rooms, Rubber Duck artifact, Retreat explanations that ask the player to restate. |
| **Mastery learning (Bloom)** | Move on only when a concept is mastered; huge effect sizes with tutoring. | Mastery levels gate prerequisites; the Tutor is one-on-one. |
| **Zone of proximal development / scaffolding** | Learners progress with support just beyond current ability; remove support gradually. | Frontier selection (prereqs met); Assisted vs Unaided passes; hint costs rise with mastery. |
| **Immediate, specific feedback** | Feedback works when timely and actionable, not just right/wrong. | Test output with expected/actual; Reviewer comments; error tags named. |
| **Generation effect** | Generating an answer before seeing it improves learning. | Predict-output puzzles; "guess the complexity" before the Tome reveals it. |
| **Transfer** | Near transfer is common, far transfer is rare; vary surface features. | Same concept across realms, languages, and room types; cross-language ports. |
| **Notional machine** | Novices need an accurate mental model of how code executes. | Trace ability; trace-the-state puzzles; event-loop ordering puzzles. |
| **PRIMM (Predict, Run, Investigate, Modify, Make)** | Reading and predicting before writing reduces novice failure. | Room order for a new node: predict puzzle -> shrine -> fix/modify -> encounter. |
| **Productive failure** | Struggling before instruction can improve conceptual learning if followed by consolidation. | Encounter before Shrine is allowed for mastery >= 1; Retreat explanations consolidate. |
| **Flow (Csikszentmihalyi)** | Engagement when challenge matches skill, goals are clear, feedback immediate. | Adaptive difficulty; clear enemy HP; bounded runs. |
| **Self-determination theory** | Autonomy, competence, relatedness sustain intrinsic motivation. | Branching map choices, Oaths, class fantasy; visible mastery; Lint as a companion. |
| **Metacognition** | Planning, monitoring, and evaluating one's own learning improves outcomes. | Debrief with "what to study next"; Chronicle; plan rationale visible. |
| **Habit and streaks (with care)** | Consistency beats intensity; punishing streak loss can backfire. | Daily Issue and gentle streaks; no loss-aversion dark patterns. |
| **Misconception-driven instruction** | Address specific wrong models rather than re-explaining. | Error tags feed targeted Tutor prompts and enemy moves. |

## Things to avoid (evidence is weak or negative)
- Learning styles matching (no evidence). Do not branch content on "visual vs verbal learner".
- Pure gamification (points/badges) without learning mechanics. Rewards must be attached to evidence.
- Timed pressure for novices on new material (raises load). Timers are opt-in hard mode.
- Rereading and highlighting as primary study. Tomes are references, not lessons.

## Open questions to test with the user (playtest notes)
- Does 75% target feel right, or does the user prefer harder?
- Shrine length: 200 or 500 words?
- Hint costs: are they discouraging or motivating?
- Does the Teach-back feel worth it?

## References
Dunlosky et al. 2013 ("Improving Students' Learning with Effective Learning Techniques"); Bjork & Bjork on desirable difficulties;
Sweller on cognitive load; Ericsson on deliberate practice; Bloom's 2 sigma; Sorva on notional machines; Sentance on PRIMM;
Ericson on Parsons problems; Kapur on productive failure; Deci & Ryan on SDT; open-spaced-repetition FSRS papers.
