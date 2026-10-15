/**
 * Stage 1's browser step (prove-stage1.sh): the dashboard the built binary
 * serves, loaded in a headless Chromium (playwright-core, the cached
 * headless shell). It passes when the page shows the proof stack's own
 * session's answer, which the served bundle can only show by booting and
 * reading the live hub, and the page threw nothing.
 *
 *   bun proof-browser.ts <dashboard url> <stack-ready file> <done file>
 *
 * The stack-ready file (proof-stack.ts) names the session. The done file is
 * written whatever happens, so the stack held for this step stops waiting.
 */
import { chromium } from "playwright-core";

const [url, ready, done] = Bun.argv.slice(2);
if (!(url && ready && done)) {
  throw new Error(
    "Usage: proof-browser.ts <dashboard url> <stack-ready file> <done file>"
  );
}
/** What the stub harness answers proof-stack.ts's "binary proof" message with. */
const ANSWER = "proof answered: binary proof";
const started = performance.now();
const session = (await Bun.file(ready).text()).trim();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const thrown: string[] = [];
  const logged: string[] = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      logged.push(message.text());
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The stub harness's answer to the stack's message (proof-harnesses.ts):
  // on screen only once the bundle booted, its socket reached the hub, and
  // the session's transcript rendered.
  await page
    .getByText(ANSWER)
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(async (error: unknown) => {
      const seen = await page.evaluate(() => ({
        path: location.pathname,
        text: document.body.innerText.slice(0, 400),
      }));
      throw new Error(
        `The served dashboard did not show session ${session}'s answer: ${JSON.stringify(seen)}; page errors ${JSON.stringify(thrown)}; console errors ${JSON.stringify(logged.slice(0, 5))}`,
        { cause: error }
      );
    });
  if (thrown.length) {
    throw new Error(
      `The served dashboard threw ${thrown.length} page error${thrown.length === 1 ? "" : "s"}:\n${thrown.map((line) => `  ${line}`).join("\n")}`
    );
  }
  console.log(
    `served dashboard rendered session ${session} and its answer, no page errors${logged.length ? ` (${logged.length} console error${logged.length === 1 ? "" : "s"}: ${logged.join(" | ").slice(0, 300)})` : ""}: ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  await browser.close();
  await Bun.write(done, "");
}
