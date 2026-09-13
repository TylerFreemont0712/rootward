// Browser smoke test: start the real server (which serves the built client), open it in headless Chromium, and play a
// whole expedition in JavaScript through the UI. It walks the map with the keyboard, travels to each open door, beats
// the fight behind it with the reference solution, and returns to the map until the boss falls.
//
// Run with `pnpm test:e2e` (builds the client first). playwright-core is pinned to the version whose Chromium build
// is cached locally (revision 1217); if no browser is cached, install one with `pnpm exec playwright-core install
// chromium` from this folder. This is deliberately not part of `pnpm test`, which must stay hermetic.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
const resultsDir = path.join(root, "e2e/test-results");
/** A long expedition has 9 floors; anything beyond that means the loop is not making progress. */
const MAX_ROOMS = 12;

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

/** Challenge id -> JavaScript reference solution, read from every pack, so the test keeps working as content grows. */
function javascriptSolutions(): Map<string, string> {
  const solutions = new Map<string, string>();
  const packs = path.join(root, "content/packs");
  for (const pack of readdirSync(packs)) {
    const challenges = path.join(packs, pack, "challenges");
    if (!existsSync(challenges)) continue;
    for (const realm of readdirSync(challenges)) {
      for (const folder of readdirSync(path.join(challenges, realm))) {
        const dir = path.join(challenges, realm, folder);
        const solution = path.join(dir, "solution/javascript/main.js");
        if (!existsSync(solution)) continue;
        const id = /^id:\s*(\S+)/m.exec(readFileSync(path.join(dir, "challenge.yaml"), "utf8"))?.[1];
        if (id !== undefined) solutions.set(id, readFileSync(solution, "utf8"));
      }
    }
  }
  return solutions;
}

async function avatarBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(".ascii-map .avatar").first().boundingBox();
  if (!box) throw new Error("the avatar is not on the map");
  return { x: box.x, y: box.y };
}

async function main(): Promise<void> {
  const solutions = javascriptSolutions();
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
    mkdirSync(resultsDir, { recursive: true });

    await page.getByRole("button", { name: "short", exact: true }).click();
    await page.getByRole("button", { name: "Descend in javascript" }).click();
    const map = page.getByRole("img", { name: /Dungeon map/ });
    await map.waitFor();

    // Keyboard movement: one step down inside the entrance hall.
    const before = await avatarBox(page);
    await page.keyboard.press("j");
    const after = await avatarBox(page);
    if (!(after.y > before.y)) throw new Error(`pressing j did not move the avatar down (${before.y} -> ${after.y})`);
    await page.screenshot({ path: path.join(resultsDir, "expedition-map.png") });

    let rooms = 0;
    for (;;) {
      if (++rooms > MAX_ROOMS) throw new Error(`the expedition did not end after ${MAX_ROOMS} rooms`);
      // Travel with the door list (the route that needs no mouse aim), then step through once the avatar arrives.
      await page.getByRole("list", { name: "Open doors" }).getByRole("button").first().click();
      await page.getByRole("button", { name: /Step inside/ }).click();

      const challengeId = await page.locator(".task .meta span").first().innerText();
      const solution = solutions.get(challengeId);
      if (solution === undefined) throw new Error(`no JavaScript solution found for ${challengeId}`);
      await page.getByRole("tab", { name: /Editor/ }).click();
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await page.keyboard.insertText(solution);

      if (rooms === 1) {
        await page.getByRole("button", { name: /Probe/ }).click();
        await page.getByText(/(\d+) \/ \1 passing/).waitFor();
      }
      await page.getByRole("button", { name: /Cast/ }).click();
      // The same words also appear in the combat log; the heading is the unambiguous target.
      await page.getByRole("heading", { name: /defeated$/ }).waitFor();
      if (rooms === 1) {
        const outcome = await page.locator(".outcome.won").innerText();
        if (!outcome.includes("Crit")) throw new Error(`expected a first-Cast crit, the outcome panel says:\n${outcome}`);
        await page.screenshot({ path: path.join(resultsDir, "first-room-victory.png"), fullPage: true });
      }

      const onward = page.getByRole("button", { name: /Continue to the map|See how the expedition ended/ });
      const finished = (await onward.innerText()).startsWith("See how");
      await onward.click();
      await map.waitFor();
      if (finished) break;
    }

    await page.getByRole("heading", { name: "Expedition complete" }).waitFor();
    const screenshot = path.join(resultsDir, "expedition-complete.png");
    await page.screenshot({ path: screenshot });
    console.log(`E2E passed: an expedition of ${rooms} rooms was completed in the browser. Screenshots in ${path.relative(root, resultsDir)}`);
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
