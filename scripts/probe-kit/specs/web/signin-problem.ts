/**
 * A stopped Claude Code sign-in (SigninPanel's problem) shows the daemon's
 * sentence, then each of the CLI's screen lines on its own line, as
 * packages/agent/src/login.ts sends them joined with "\n". On the
 * /motion/signin-problem bench (one sentence plus six lines, one of them
 * 240 characters, one an unbroken URL), at 390 and 1440: the problem's
 * computed `white-space` is `pre-line`, its text lays out in at least 7 line
 * boxes with no blank one before the sentence, and nothing in it scrolls
 * sideways (`scrollWidth` within `clientWidth`, the panel's too).
 *
 *   bun scripts/probe-kit/run.ts web signin-problem
 */
import type { Kit, Spec } from "../../kit";
import { open, settle } from "../../kit";

const PROBLEM = "[data-signin-problem]";
const LEGS = [
  { name: "390", view: "phone" },
  { name: "1440", view: "desk" },
] as const;

const spec: Spec = {
  name: "signin-problem",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    for (const leg of LEGS) {
      // biome-ignore lint/performance/noAwaitInLoops: one viewport at a time, each on its own page
      const page = await kit.page(leg.view);
      await open(page, `${bench}/motion/signin-problem`, PROBLEM);
      await settle(page, 400);
      const read = await page.evaluate((selector) => {
        const p = document.querySelector<HTMLElement>(selector);
        if (!p) {
          return null;
        }
        const range = document.createRange();
        range.selectNodeContents(p);
        const tops = new Set(
          [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top))
        );
        const panel = document.querySelector<HTMLElement>("[data-bench]");
        return {
          whiteSpace: getComputedStyle(p).whiteSpace,
          /** No newline of the markup's own before the sentence or after the screen. */
          trimmed: p.textContent === p.textContent?.trim(),
          lines: tops.size,
          scrollWidth: p.scrollWidth,
          clientWidth: p.clientWidth,
          benchScroll: panel ? panel.scrollWidth - panel.clientWidth : null,
          pageScroll:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        };
      }, PROBLEM);
      kit.check(
        `${leg.name}: the problem's lines stand apart and wrap inside the panel`,
        read !== null &&
          read.whiteSpace === "pre-line" &&
          read.trimmed &&
          read.lines >= 7 &&
          read.scrollWidth <= read.clientWidth &&
          read.benchScroll === 0 &&
          read.pageScroll <= 0,
        JSON.stringify(read)
      );
    }
  },
};

export default spec;
