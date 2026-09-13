# Computer science foundations (Puzzle rooms, Silicon Depths, and general literacy)

## Discrete math and logic
- Sets, relations, functions; propositional and predicate logic; truth tables; De Morgan (directly useful for conditionals); implication and contrapositive; proof by induction (recursion's twin); pigeonhole; counting (permutations, combinations); probability basics (expected value, independence, birthday paradox for hashing); modular arithmetic.

## Numbers and representation
- Bases (binary, octal, hex), two's complement, floating point (IEEE 754), fixed point, bit manipulation, Unicode and encodings, endianness, sizes and units (KiB vs KB), time representations (epoch, ISO 8601, time zones, leap seconds exist).

## Automata and computability (intro)
- Finite state machines (directly useful: parsers, protocols, UI states), regular languages and regex limits (why regex cannot parse HTML), context-free grammars, the idea of a Turing machine, decidability and the halting problem (why the game cannot perfectly detect infinite loops and uses timeouts), P vs NP intuition and NP-hard problems (why some bosses use heuristics).

## Information and data
- Entropy and compression intuition, hashing (uniformity, collisions), checksums vs cryptographic hashes, error detection (parity, CRC intro), encoding vs encryption, serialization formats and their trade-offs.

## Architecture literacy
- Von Neumann model, fetch-decode-execute, memory hierarchy, I/O and interrupts, what an OS does, what a compiler does, what a network stack does. One paragraph each, with links to the deeper realm files.

## Software engineering as a discipline
- Requirements, estimation (and why it is hard), agile practices with their intent (short feedback loops), code review, documentation, ADRs, technical debt, incident response, licensing basics (MIT/Apache/GPL/CC0), open source etiquette, ethics.

## Puzzle ideas
1. Truth-table completion; simplify a boolean expression; rewrite a nested condition with De Morgan.
2. Convert between bases; add binary numbers; detect overflow.
3. Draw (as a transition table) the FSM for a vending machine / string matcher.
4. "Can regex do this?" classification.
5. Big-O ranking of expressions.
6. Probability: expected collisions in a hash table of size m with n keys.
7. Induction: fill in the missing inductive step for a recursive algorithm's correctness.
8. Pick the license for a scenario.
9. Time-zone arithmetic without libraries (trap-filled).
10. Halting-problem intuition: which of these loops can the checker prove terminate?
