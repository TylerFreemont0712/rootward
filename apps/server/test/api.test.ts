import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WasmJsRunner, WasmPythonRunner } from "@rootward/runners";
import { ChallengeListResponse, EncounterResponse, ErrorResponse, HealthResponse } from "@rootward/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { loadGameContent } from "../src/content.ts";
import { RunService } from "../src/runs/service.ts";
import { InMemoryEventStore } from "../src/runs/store.ts";
import { Sandbox } from "../src/sandbox.ts";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const tallyWispDir = path.join(rootDir, "content/packs/core/challenges/foundry/tally-wisp");
const solution = {
  javascript: readFileSync(path.join(tallyWispDir, "solution/javascript/main.js"), "utf8"),
  python: readFileSync(path.join(tallyWispDir, "solution/python/main.py"), "utf8"),
};
const TALLY_WISP = "foundry.py.dict-word-count";
const SLOW = { timeout: 60_000 };
const HIDDEN_SECRETS = [
  "... hello --- ! hello",
  "don't 'don't' (don't)",
  "words that are only punctuation are discarded",
  "inner punctuation is kept",
  "lorem ipsum",
  "hello 2",
];

let app: FastifyInstance;
let sandbox: Sandbox;

beforeAll(async () => {
  const content = await loadGameContent(rootDir);
  sandbox = new Sandbox(content.balance, [new WasmJsRunner(), new WasmPythonRunner({ warm: true })]);
  const service = new RunService({ content, sandbox, store: new InMemoryEventStore() });
  app = await buildApp({ service, sandbox });
});

afterAll(async () => {
  await app.close();
  await sandbox.dispose();
});

async function startEncounter(language = "javascript", seed = "api-test") {
  const response = await app.inject({
    method: "POST",
    url: "/api/encounters",
    payload: { challengeId: TALLY_WISP, language, seed },
  });
  expect(response.statusCode, response.body).toBe(200);
  return EncounterResponse.parse(response.json()).view;
}

async function act(runId: string, payload: object) {
  const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/actions`, payload });
  return {
    status: response.statusCode,
    body: response.body,
    json: (): EncounterResponse => EncounterResponse.parse(response.json()),
  };
}

describe("the API", () => {
  it("reports health and the available runners", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(HealthResponse.parse(response.json()).runners).toEqual([
      { id: "wasm-js", languages: ["javascript"], available: true },
      { id: "wasm-python", languages: ["python"], available: true },
    ]);
  });

  it("lists the Tally Wisp as playable in Python and JavaScript", async () => {
    const response = await app.inject({ method: "GET", url: "/api/challenges" });
    const { challenges } = ChallengeListResponse.parse(response.json());
    expect(challenges.find((c) => c.id === TALLY_WISP)).toMatchObject({
      languages: ["python", "javascript"],
      playableLanguages: ["python", "javascript"],
      enemyName: "Tally Wisp",
    });
  });

  it("starts an encounter with starter files and hidden tests shown only by category", async () => {
    const view = await startEncounter();
    expect(view.status).toBe("active");
    expect(view.editorFiles["main.js"]).toContain("TODO");
    expect(view.player).toMatchObject({ focus: 5, focusMax: 5, integrity: 100 });
    expect(view.tests.filter((t) => t.visibility === "visible").map((t) => t.label)).toEqual([
      "counts simple repeated words",
      "ignores case and edge punctuation",
      "breaks ties alphabetically",
    ]);
    expect(view.tests.filter((t) => t.visibility === "hidden").map((t) => t.label)).toEqual([
      "empty-input #1",
      "boundary #1",
      "normalization #1",
      "large-input #1",
    ]);
  });

  it("plays the Tally Wisp in JavaScript: Probe fails the starter, Cast with the solution wins", SLOW, async () => {
    const view = await startEncounter();
    const probe = (await act(view.runId, { type: "probe", files: view.starterFiles })).json().view;
    const failing = probe.tests.find((t) => t.visibility === "visible" && t.status === "fail");
    expect(failing?.expected).toBeDefined();
    expect(failing?.actual).toBeDefined();
    expect(probe.player.focus).toBe(5);

    const won = (await act(view.runId, { type: "cast", files: { "main.js": solution.javascript } })).json().view;
    expect(won.status).toBe("won");
    expect(won.enemy.hp).toBe(0);
    expect(won.rewards?.bonuses).toEqual(expect.arrayContaining(["crit", "true_sight", "unaided"]));
    expect(won.player.cycles).toBeGreaterThan(view.player.cycles);
    expect(won.log.at(-1)?.kind).toBe("won");

    const again = (await act(view.runId, { type: "cast", files: { "main.js": solution.javascript } })).json();
    expect(again.refused?.code).toBe("no-encounter");
  });

  it("plays the Tally Wisp in Python through the permission-restricted sandbox", SLOW, async () => {
    const view = await startEncounter("python");
    expect(view.challenge.entry).toBe("main.py");
    expect(view.editorFiles["main.py"]).toContain("TODO");
    const won = (await act(view.runId, { type: "cast", files: { "main.py": solution.python } })).json().view;
    expect(won.status).toBe("won");
    expect(won.rewards?.bonuses).toEqual(expect.arrayContaining(["crit", "true_sight", "unaided"]));
  });

  it("never sends hidden test contents, even when the program echoes its input", SLOW, async () => {
    const echoes = {
      javascript: 'const input = require("fs").readFileSync(0, "utf8");\nconsole.log(input);\nconsole.error("stdin: " + input);',
      python: "import sys\ndata = sys.stdin.read()\nprint(data)\nprint('stdin:', data, file=sys.stderr)",
    };
    for (const [language, source] of Object.entries(echoes)) {
      const view = await startEncounter(language);
      const cast = await act(view.runId, { type: "cast", files: { [view.challenge.entry]: source } });
      expect(cast.status).toBe(200);
      for (const secret of HIDDEN_SECRETS) expect(cast.body, `${language}: ${secret}`).not.toContain(secret);

      const retreat = await act(view.runId, { type: "retreat" });
      expect(Object.keys(retreat.json().view.retreat?.solutionFiles ?? {})).toEqual([view.challenge.entry]);
      for (const secret of HIDDEN_SECRETS) expect(retreat.body, `${language}: ${secret}`).not.toContain(secret);
    }
  });

  it("sells hints in order at the mastery-adjusted price", async () => {
    const view = await startEncounter();
    const cost = view.hints.nextCost ?? 0;
    const after = (await act(view.runId, { type: "hint" })).json().view;
    expect(after.hints.taken).toHaveLength(1);
    expect(after.hints.taken[0]?.text).toContain("shape");
    expect(after.player.cycles).toBe(view.player.cycles - cost);
  });

  it("rejects bad requests with clear errors", async () => {
    const view = await startEncounter();
    const missingEntry = await act(view.runId, { type: "cast", files: { "other.js": "" } });
    expect(missingEntry.status).toBe(400);
    expect(ErrorResponse.parse(JSON.parse(missingEntry.body)).error.code).toBe("missing-entry");

    const escapingPath = await act(view.runId, { type: "probe", files: { "../main.js": "" } });
    expect(escapingPath.status).toBe(400);

    expect((await act("no-such-run", { type: "hint" })).status).toBe(404);

    const rust = await app.inject({
      method: "POST",
      url: "/api/encounters",
      payload: { challengeId: TALLY_WISP, language: "rust" },
    });
    expect(rust.statusCode).toBe(400);
    expect(ErrorResponse.parse(rust.json()).error.code).toBe("unsupported-language");
  });
});
