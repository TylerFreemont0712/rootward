# AI engineering (The Observatory; the Summoner's home)

## Concepts
- How LLMs work at the level an engineer needs: tokens, context windows, sampling (temperature, top-p), system vs user messages, why outputs vary, hallucination, knowledge cutoff, cost = tokens.
- Prompt engineering as engineering: clear task, constraints, examples (few-shot), output format (JSON schemas), decomposition, chain-of-thought when useful, role of the system prompt, prompt versioning, prompt injection awareness.
- Structured output and tool calling (function calling): schemas, validation, retries, idempotent tools, agent loops (observe/act), stopping conditions, budgets.
- Evals: golden sets, rubric grading, LLM-as-judge (with its biases), pass@k, regression suites, A/B; the discipline: no prompt change without an eval run.
- Embeddings: vectors, cosine similarity, semantic search, chunking, vector stores (pgvector, SQLite-vec, FAISS), reranking; RAG pipelines and their failure modes (bad chunking, retrieval misses, stale index, citation hallucination).
- Local models: Ollama, llama.cpp, quantization (what 4-bit means), context limits, speed vs quality, choosing a coder model.
- Provider abstraction (this game's `packages/ai`), streaming, caching, rate limits, fallbacks, cost tracking, observability of prompts.
- Classical ML basics for literacy: train/test split, overfitting, features, logistic regression, decision trees, metrics (precision/recall/F1, ROC), a scikit-learn pipeline; when a regex or a rule beats a model.
- Safety and ethics in practice: PII handling, prompt injection in tool-using agents, output filtering, human in the loop, licensing of data.
- Agents: tools, memory, planning; MCP-style tool servers; evaluation of agents by task success; sandboxing agent actions (bridge to this game's runners).

## Misconceptions / error tags
- Trusting model output without validation (`unvalidated-llm-output`)
- Changing prompts without evals (`no-eval`)
- Passing untrusted content as instructions (`prompt-injection`)
- Ignoring token limits (`context-overflow`)
- Non-deterministic tests on model output (`flaky-llm-test`)

## Challenge ideas (fights are graded by deterministic evals against a configured model, or by pure code tests)
1. **Hallucination** — write a system prompt + JSON schema so that a classification task passes an eval set of 50 cases at >= 90%; the enemy's HP is failing cases; tests run against the configured Summoner model (results cached per prompt hash).
2. **Extractor Elemental** — extract structured fields from messy text; eval set; validation with zod/pydantic.
3. **Embedding Eidolon** — implement cosine similarity and a top-k search over provided vectors (pure code); then chunk a document and retrieve the right chunk for 20 questions (eval).
4. **RAG Revenant** — build a mini RAG over the game's own Library; eval questions with expected source ids.
5. **Tool-Calling Titan** — implement a tool loop with validation, retries, and a budget; tests use a scripted fake model.
6. **Prompt Injection Imp** — a summarizer that must ignore instructions embedded in the document; adversary supplies injected documents.
7. **Eval Engineer** — write an eval harness with rubric grading and regression detection; tests feed synthetic outputs.
8. **Classifier Kobold** (Python) — train a logistic regression on a small dataset; tests check F1 within a band and no data leakage (train/test split checked).
9. **Token Budget Troll** — implement context packing that never exceeds a token limit (use a tokenizer lib); hidden tests with huge inputs.
10. **Local Model Wrangler** (terminal) — configure Ollama, pull a model (narratively; the check verifies an API response), write a script that streams a completion.
