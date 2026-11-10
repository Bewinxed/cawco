/**
 * A rendered-checks read waits for the page to draw, and no rule passes on a
 * page that drew nothing.
 *
 * The command line read a page at `load`. On a dev server vite compiles a
 * route's modules on its first load, so 25 of 32 dev benches read that way
 * held 3 elements, and every rule passed on nothing (2026-11-04).
 * `untilDrawn` (rendered-checks.ts) waits until the scope draws something and
 * no element comes or goes for a quiet second, up to a bound, and says so
 * when the bound runs out; a read whose scope drew nothing fails every rule.
 *
 *  1. cold route: a `/motion/` bench on the dev server, opened at `load`:
 *     the wait ends once it has drawn, and the read is of a drawn page.
 *  2. late page: a page whose words come 2s after `load` and three more
 *     elements after them: the wait outlasts them, and the read is of the
 *     drawn page.
 *  3. blank page: nothing drawn: the wait says it drew nothing once its
 *     bound runs out, and every rule fails over that read.
 *  4. never still: an element added every 100ms: the wait says it was
 *     still drawing at its bound.
 *
 *   bun scripts/probe-kit/run.ts web drawn-wait
 */
import type { Page } from "playwright-core";
import { settle } from "../../kit";
import {
  RenderedChecks,
  RULES,
  saidOfDrawn,
  untilDrawn,
} from "../../rendered-checks";
import type { Kit, Spec } from "../../spec";

/** The bound the made-up pages wait to: theirs, not the read's 30s. */
const SHORT = { bound: 3000 };

/** Rendered checks whose report lands in `said`, not in the spec's own lines. */
const quietChecks = (kit: Kit, said: { line: string; ok: boolean }[]) =>
  new RenderedChecks(
    {
      ...kit,
      check: (line: string, ok: boolean) => {
        said.push({ line, ok });
        return ok;
      },
      note: () => undefined,
    },
    "drawn-wait",
    { noImpeccable: "drawn-wait reads whether the page drew, not its taste" }
  );

const LATE = `<!doctype html><body style="margin:0;font:16px sans-serif">
<script>
  setTimeout(() => {
    document.body.insertAdjacentHTML("beforeend", "<main><h1>Waiting runs</h1><p>Two sessions wait on you.</p></main>");
    let more = 0;
    const add = setInterval(() => {
      document.querySelector("main").insertAdjacentHTML("beforeend", "<p>One more.</p>");
      more += 1;
      if (more === 3) clearInterval(add);
    }, 200);
  }, 2000);
</script></body>`;

const NEVER_STILL = `<!doctype html><body style="margin:0;font:16px sans-serif"><ul></ul>
<script>
  setInterval(() => {
    document.querySelector("ul").insertAdjacentHTML("beforeend", "<li>tick</li>");
  }, 100);
</script></body>`;

const readOf = async (kit: Kit, page: Page) => {
  const said: { line: string; ok: boolean }[] = [];
  const checks = quietChecks(kit, said);
  await settle(page);
  const read = await checks.at(page, "as drawn");
  checks.report();
  return { read, said };
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "drawn-wait",
  run: async (kit) => {
    const page = await kit.page("desk");

    // 1. A dev route, opened at `load`.
    const bench = await kit.bench();
    await page.goto(`${bench}/motion/caw`, { waitUntil: "load" });
    const atLoad = await page.evaluate(
      () => document.querySelectorAll("*").length
    );
    const cold = await untilDrawn(page);
    const coldRead = await readOf(kit, page);
    kit.check(
      `drawn-wait: cold route, /motion/caw is read once drawn (${atLoad} elements at load, ${saidOfDrawn(cold)})`,
      cold.still && cold.drew && !coldRead.read.drewNothing,
      `drew nothing: ${coldRead.read.drewNothing}`
    );

    // 2. Words 2s after load, three more elements after them.
    await page.setContent(LATE);
    const late = await untilDrawn(page);
    const lateRead = await readOf(kit, page);
    const paragraphs = await page.locator("main p").count();
    kit.check(
      `drawn-wait: late page, the wait outlasts the late words and what follows them (${saidOfDrawn(late)})`,
      late.still &&
        late.ms >= 2000 &&
        paragraphs === 4 &&
        !lateRead.read.drewNothing,
      `${paragraphs} paragraphs at the read; drew nothing: ${lateRead.read.drewNothing}`
    );

    // 3. Nothing drawn.
    await page.setContent(
      "<!doctype html><body style='margin:0'><div></div></body>"
    );
    const blank = await untilDrawn(page, "body", SHORT);
    const blankRead = await readOf(kit, page);
    const passed = blankRead.said.filter((one) => one.ok);
    kit.check(
      `drawn-wait: blank page, the wait says it drew nothing and none of the ${RULES.length} rules passes (${saidOfDrawn(blank)})`,
      !(blank.still || blank.drew) &&
        blankRead.read.drewNothing &&
        blankRead.said.length >= RULES.length &&
        passed.length === 0,
      passed.length > 0
        ? `passed: ${passed.map((one) => one.line).join(" | ")}`
        : (blankRead.said[0]?.line ?? "no line said")
    );

    // 4. An element added every 100ms.
    await page.setContent(NEVER_STILL);
    const busy = await untilDrawn(page, "body", SHORT);
    kit.check(
      `drawn-wait: never still, the wait says the page was still drawing at its bound (${saidOfDrawn(busy)})`,
      busy.drew && !busy.still && saidOfDrawn(busy).startsWith("still drawing"),
      `${busy.elements} elements`
    );
    await page.close();
  },
};
export default spec;
