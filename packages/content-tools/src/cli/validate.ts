// `pnpm content:validate [pack] [--no-exec]`: load every content pack and config file, run all checks, execute
// reference solutions in the sandbox, and exit non-zero on any error.
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { RunnerRegistry, WasmJsRunner } from "@rootward/runners";
import { loadBalance } from "../config.ts";
import { type Diagnostic, formatDiagnostic } from "../diagnostics.ts";
import { loadContent } from "../loader/load-content.ts";
import { validateContent, type ValidateOptions } from "../validate/index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "no-exec": { type: "boolean", default: false },
    root: { type: "string" },
  },
});

const rootDir = path.resolve(values.root ?? process.cwd());
const packId = positionals[0];
const started = performance.now();

const { index, diagnostics } = await loadContent({ contentDir: path.join(rootDir, "content"), rootDir });
const balance = await loadBalance(path.join(rootDir, "config"), diagnostics, rootDir);

const options: ValidateOptions = {};
if (packId !== undefined) options.packId = packId;
if (!values["no-exec"] && balance) {
  const registry = new RunnerRegistry();
  registry.register(new WasmJsRunner());
  const sandbox = balance.sandbox_defaults;
  options.execution = {
    registry,
    limits: {
      wallMs: sandbox.wall_ms,
      cpuMs: sandbox.cpu_ms,
      memMb: sandbox.mem_mb,
      pids: sandbox.pids,
      outputKb: sandbox.output_kb,
    },
  };
}
const report = await validateContent(index, diagnostics, options);

const paint = (d: Diagnostic) =>
  d.severity === "error" ? styleText("red", formatDiagnostic(d)) : styleText("yellow", formatDiagnostic(d));
for (const diagnostic of diagnostics.items) console.log(paint(diagnostic));

const counts = [
  `${index.packs.size} pack(s)`,
  `${index.skills.size} skill nodes`,
  `${index.challenges.size} challenge(s)`,
  `${index.enemies.size} enemies`,
  `${index.items.size} items`,
  `${index.cards.size} cards`,
  `${index.classes.size} class(es)`,
].join(", ");
console.log(`\nLoaded ${counts}.`);
if (options.execution) {
  console.log(`Executed reference solutions: ${report.executed.length ? report.executed.join(", ") : "none"}.`);
  for (const skipped of report.skipped) console.log(styleText("yellow", `Skipped: ${skipped}`));
} else {
  console.log(styleText("yellow", "Reference solutions were not executed (--no-exec or balance.yaml failed to load)."));
}

const errors = diagnostics.errors.length;
const warnings = diagnostics.warnings.length;
const seconds = ((performance.now() - started) / 1000).toFixed(1);
const summary = `${errors} error(s), ${warnings} warning(s) in ${seconds}s`;
console.log(errors > 0 ? styleText("red", summary) : styleText("green", summary));
process.exitCode = errors > 0 ? 1 : 0;
