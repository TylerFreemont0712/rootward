import { type Balance, type ClassDef, type Enemy, HINT_LEVEL_NAMES, Language, resolveStdin } from "@rootward/content-schema";
import type { LoadedChallenge } from "@rootward/content-tools";
import {
  displayedEnemyHp,
  type EncounterState,
  type EnemyAction,
  enemyHp,
  enemyHpMax,
  retreatSuggested,
  type RunEvent,
  type RunState,
} from "@rootward/core";
import type { TestResult } from "@rootward/runners";
import { EncounterView, type LogEntry, type TestView } from "@rootward/shared";
import type { RunArtifacts } from "./artifacts.ts";

// The only place where server state becomes client data. Fairness rule (PROMPT.md section 7.6): hidden tests leave
// the server as a category label and pass/fail, never as names, inputs, expected or actual output, or program output.

const MAX_DETAIL_CHARS = 2000;
const MAX_CONSOLE_CHARS = 8000;
const MAX_LOG_ENTRIES = 60;

export interface ViewInput {
  state: RunState;
  events: readonly RunEvent[];
  challenge: LoadedChallenge;
  enemy: Enemy;
  classDef: ClassDef;
  balance: Balance;
  artifacts: RunArtifacts;
}

export function buildEncounterView({ state, events, challenge, enemy, classDef, balance, artifacts }: ViewInput): EncounterView {
  const encounter = state.encounter;
  if (!encounter) throw new Error(`run ${state.runId} has no encounter`);
  const language = Language.parse(encounter.language);
  const { manifest } = challenge;
  const ended = encounter.status === "retreated" || encounter.status === "exhausted";

  const view = {
    runId: state.runId,
    roomId: encounter.roomId,
    status: encounter.status,
    challenge: {
      id: manifest.id,
      title: manifest.title,
      realm: manifest.realm,
      prompt: challenge.prompt,
      intro: manifest.flavor.intro,
      difficulty: manifest.difficulty,
      estimatedMinutes: manifest.estimated_minutes,
      concepts: manifest.concepts,
      language,
      languages: manifest.languages,
      entry: manifest.tests.entry[language] ?? "",
      maxLines: manifest.constraints.max_lines,
      bannedTokens: manifest.constraints.banned_tokens,
      targetComplexity: manifest.targets.complexity,
    },
    enemy: {
      name: enemy.name,
      tier: enemy.tier,
      art: enemy.art,
      intro: enemy.flavor.intro,
      defeat: enemy.flavor.defeat,
      hp: enemyHp(encounter),
      hpMax: enemyHpMax(encounter),
      hpDisplayed: displayedEnemyHp(encounter),
      lastAction: encounter.lastEnemyAction ? actionView(encounter.lastEnemyAction) : undefined,
    },
    player: {
      className: classDef.name,
      integrity: state.integrity,
      integrityMax: state.integrityMax,
      focus: encounter.focus,
      focusMax: encounter.focusMax,
      cycles: state.cycles,
    },
    starterFiles: challenge.starter[language] ?? {},
    editorFiles: artifacts.files,
    tests: testViews(encounter, challenge, artifacts),
    hints: {
      total: challenge.hints.length,
      taken: hintViews(events, encounter, challenge),
      nextCost: encounter.status === "active" ? encounter.hintCosts[encounter.hintsTaken] : undefined,
    },
    casts: encounter.casts,
    retreatSuggested: retreatSuggested(encounter, balance),
    lastRun: consoleView(artifacts),
    rewards: encounter.rewards,
    retreat: ended ? { solutionFiles: challenge.solution[language] ?? {}, explanation: challenge.explanation } : undefined,
    log: logEntries(events, enemy.name),
  };
  // Parsing validates the contract and strips any property the schema does not list.
  return EncounterView.parse(view);
}

function testViews(encounter: EncounterState, challenge: LoadedChallenge, artifacts: RunArtifacts): TestView[] {
  const cases = new Map(
    [...(challenge.visibleTests?.cases ?? []), ...(challenge.hiddenTests?.cases ?? [])].map((c) => [c.id, c]),
  );
  const perCategory = new Map<string, number>();
  let hiddenIndex = 0;

  return encounter.tests.map((test): TestView => {
    const result = artifacts.latest.get(test.id);
    const status = result === undefined ? "idle" : result.passed ? "pass" : "fail";
    const failed = result !== undefined && !result.passed;

    if (test.visibility === "visible") {
      const testCase = cases.get(test.id);
      return {
        id: test.id,
        label: test.name,
        visibility: "visible",
        status,
        revealed: false,
        ...(result ? { durationMs: result.durationMs, runStatus: result.status } : {}),
        ...(testCase ? { input: clip(resolveStdin(testCase), MAX_DETAIL_CHARS) } : {}),
        ...(failed
          ? {
              expected: clip(result.expected ?? testCase?.expected_stdout ?? "", MAX_DETAIL_CHARS),
              actual: clip(result.actual ?? "", MAX_DETAIL_CHARS),
              ...(result.message !== undefined ? { message: clip(result.message, MAX_DETAIL_CHARS) } : {}),
            }
          : {}),
      };
    }

    hiddenIndex += 1;
    const category = test.category ?? "hidden";
    const count = (perCategory.get(category) ?? 0) + 1;
    perCategory.set(category, count);
    const message = failed ? hiddenFailureMessage(result) : undefined;
    return {
      // Opaque ids: content authors may use descriptive ids, which would hint at the test.
      id: `hidden-${hiddenIndex}`,
      label: `${category} #${count}`,
      visibility: "hidden",
      status,
      revealed: test.revealedBy !== undefined,
      ...(result ? { durationMs: result.durationMs, runStatus: result.status } : {}),
      ...(message !== undefined ? { message } : {}),
    };
  });
}

/** Only fixed phrases: a hidden test's real error text could quote its input. */
function hiddenFailureMessage(result: TestResult): string | undefined {
  switch (result.status) {
    case "timeout":
      return "timed out";
    case "oom":
      return "ran out of memory";
    case "compile-error":
      return "did not compile";
    case "runtime-error":
      return "crashed";
    case "sandbox-error":
      return "could not run";
    case "ok":
      return undefined;
  }
}

function hintViews(events: readonly RunEvent[], encounter: EncounterState, challenge: LoadedChallenge) {
  return events.flatMap((event) =>
    event.type === "HintTaken" && event.roomId === encounter.roomId
      ? [
          {
            level: event.level,
            name: HINT_LEVEL_NAMES[event.level - 1] ?? `level ${event.level}`,
            text: challenge.hints[event.level - 1] ?? "",
            cost: event.cost,
          },
        ]
      : [],
  );
}

function consoleView(artifacts: RunArtifacts): EncounterView["lastRun"] {
  const last = artifacts.lastRun;
  if (!last) return undefined;
  const visible = (last.result.tests ?? []).filter((test) => last.visibleIds.has(test.id));
  const lines = [`$ ${last.kind} (${last.kind === "probe" ? "visible tests" : "all tests, visible output only"})`];
  for (const test of visible) {
    if (test.stderr) lines.push(`[${test.name}] ${test.stderr.trimEnd()}`);
  }
  const passed = visible.filter((test) => test.passed).length;
  lines.push(`visible: ${passed} passed, ${visible.length - passed} failed in ${Math.round(last.result.metrics.wallMs)} ms`);
  if (last.result.status !== "ok") lines.push(`run ended with ${last.result.status}: ${last.result.stderr}`);
  return {
    kind: last.kind,
    status: last.result.status,
    console: clip(lines.join("\n"), MAX_CONSOLE_CHARS),
    wallMs: last.result.metrics.wallMs,
  };
}

function actionView(action: EnemyAction): NonNullable<EncounterView["enemy"]["lastAction"]> {
  if (action.move === "strike") {
    return {
      move: "strike",
      damage: action.damage,
      ...(action.fallbackFrom !== undefined ? { fallbackFrom: action.fallbackFrom } : {}),
      ...(action.taunt !== undefined ? { taunt: action.taunt } : {}),
    };
  }
  return { move: "edge-case", category: action.category, ...(action.taunt !== undefined ? { taunt: action.taunt } : {}) };
}

function logEntries(events: readonly RunEvent[], enemyName: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const event of events) {
    switch (event.type) {
      case "Probed": {
        const passed = event.results.filter((r) => r.passed).length;
        entries.push({ kind: "probe", text: `Probe: ${passed} of ${event.results.length} visible tests pass.` });
        break;
      }
      case "CastResolved": {
        const healed = event.heal > 0 ? `, ${event.heal} healed by regressions` : "";
        entries.push({ kind: "cast", text: `Cast: ${event.damage} damage${healed}. Focus left: ${event.focus}.` });
        break;
      }
      case "EnemyStruck": {
        const fallback = event.action.fallbackFrom ? ` (${event.action.fallbackFrom} had nothing to do)` : "";
        entries.push({ kind: "enemy", text: `${enemyName} uses Strike${fallback}: -${event.action.damage} Integrity.` });
        break;
      }
      case "EdgeCaseRevealed":
        entries.push({
          kind: "enemy",
          text: `${enemyName} uses Edge Case: a hidden ${event.action.category} test joins the fight (+${event.test.weight} HP).`,
        });
        break;
      case "HintTaken":
        entries.push({ kind: "hint", text: `Hint ${event.level} bought for ${event.cost} Cycles.` });
        break;
      case "Retreated":
        entries.push({ kind: "retreat", text: "You retreat. Retreat is not defeat; it is a checkpoint." });
        break;
      case "Exhausted":
        entries.push({ kind: "exhausted", text: "Out of Focus. You fall back and study the reference solution." });
        break;
      case "EncounterWon":
        entries.push({
          kind: "won",
          text: `${enemyName} defeated: +${event.rewards.commits} Commits, +${event.rewards.cycles} Cycles.`,
        });
        break;
      case "RunEnded":
        if (event.reason === "kernel-panic") {
          entries.push({ kind: "panic", text: "Kernel panic - not syncing: Maintainer out of Integrity." });
        }
        break;
      case "RunStarted":
      case "EncounterStarted":
        break;
    }
  }
  return entries.slice(-MAX_LOG_ENTRIES);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... ${text.length - max} more characters]`;
}
