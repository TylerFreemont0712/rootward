# Compilers, interpreters, and language implementation

The best "big project" bosses for the Artificer: building a language teaches data structures, recursion, error
handling, and design all at once.

## Pipeline
- **Lexing**: tokens, regular languages, hand-written scanners vs regex-based, handling strings/escapes/numbers/comments, error positions.
- **Parsing**: grammars (BNF/EBNF), recursive descent, precedence climbing / Pratt parsing, ASTs, parser generators (know they exist), error recovery, ambiguity, left recursion.
- **Semantic analysis**: symbol tables, scopes, name resolution, type checking, constant folding.
- **Evaluation**: tree-walking interpreters, environments and closures, bytecode + VM (stack-based), garbage collection intro, tail calls.
- **Code generation** (intro): stack machines, register allocation (mention), targeting WASM or JS as backends.
- **Tooling**: pretty printers, formatters, linters as AST visitors, source maps, REPLs.
- **Regex engines**: backtracking vs NFA/DFA (Thompson), catastrophic backtracking (ReDoS bridge to security).
- **Data formats as languages**: JSON parser, CSV edge cases (quotes, newlines), INI/TOML, Markdown subset.
- **Language design**: syntax vs semantics, static vs dynamic, evaluation order, scoping rules (lexical vs dynamic), first-class functions, error philosophy.

## Misconceptions / error tags
- Regex for nested structures (`regex-for-grammar`)
- Precedence bugs in expression parsers (`precedence-error`)
- Not handling EOF/empty input (`eof-handling`)
- Dynamic scope by accident (closure captures wrong env) (`scope-error`)
- Catastrophic backtracking regex (`redos`)

## Challenge ideas
1. **Tokenizer Troll** — lexer for a calculator language; hidden tests include unterminated strings and unicode identifiers.
2. **Pratt Parser Phantom** — expression parser with correct precedence and associativity; tests compare ASTs.
3. **Calculator Construct** (boss) — lexer -> parser -> evaluator with variables and functions; phase 4: error messages with line/column.
4. **JSON Juggernaut** — a from-scratch JSON parser passing the JSONTestSuite subset (valid/invalid/undefined cases).
5. **CSV Chimera** — RFC 4180 edge cases; hidden tests include quoted newlines.
6. **Regex Sphinx II** — implement a tiny regex engine (`.`, `*`, `+`, `?`, classes, anchors) via NFA simulation; adversary sends ReDoS-style inputs that must finish in the band.
7. **Lisp Lich** (boss) — a tiny Scheme: `define`, `lambda`, `if`, lists; closures must capture lexically; phase: tail-call optimization for the time band.
8. **Bytecode Beetle** — compile the calculator to a stack VM; tests compare results and instruction counts.
9. **Linter Leech** — write an AST visitor that flags `== null` and unused variables in a subset language.
10. **Markdown Mimic** — headings, emphasis, links, code spans; golden tests with tricky nesting.
11. **Template Tarrasque** — a Jinja/Mustache-like template engine with escaping by default (security bridge).
