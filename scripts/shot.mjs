#!/usr/bin/env node
/**
 * Screenshot harness for the Whiffle redesign preview (port 3457).
 *
 * Usage:
 *   node scripts/shot.mjs --url http://localhost:3457/session --out /tmp/x.png \
 *     [--viewport 1728x1080] [--dark] [--wait 2500] [--fullpage]
 *
 * Viewports for the three targets:
 *   ultrawide 3440x1440 · macbook16 1728x1080 · iphone 390x844
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const get = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : args[i + 1];
};
const has = (flag) => args.includes(flag);

const url = get("--url");
const out = get("--out");
if (!(url && out)) {
  console.error("need --url and --out");
  process.exit(1);
}
const [w, h] = get("--viewport", "1728x1080").split("x").map(Number);
const wait = Number(get("--wait", "2500"));

const exe =
  process.env.CHROMIUM_BIN ||
  "/home/bewinxed/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: w, height: h },
  deviceScaleFactor: 1,
  ...(w < 500 ? { hasTouch: true, isMobile: true } : {}),
});

// Theme is applied from localStorage before hydration, so seed it first.
await page.addInitScript(
  (theme) => localStorage.setItem("whiffle-theme", theme),
  has("--dark") ? "dark" : "light"
);

await page
  .goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  // biome-ignore lint/suspicious/noEmptyBlockStatements: navigation errors are ignored; the screenshot below still runs against whatever loaded
  .catch(() => {});
await page.waitForTimeout(wait);
await page
  .screenshot({
    path: out,
    fullPage: has("--fullpage"),
    animations: "disabled",
    caret: "hide",
    timeout: 20_000,
  })
  .catch(async (e) => {
    console.error(`retrying after: ${e.message.split("\n")[0]}`);
    await page.screenshot({
      path: out,
      fullPage: has("--fullpage"),
      animations: "disabled",
      timeout: 20_000,
    });
  });
await browser.close();
console.log(`WROTE ${out} (${w}x${h}${has("--dark") ? " dark" : ""})`);
