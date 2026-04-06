import { chromium } from "playwright";
import readline from "node:readline/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";

import { ensureDir, paths } from "./lib/config.mjs";

async function main() {
  await ensureDir(path.dirname(paths.authFile));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening X login page in Chromium...");
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

  console.log("");
  console.log("1. Log in with your own X account.");
  console.log("2. Open your private list once to verify you can see the timeline.");
  console.log("3. Come back here and press Enter to save the browser session.");
  console.log("");

  const rl = readline.createInterface({ input, output });
  await rl.question("Press Enter after you finish logging in: ");
  rl.close();

  await ensureDir(path.dirname(paths.authFile));
  await context.storageState({ path: paths.authFile });
  await browser.close();

  console.log(`Saved login state to ${paths.authFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
