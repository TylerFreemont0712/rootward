// `pnpm content:locale <locale> [--missing]`: how much of the content a locale translates, and which strings it
// still owes. With `--missing` it prints those strings as catalog entries, ready to paste into
// `content/packs/<pack>/locales/<locale>/*.yaml` and fill in, so translating is never a hunt through the pack.
import path from "node:path";
import { parseArgs, styleText } from "node:util";
import { stringify } from "yaml";
import { formatDiagnostic } from "../diagnostics.ts";
import { loadContent } from "../loader/load-content.ts";
import { localeReport } from "../locale/report.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    missing: { type: "boolean", default: false },
    root: { type: "string" },
  },
});

const rootDir = path.resolve(values.root ?? process.cwd());
const { index, diagnostics } = await loadContent({ contentDir: path.join(rootDir, "content"), rootDir });
for (const error of diagnostics.errors) console.log(styleText("red", formatDiagnostic(error)));

const locales = positionals.length > 0 ? positionals : [...index.locales.keys()];
if (locales.length === 0) {
  console.log("No locale overlays found. Add content/packs/<pack>/locales/<locale>/<area>.yaml to start one.");
  process.exit(0);
}

for (const locale of locales) {
  const report = localeReport(index, locale);
  const total = report.translated.length + report.missing.length;
  const percent = total === 0 ? 0 : Math.round((report.translated.length / total) * 100);
  const line = `${locale}: ${report.translated.length}/${total} strings (${percent}%)`;
  console.log(percent === 100 ? styleText("green", line) : line);
  for (const text of report.stale) {
    console.log(styleText("yellow", `  stale (falls back to English): ${text}`));
  }
  if (values.missing && report.missing.length > 0) {
    console.log(`\n# ${report.missing.length} untranslated string(s) for ${locale}:`);
    console.log(stringify(report.missing.map((en) => ({ en, to: "" }))));
  }
}
