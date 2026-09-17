// Browser smoke test: start the real server (which serves the built client), open it in headless Chromium, and play
// through the UI. It creates a character, picks The World from the main menu, walks up to Lint and takes the first quest
// in conversation (ADR-0011), wins a practice fight from the Guild Board with the reference solution, then goes back to
// the main menu and plays a Shardrun turn (ADR-0012, ADR-0013).
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
import { chromium } from "playwright-core";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");
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

    // The title screen carries the language picker, because it is the first screen someone sees (ADR-0017). Check it
    // there, then switch back: everything below this looks for English.
    await page.getByLabel("Language").selectOption("ja");
    await page.getByText("ビットロットが機械を蝕んでいます").waitFor();
    await page.screenshot({ path: path.join(resultsDir, "title-ja.png") });
    await page.getByLabel("言語").selectOption("en");
    await page.getByText("Bit Rot is eating the Machine").waitFor();

    // A fresh data directory has no characters: make one. Planned classes are listed but cannot be picked yet.
    if (!(await page.getByRole("radio", { name: /Warden/ }).isDisabled())) throw new Error("the planned Warden class can be picked");
    const nameInput = page.getByPlaceholder("Character name");
    await nameInput.fill("Smoke");
    await nameInput.press("Enter");

    // A character starts at the main menu, with one door into each mode. Switching the language there is the whole
    // localization skeleton end to end (ADR-0017): the picker writes the preference, the catalog answers in Japanese,
    // and `<html lang>` follows so the Japanese font stack and line breaking apply. Switch back before playing, since
    // every step below looks for English.
    await page.getByLabel("Language").selectOption("ja");
    await page.locator(".menu-mode-name", { hasText: /^シャードラン$/ }).waitFor();
    if ((await page.locator("html").getAttribute("lang")) !== "ja") throw new Error("the document language did not follow the picker");
    await page.screenshot({ path: path.join(resultsDir, "main-menu-ja.png") });
    await page.reload();
    // The preference survives a reload, and reaches `<html lang>` on load rather than only on change.
    await page.locator(".menu-mode-name", { hasText: /^シャードラン$/ }).waitFor();
    if ((await page.locator("html").getAttribute("lang")) !== "ja") throw new Error("the stored language did not reach the document on load");
    await page.getByLabel("言語").selectOption("en");

    await page.getByRole("button", { name: /The World/ }).click();
    await page.getByRole("button", { name: "Arrive with javascript" }).click();
    await page.locator(".w-viewport").waitFor();

    // One step east puts the Maintainer beside Lint; E starts the conversation. E also finishes typing and turns
    // pages, so keep pressing it until the choice that starts the first quest is on screen.
    await page.keyboard.press("d");
    await page.keyboard.press("e");
    const dialogue = page.getByRole("dialog", { name: /Lint speaks/ });
    await dialogue.waitFor();
    const startQuest = dialogue.getByRole("button", { name: /Where do I start\?/ });
    for (let presses = 0; presses < 12 && !(await startQuest.isVisible()); presses++) {
      await page.keyboard.press("e");
      await page.waitForTimeout(150);
    }
    await page.screenshot({ path: path.join(resultsDir, "world-dialogue.png") });
    await startQuest.click();
    await page.getByText("Quest started: Report to the Guild").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".journal").getByText("Report to the Guild").waitFor();
    await page.screenshot({ path: path.join(resultsDir, "world.png") });

    // The Guild Board belongs to the World. Planned expeditions left it when Shardrun took their place, so warm up on a
    // single practice fight: Probe, then Cast the reference solution for a first-try crit.
    await page.getByRole("navigation", { name: "Places" }).getByRole("button", { name: "Guild Board" }).click();
    if ((await page.getByRole("button", { name: /Descend in/ }).count()) > 0) throw new Error("the Guild Board still offers expeditions");
    await page.getByRole("button", { name: "Practice in javascript" }).first().click();
    const challengeId = await page.locator(".task .meta span").first().innerText();
    const solution = solutions.get(challengeId);
    if (solution === undefined) throw new Error(`no JavaScript solution found for ${challengeId}`);
    await page.getByRole("tab", { name: /Editor/ }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(solution);
    await page.getByRole("button", { name: /Probe/ }).click();
    await page.getByText(/(\d+) \/ \1 passing/).waitFor();
    await page.getByRole("button", { name: /Cast/ }).click();
    await page.getByRole("heading", { name: /defeated$/ }).waitFor();
    const outcome = await page.locator(".outcome.won").innerText();
    if (!outcome.includes("Crit")) throw new Error(`expected a first-Cast crit, the outcome panel says:\n${outcome}`);
    await page.screenshot({ path: path.join(resultsDir, "practice-victory.png"), fullPage: true });
    // The outcome panel has its own way back; the side panel offers another, so name the outcome button exactly.
    await page.getByRole("button", { name: "Back to the Guild Board →" }).click();
    await page.getByText(/1 fights finished/).waitFor();

    // Shardrun (ADR-0012, ADR-0013) from the main menu: pick Beginner, climb into the first room of the map, cast a spell
    // whose shards run in the real sandbox (it plays as code first), end the turn, then abandon the run.
    await page.getByRole("button", { name: /Main menu/ }).click();
    await page.getByRole("button", { name: /Roguelite/ }).click();
    await page.getByRole("radio", { name: /Beginner/ }).click();
    await page.getByRole("button", { name: "Descend in javascript" }).click();
    await page.locator(".shr-map-node.state-open").first().click();
    const firstSpell = page.locator(".shr-spell").first();
    await firstSpell.getByRole("button", { name: "Cast" }).waitFor();
    // The number depends on the foe (a Null Wraith swallows the first bolt, so 0 is a correct prediction).
    const predicted = await firstSpell.locator(".shr-predict").innerText();
    if (!/\d+ bolts? \d+ damage/.test(predicted.replace(/\s+/g, " "))) {
      throw new Error(`expected the first spell to predict bolts and damage, it says: ${predicted}`);
    }
    await page.keyboard.press("1");
    await page.locator(".shr-code-view").waitFor();
    await page.screenshot({ path: path.join(resultsDir, "shardrun-code.png") });
    await firstSpell.getByRole("button", { name: "Spent this turn" }).waitFor();
    await page.getByRole("button", { name: /End turn/ }).click();
    // The battle log also says "Turn 2.", so wait on the turn counter alone.
    await page.locator(".shr-self > .meta").getByText(/^Turn 2/).waitFor();
    // The stage (ADR-0019): the class's portrait in the lower left, and effects drawn under and over the bodies.
    await page.locator(".shr-hero-panel .shr-portrait img").waitFor();
    if ((await page.locator("canvas.shr-fx").count()) !== 2) throw new Error("the arena should draw its effects on two canvases");
    await page.screenshot({ path: path.join(resultsDir, "shardrun-battle.png") });

    // Content localization (ADR-0018): the same run, read in Japanese. The language is chosen at the menu, so go back,
    // switch, and resume — the shard names, the foe and its intent all come from the server, which makes this the
    // header, the content overlay and the server's own message catalog, end to end in a real browser.
    await page.getByRole("button", { name: /Main menu/ }).click();
    await page.getByLabel("Language").selectOption("ja");
    // Exactly the spellbook's door: Shardrun (Experimental) is a door of its own, and its name contains this one.
    await page.locator(".menu-mode-name", { hasText: /^シャードラン$/ }).click();
    await page.getByText("防護").first().waitFor();
    await page.screenshot({ path: path.join(resultsDir, "shardrun-battle-ja.png") });
    // A spell's name is still English, on purpose: the code view turns it into a function name.
    const code = await page.locator(".shr-spell").first().innerText();
    if (!code.includes("Bolt")) throw new Error(`a spell name should stay English, the first spell reads:\n${code}`);
    await page.getByRole("button", { name: /Main menu|メインメニュー/ }).click();
    await page.getByLabel("言語").selectOption("en");
    await page.locator(".menu-mode-name", { hasText: /^Shardrun$/ }).click();
    await page.getByRole("button", { name: "Abandon", exact: true }).click();
    await page.getByRole("button", { name: "Abandon this run" }).click();
    await page.getByRole("heading", { name: "You climbed back out" }).waitFor();

    // Shardrun (Experimental), the deck playstyle (ADR-0020): its own door and its own run. Click one card into the first
    // blank spell (its code is on screen, growing as it is built), drag a second into a slot, hold a third, cast (on
    // Beginner no two first-layer cards can finish a first-layer foe), and end the turn: the held card starts the new hand.
    await page.getByRole("button", { name: "Main menu", exact: true }).click();
    await page.locator(".menu-mode-name", { hasText: "Shardrun (Experimental)" }).click();
    await page.getByRole("button", { name: "Descend in javascript" }).click();
    await page.locator(".shr-map-node.state-open").first().click();
    const hand = page.locator(".shr-hand-card .shr-card-button");
    const leftHand = page.locator(".shr-spell").first();
    const played = leftHand.locator(".shr-slots-row .shr-card-button");
    await hand.first().waitFor();
    if ((await hand.count()) !== 5) throw new Error(`expected a hand of 5 cards, found ${await hand.count()}`);
    await hand.first().click();
    await played.first().waitFor();
    await page.locator(".shr-code-view.mode-build").getByText("function castLeftHand(battle) {").waitFor();
    const card = await hand.first().boundingBox();
    const slot = await leftHand.locator(".shr-slot-card").first().boundingBox();
    if (!card || !slot) throw new Error("no card in hand, or no open slot to drag it to");
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
    await page.mouse.up();
    await played.nth(1).waitFor();
    await page.locator(".shr-hand-card").first().hover();
    await page.locator(".shr-hand-card").first().locator(".shr-hold-pin").click();
    await page.locator(".shr-hold .shr-card-button").waitFor();
    if ((await hand.count()) !== 2) throw new Error(`two played and one held should leave 2 in hand, found ${await hand.count()}`);
    await leftHand.getByRole("button", { name: "Cast" }).waitFor();
    await page.keyboard.press("1");
    await leftHand.getByRole("button", { name: "Spent this turn" }).waitFor();
    await page.locator(".shr-pile", { hasText: "discard" }).getByText("2", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(resultsDir, "shardrun-experimental.png") });
    await page.getByRole("button", { name: /End turn/ }).click();
    await page.locator(".shr-self > .meta").getByText(/^Turn 2/).waitFor();
    if ((await hand.count()) !== 6) throw new Error(`a new turn should deal 5 cards on top of the held one, found ${await hand.count()}`);
    await page.getByRole("button", { name: "Abandon", exact: true }).click();
    await page.getByRole("button", { name: "Abandon this run" }).click();
    await page.getByRole("heading", { name: "You climbed back out" }).waitFor();

    console.log(
      `E2E passed: a character was created, arrived in the world and took a quest, won a practice fight, and played a Shardrun turn in each playstyle in the browser. Screenshots in ${path.relative(root, resultsDir)}`,
    );
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
