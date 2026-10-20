/**
 * Two house rules read off the rendered page, on the benches (no hub):
 *
 * - A control keeps the platform's arrow; only a link takes the pointer
 *   hand (Tailwind v4's Preflight, tailwindcss.com/docs/upgrade-guide:
 *   "Buttons now use `cursor: default` instead of `cursor: pointer` to match
 *   the default browser behavior"; style-greps bans the utility and the
 *   declaration). Computed `cursor` is `default` on a kit Button, a setting
 *   chip, a tray chip, the usage strip and a transcript's disclosure head,
 *   and `pointer` on an `a[href]`.
 * - A transition's duration is its token through Tailwind's own
 *   `duration-(--dur-*)`, which sets `--tw-duration`, so a `transition-[…]`
 *   sorted after it keeps it: the new-session dialog's project and machine
 *   rows (`duration-(--dur-toggle)` beside `motion-safe:transition-[…]`)
 *   run every transitioned property over `--dur-toggle`, never the default.
 *
 *   bun scripts/probe-kit/run.ts web cursor-and-duration
 */
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROW = '[data-ns-pop] [data-slot="row"]';

/** The element's computed cursor, or null when nothing matches. */
const cursorOf = (page: Page, selector: string): Promise<string | null> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).cursor : null;
  }, selector);

/** Each transitioned property's duration in ms, and the token's, on the element. */
const durationsOf = (
  page: Page,
  selector: string,
  token: string
): Promise<{ durations: number[]; token: number } | null> =>
  page.evaluate(
    ([s, name]) => {
      const el = document.querySelector(s);
      if (!el) {
        return null;
      }
      const ms = (value: string) => {
        const v = value.trim();
        return v.endsWith("ms")
          ? Number.parseFloat(v)
          : Number.parseFloat(v) * 1000;
      };
      return {
        durations: getComputedStyle(el).transitionDuration.split(",").map(ms),
        token: ms(getComputedStyle(el).getPropertyValue(name)),
      };
    },
    [selector, token] as const
  );

const spec: Spec = {
  name: "cursor-and-duration",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    const page = await kit.page("desk", { theme: "light" });

    for (const control of ["project", "machines"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one popover at a time on one page
      await open(page, `${bench}/motion/chosen-hover?control=${control}`, ROW);
      await settle(page, 400);
      const read = await durationsOf(page, ROW, "--dur-toggle");
      kit.check(
        `the dialog's ${control} row runs every transition over --dur-toggle`,
        read !== null &&
          read.durations.length > 0 &&
          read.durations.every((d) => d === read.token),
        JSON.stringify(read)
      );
    }

    const defaults: [string, string, string][] = [
      [
        "/motion/chosen-hover",
        '[data-probe="lifetime"] button',
        "a setting chip",
      ],
      [
        "/motion/chosen-hover",
        '[data-probe="plan-ring"] button',
        "a tray chip",
      ],
      ["/motion/button-pending", '[data-slot="button"]', "a kit Button"],
      ["/motion/usage-relay", "[data-strip-hit]", "the usage strip"],
      [
        "/motion/head-tint",
        'button[data-slot="trow"]',
        "a transcript's tool row head",
      ],
    ];
    for (const [route, selector, what] of defaults) {
      // biome-ignore lint/performance/noAwaitInLoops: one bench at a time on one page
      await open(page, `${bench}${route}`, selector);
      await settle(page, 200);
      const cursor = await cursorOf(page, selector);
      kit.check(
        `${what} keeps the arrow`,
        cursor === "default",
        String(cursor)
      );
    }

    await open(page, `${bench}/motion/head-tint`, "a[href]");
    const link = await cursorOf(page, "a[href]");
    kit.check(
      "a link takes the pointer hand",
      link === "pointer",
      String(link)
    );
  },
};

export default spec;
