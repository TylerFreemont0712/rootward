# Puzzle formats (non-editor rooms)

Fast, deterministic, generated from templates where possible. Each format: player input, grading, UI, generation
notes. Puzzles are 30 seconds to 3 minutes; a Puzzle room chains 3-5.

| Format | Input | Grading | Notes |
|---|---|---|---|
| **Predict the output** | text (exact or normalized) or multiple choice | exact match after normalization (whitespace, trailing newline); numeric tolerance for floats | Generate by running the snippet in the sandbox; distractors from common misconceptions (e.g. off-by-one). |
| **Spot the bug** | click/select a line (or lines) | set equality with the bug lines; partial credit for superset | Store the bug line(s) in the file; generation: mutate a correct program with one operator and record the line. |
| **Parsons problem** | reorder shuffled lines, with 1-3 distractor lines | order matches any accepted order (topological equivalence) and distractors excluded; indentation matters in Python (2D Parsons) | Generate from the reference solution; distractors from mutation operators. |
| **Fill in the blank (cloze)** | 1-3 text fields | exact or regex match; run tests for code blanks | Blank a key token from the reference; accept synonyms via regex. |
| **Multiple choice / multiple select** | choose | exact set | Write explanations for every distractor; randomize order. |
| **Complexity quiz** | choose Big-O | exact; explanation shown | Generate from annotated snippets. |
| **Trace the state** | table of variable values per step | per-cell equality; partial credit | Generate by instrumenting the snippet in the sandbox. |
| **Terminal one-liner** | a command string | run in a fresh container against `check.sh`; compare stdout or state | Sandboxed; also grade "dangerous command" cases as fail with explanation. |
| **SQL one-liner** | a query | run against SQLite fixture; compare result set (ordered if ORDER BY required) | Generate from the schema with a reference query. |
| **Regex match** | a regex | must match all positives and no negatives; length band for elegance | Adversary can add negatives; guard against ReDoS with a timeout. |
| **Which is idiomatic** | choose among 2-4 snippets | exact | Reviewer rubric explanations. |
| **Order the steps** | reorder process steps (debugging, deploy, incident) | order equality with allowed swaps | Text only. |
| **Diff detective** | choose the diff that introduced the bug | exact | Generate by mutating history. |
| **Log forensics** | short answer (timestamp / id / count) | exact or numeric | Generate logs from templates with a planted event. |
| **Type error spotting** | select the line that fails type checking | exact | Run `tsc`/`mypy` to generate. |
| **What does this command do** | multiple choice | exact | Include dangerous commands; explanation emphasizes safety. |
| **Estimate** | number | within tolerance (e.g. order of magnitude) | System design and capacity math. |
| **Match pairs** | drag/select pairs | set equality | Term-definition, status-code-meaning, signal-behavior. |
| **Truth table / bitwise** | fill cells | per-cell | Generated. |
| **Find the vulnerability** | select line + choose class | both correct for full credit | Security realm. |
| **Read the trace** | select frame/line | exact | Generated from real tracebacks in the sandbox. |
| **Rank by speed** | order implementations | Kendall tau vs measured order | Measured in the sandbox at generation time. |

## Grading and UX rules
- Deterministic grading only; explanations always shown after answering (right or wrong).
- No guessing spam: a wrong answer locks the puzzle for that run; partial credit where defined.
- Puzzles feed the learner model with lighter weight than encounters (0.3x Commits) and record error tags.
- Randomize distractor order; store the seed with the run for reproducibility.
- Keyboard-first UI: number keys select options; Enter submits; Escape skips (skips cost nothing but give nothing).

## Generation templates
Each puzzle type has a generator in `packages/content-tools/src/puzzles/<type>.ts` that takes a source challenge
(or a node) and a seed and emits a validated puzzle file. Forge (AI) can propose new source snippets, but grading
data always comes from execution.
