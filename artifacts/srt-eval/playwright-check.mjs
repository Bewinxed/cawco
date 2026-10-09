// Prototype check: Chromium under the workspace's srt sandbox loads a page from a
// server this same command started, and writes a screenshot into TMPDIR.
// Run from the workspace clone (it imports the clone's playwright-core).
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";

const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end("<title>srt-eval</title><h1 id=ok>inside srt</h1>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const started = performance.now();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
const text = await page.textContent("#ok");
const shot = join(process.env.TMPDIR ?? "/tmp", "srt-eval.png");
await page.screenshot({ path: shot });
await browser.close();
server.close();
console.log(
  JSON.stringify({ text, shot, ms: Math.round(performance.now() - started) })
);
