# AI integration patterns

## Transport: Vercel AI SDK
- `ai` core (`generateText`, `streamText`, structured output via `generateObject`/`Output` depending on the installed major; check the docs of the pinned version at session start), provider packages: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` (Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`, llama.cpp server, vLLM), `@openrouter/ai-sdk-provider`, community `ollama-ai-provider` (native Ollama API; useful for model listing and options like `num_ctx`).
- Wrap in our own interfaces so the SDK is replaceable:
```ts
interface ChatModel { stream(req: ChatRequest, onDelta: (t: string) => void, signal: AbortSignal): Promise<ChatResult> }
interface StructuredModel { generate<T>(req: ChatRequest, schema: ZodSchema<T>, signal: AbortSignal): Promise<T> }
```

## Registry and routing
- `config/ai.json` -> `ProviderRegistry` builds provider instances lazily; `listModels(providerId)` hits the discovery endpoint and caches for 10 minutes.
- `RoleRouter.resolve(role)` returns `{ model, settings }`; `setRoleModel()` updates in memory and persists to the settings table (not to `ai.json`, which stays a template) so switching is instant and survives restarts.
- Fallback chain: on network error, 5xx, timeout, or invalid structured output twice, move to the next entry; log the reason; surface a toast.
- Health: `testConnection(providerId)` sends a 5-token request; the Settings UI shows latency.
- Concurrency limiter per provider; global `maxConcurrent`; a daily cost cap that disables paid roles when exceeded (local roles keep working).

## Prompt templates
- Files in `config/prompts/<role>.md` with `{{var}}` placeholders and `{{#if var}}...{{/if}}` blocks; a tiny renderer (no full Handlebars needed). Hot-reload in dev.
- Every template starts with a fixed system section (stable for caching) and ends with the volatile parts (code, results).
- Keep the Anthropic prompt-caching guidance in mind: stable prefix first; put the player's code last.

## Structured output
- Prefer native JSON/structured modes when the provider supports them; otherwise instruct "return only JSON" and parse with a repair step (strip fences, fix trailing commas) then validate with zod; on failure, one retry with the validation error appended; then fallback.
- Schemas live in `packages/ai/src/schemas/*.ts` and are shared with content-schema where relevant (Forge output = challenge schema + solution + tests).

## Caching and logging
- Cache key = sha256(role + model + rendered prompt). Cache Loremaster and Reviewer results; never cache Tutor (context changes every turn).
- Log every call: role, provider, model, prompt tokens, completion tokens, latency, cost estimate (from a per-model price table in `config/ai-prices.json`, user-editable), cache hit, error. Show in Settings and Chronicle.

## Anthropic specifics (verified September 2026)
- Model ids: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Use adaptive thinking on Claude 4.6+ (`thinking: {type: "adaptive"}`); `budget_tokens` is deprecated/rejected on newer models. Prefer streaming for long outputs. The AI SDK's Anthropic provider exposes provider options for these; verify against the installed version.
- Fallback routing on refusals exists server-side for some models; not needed for this app's roles.

## Local models
- Ollama: `GET /api/tags` for models; `num_ctx` matters (set 8k-16k for Tutor context); JSON mode via `format: "json"`; coder models (7-14B) are fine for Tutor/Loremaster; use a strong hosted model for Forge/Adversary unless the user has a large local model.
- Detect "model not found" and offer the pull command in the UI (do not pull automatically).

## Safety
- Player code and AI output are data, never executed outside runners.
- Prompt injection: the Tutor prompt states that content inside code/results is untrusted; the Forge output is validated by execution, not by trust.
- Privacy toggles per role: "send my code to hosted providers" default off for hosted, on for local.

## Testing the AI layer
- `FakeProvider` that returns scripted responses/streams; fixtures recorded from real calls for structured roles; contract tests for each provider adapter (skipped when no key); an eval set for the Tutor: 20 scenarios with "must not contain solution" checks and "mentions node id" checks.
