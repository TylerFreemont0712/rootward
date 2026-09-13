// Browser smoke test for the M0 definition of done: start the real server (which serves the built client), open it
// in headless Chromium, and beat The Tally Wisp in JavaScript through the UI.
//
// Run with `pnpm test:e2e` (builds the client first). playwright-core is pinned to the version whose Chromium build
// is cached locally (revision 1217); if no browser is cached, install one with `pnpm exec playwright-core install
// chromium` from this folder. This is deliberately not part of `pnpm test`, which must stay hermetic.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const solutionPath = "content/packs/core/challenges/foundry/tally-wisp/solution/javascript/main.js";
const solution = readFileSync(path.join(root, solutionPath), "utf8");
const resultsDir = path.join(root, "e2e/test-results");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not find a free port"));
        return;
      }
      probe.close(() => {
        resolve(address.port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string, server: ChildProcess, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`the server exited early with code ${server.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet; keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("the server did not become healthy in time");
}

async function main(): Promise<void> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverLog: string[] = [];
  // A throwaway data directory, so the test never touches the player's real saved runs.
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "rootward-e2e-"));
  const server = spawn(process.execPath, ["apps/server/src/main.ts"], {
    cwd: root,
    env: { ...process.env, ROOTWARD_PORT: String(port), ROOTWARD_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk: Buffer) => serverLog.push(chunk.toString("utf8")));
  server.stderr.on("data", (chunk: Buffer) => serverLog.push(chunk.toString("utf8")));

  const browser = await chromium.launch({ headless: true });
  try {
    await waitForHealth(baseUrl, server);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(baseUrl);

    await page.getByRole("button", { name: "javascript" }).click();
    await page.getByRole("heading", { name: "The Tally Wisp" }).waitFor();
    await page.getByRole("tab", { name: /Editor/ }).click();

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(solution);

    await page.getByRole("button", { name: /Probe/ }).click();
    await page.getByText("3 / 3 passing").waitFor();
    await page.getByRole("button", { name: /Cast/ }).click();
    // The same words also appear in the combat log; the heading is the unambiguous target.
    await page.getByRole("heading", { name: "Tally Wisp defeated" }).waitFor();

    const outcome = await page.locator(".outcome.won").innerText();
    if (!outcome.includes("Crit")) throw new Error(`expected a first-Cast crit, the outcome panel says:\n${outcome}`);

    mkdirSync(resultsDir, { recursive: true });
    const screenshot = path.join(resultsDir, "tally-wisp-victory.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`E2E passed: The Tally Wisp was defeated in the browser. Screenshot: ${path.relative(root, screenshot)}`);
  } catch (error) {
    console.error(`--- server output ---\n${serverLog.join("")}`);
    throw error;
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
