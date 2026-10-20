/**
 * The kit Button's label and its pending wording (DESIGN.md, Pending), on
 * the button bench (`/motion/button-pending`), read from the engine:
 *
 *  - label-only: as wide at rest, pending and done, and as wide as its
 *    label alone with its padding and edge (the pending wording is never
 *    drawn, so it never widens the cell); its label at the button's centre
 *    at rest; pending, the spinner at the label's start and the words at
 *    opacity 0 at the end of their fade (paused and seeked through the
 *    Animation domain), on --dur-morph and --ease-out; done, the check at
 *    the label's start, and the words back once it leaves;
 *  - the accessible name in each phase;
 *  - the icon cases' readings, for comparing with main's;
 *  - every label-only call site with a literal `pendingLabel`: its width.
 */
import type { Page } from "playwright-core";
import { type Kit, open, type Spec, settle } from "../../kit";

const CYCLE = '[data-case="label-cycle"]';

/** The cycling button's rects, opacity and name now. */
const readCycle = (page: Page) =>
  page.evaluate((selector) => {
    const press = document.querySelector<HTMLElement>(selector) as HTMLElement;
    const text = press.querySelector<HTMLElement>(
      '[data-slot="label-text"]'
    ) as HTMLElement;
    // The drawn label: its rest words' own box (the first MorphText), not
    // the cell they share with anything else.
    const label = text.querySelector<HTMLElement>(
      '[data-slot="morph-text"]'
    ) as HTMLElement;
    const slot = press.querySelector<HTMLElement>(
      '[data-slot="btn-slot"]'
    ) as HTMLElement;
    // The cell the slot draws in, not its glyph: the spinner turns, and a
    // turned box reaches past its own corners.
    const active = slot.querySelector<HTMLElement>(
      ':scope > [data-active="true"]:has(svg)'
    );
    const style = getComputedStyle(press);
    const px = (v: string) => Number.parseFloat(v);
    const outer = press.getBoundingClientRect();
    const words = label.getBoundingClientRect();
    return {
      width: outer.width,
      own:
        words.width +
        px(style.paddingInlineStart) +
        px(style.paddingInlineEnd) +
        px(style.borderInlineStartWidth) +
        px(style.borderInlineEndWidth),
      off: words.left + words.width / 2 - (outer.left + outer.width / 2),
      labelStart: words.left,
      slotDrawn: active
        ? {
            kind: active.querySelector('svg[data-slot="tick"]')
              ? "check"
              : "spinner",
            start: active.getBoundingClientRect().left,
          }
        : null,
      opacity: Number(getComputedStyle(text).opacity),
    };
  }, CYCLE);

const nameOf = (page: Page) =>
  page.locator(CYCLE).ariaSnapshot({ timeout: 3000 });

const cycle = (page: Page, how: "start" | "stop") =>
  page.evaluate((call) => {
    (
      window as unknown as {
        __buttonBench: Record<"start" | "stop", () => void>;
      }
    ).__buttonBench[call]();
  }, how);

/** The words' fade caught with the page's clock slowed, paused, and seeked to its end. */
async function scrubFade(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.02 });
  try {
    await cycle(page, "start");
    await page.waitForFunction(
      (selector) =>
        (
          document
            .querySelector(`${selector} [data-slot="label-text"]`)
            ?.getAnimations() ?? []
        ).some(
          (run) =>
            run instanceof CSSTransition &&
            run.transitionProperty === "opacity" &&
            run.playState === "running"
        ),
      CYCLE,
      { timeout: 15_000, polling: "raf" }
    );
    return await page.evaluate((selector) => {
      const text = document.querySelector<HTMLElement>(
        `${selector} [data-slot="label-text"]`
      ) as HTMLElement;
      const run = text
        .getAnimations()
        .find(
          (one) =>
            one instanceof CSSTransition && one.transitionProperty === "opacity"
        ) as CSSTransition;
      run.pause();
      const timing = run.effect?.getComputedTiming();
      run.currentTime = Number(timing?.duration);
      const atEnd = Number(getComputedStyle(text).opacity);
      run.finish();
      const root = getComputedStyle(document.documentElement);
      return {
        duration: Number(timing?.duration),
        easing: String(timing?.easing),
        tokens: {
          duration: root.getPropertyValue("--dur-morph").trim(),
          easing: root.getPropertyValue("--ease-out").trim(),
        },
        atEnd,
      };
    }, CYCLE);
  } finally {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await cdp.detach();
  }
}

const NUMBER = /-?\d*\.?\d+/g;
const numbers = (curve: string) =>
  (curve.match(NUMBER) ?? []).map(Number).join(",");
const ms = (token: string) =>
  token.endsWith("ms")
    ? Number.parseFloat(token)
    : Number.parseFloat(token) * 1000;

async function labelOnly(kit: Kit, page: Page) {
  const rest = await readCycle(page);
  const restName = await nameOf(page);
  const fade = await scrubFade(page);
  await settle(page, 100);
  const busy = await readCycle(page);
  const busyName = await nameOf(page);
  await cycle(page, "stop");
  await settle(page, 100);
  const done = await readCycle(page);
  const doneName = await nameOf(page);
  // The check holds --dur-hold (1.2s), then leaves as the words come back.
  await page.waitForTimeout(1500);
  await settle(page, 100);
  const after = await readCycle(page);

  kit.check(
    "label only: as wide at rest, pending and done",
    Math.abs(rest.width - busy.width) <= 0.5 &&
      Math.abs(rest.width - done.width) <= 0.5,
    `rest ${rest.width}, pending ${busy.width}, done ${done.width}`
  );
  kit.check(
    "label only: as wide as its label with its padding and edge",
    Math.abs(rest.width - rest.own) <= 0.5,
    `button ${rest.width}, label + padding + edge ${rest.own}`
  );
  kit.check(
    "label only, rest: the label at the button's centre",
    Math.abs(rest.off) <= 0.5,
    `off ${rest.off}`
  );
  kit.check(
    "label only, pending: the spinner at the label's start",
    busy.slotDrawn?.kind === "spinner" &&
      Math.abs(busy.slotDrawn.start - busy.labelStart) <= 0.5,
    JSON.stringify({ slot: busy.slotDrawn, labelStart: busy.labelStart })
  );
  kit.check(
    "label only, pending: the words at opacity 0 at the end of their fade, on --dur-morph and --ease-out",
    fade.atEnd === 0 &&
      Math.abs(fade.duration - ms(fade.tokens.duration)) < 0.5 &&
      numbers(fade.easing) === numbers(fade.tokens.easing),
    JSON.stringify(fade)
  );
  kit.check(
    "label only, done: the check at the label's start, the words still out",
    done.slotDrawn?.kind === "check" &&
      Math.abs(done.slotDrawn.start - done.labelStart) <= 0.5 &&
      done.opacity === 0,
    JSON.stringify({
      slot: done.slotDrawn,
      labelStart: done.labelStart,
      opacity: done.opacity,
    })
  );
  kit.check(
    "label only: the words back once the check leaves",
    after.slotDrawn === null && after.opacity === 1,
    JSON.stringify({ slot: after.slotDrawn, opacity: after.opacity })
  );
  // As main names them: the pending wording while pending, the button
  // aria-disabled (its press swallowed) while it is.
  kit.check(
    "label only: the accessible name, rest, pending and done",
    restName.trim() === '- button "Save"' &&
      busyName.trim() === '- button "Saving…" [disabled]' &&
      doneName.trim() === '- button "Save"',
    JSON.stringify([restName, busyName, doneName])
  );
}

async function iconCases(kit: Kit, page: Page) {
  const read = await page.evaluate(() =>
    ["icon-rest", "icon-pending"].map((at) => {
      const press = document.querySelector<HTMLElement>(
        `[data-case="${at}"]`
      ) as HTMLElement;
      const words = press.querySelector<HTMLElement>(
        '[data-slot="words"] > [data-active="true"]'
      ) as HTMLElement;
      const slot = press.querySelector<HTMLElement>(
        '[data-slot="btn-slot"]'
      ) as HTMLElement;
      const cell = press.querySelector<HTMLElement>(
        '[data-slot="words"]'
      ) as HTMLElement;
      const outer = press.getBoundingClientRect();
      return {
        at,
        width: outer.width,
        cell: cell.getBoundingClientRect().width,
        afterSlot:
          words.getBoundingClientRect().left -
          slot.getBoundingClientRect().right,
        gap: Number.parseFloat(getComputedStyle(press).columnGap),
        justify: getComputedStyle(cell).justifyItems,
      };
    })
  );
  for (const one of read) {
    kit.check(
      `beside an icon, ${one.at.slice(5)}: the wording right after the slot, the cell as wide as the wider wording`,
      Math.abs(one.afterSlot - one.gap) <= 0.5,
      JSON.stringify(one)
    );
  }
}

async function sites(kit: Kit, page: Page) {
  const widths = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-site]")].map((press) => ({
      site: press.dataset.site ?? "",
      width: press.getBoundingClientRect().width,
    }))
  );
  for (const { site, width } of widths) {
    kit.note(`site ${site}: ${width.toFixed(2)}px at rest`);
  }
}

const spec: Spec = {
  name: "button-pending",
  run: async (kit) => {
    const page = await kit.page("desk", { theme: "light" });
    await open(
      page,
      `${await kit.bench()}/motion/button-pending`,
      CYCLE,
      120_000
    );
    await page.waitForFunction(() => "__buttonBench" in window);
    await settle(page, 300);
    await iconCases(kit, page);
    await sites(kit, page);
    await labelOnly(kit, page);
    await page.close();
  },
};
export default spec;
