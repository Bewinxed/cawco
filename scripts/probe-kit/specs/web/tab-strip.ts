/**
 * The session strip's own motion and its tab rules (owner: "right now
 * opening and closing a tab doesn't smoothly FLIP the rest of the items …
 * if i open a tab from the tab i'm already on it should open next to it not
 * at the end, and closing it returns me to the tab i was on, also need
 * middle click to close a tab and on the far next of the tabs there should
 * be a + tab to initiate a new session quickly"; "tabs should cast shadows
 * on each other"), on the built dashboard against a scratch fleet with six
 * real sessions, the top bar's hosted strip on the desk.
 *
 * Engine (Chromium, scrubbed over the Animation domain, anim.ts):
 * - close: a middle tab of five closed by its button; at 0, 25, 50, 75 and
 *   100% of the tabs' slide (`tab-slide`) every tab's left edge and
 *   opacity. The tabs after it move continuously from where they stood to
 *   where they land, the ones before it hold still, no tab that stays
 *   fades, and neither the strip nor its bar fades as a whole.
 * - open: the same, a tab opened from the second of five.
 * - middle click: closes its tab with the same slide; its press and its
 *   click take no default (no autoscroll, no paste, no link opening), no
 *   page opens, nothing scrolls, no field changes.
 * - opener: a tab opened from tab 2 of 5 opens third; closing it goes back
 *   to tab 2. Opened again, tab 4 shown, the new tab shown again and
 *   closed: its right neighbour is shown.
 * - "+": a session starts in the tab in front's machine, folder and
 *   harness, its tab third, after the one it came from, in front.
 *
 * Pixels (Chromium, light and dark): the strip at rest, the owner's case
 * (a chosen tab, an idle one, a working one), with the shadows and the "+"
 * laid hidden, against main's rendering (`--approve tab-strip` on main),
 * 0 px allowed. With them shown, the strip is captured for the owner's
 * review, and the pixels the shadows change are counted (notes).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame, one step at a time, as a hand makes them
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { Clock, overlay } from "../../anim";
import { diff } from "../../diff";
import { box } from "../../geom";
import { type Kit, open, SCALE, type Spec, type Theme } from "../../kit";

const BAR = ".slot-tabs";
const STRIP = `${BAR} .session-tabs`;
const TAB = `${BAR} .tab`;
const PLUS = `${BAR} .strip-new button`;
/** axe-core, injected into a page to read its accessibility. */
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** The sessions' titles; the sixth is the one opened from Jump. */
const TITLES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
const OPENING = "Foxtrot";
/** A reply long enough that its session stays working for the whole spec. */
const SLOW = "Keep working slowly";

/**
 * Waits until every run in the bar's strips that is moving and due to land
 * within 3s has landed, then 150ms. The kit's `settle` waits on the whole
 * page, where a working session's pane and the bar's own glass keep runs
 * of their own going for as long as it works; a working tab's status mark
 * runs long, and a run the clock left held does not move.
 */
async function settle(page: Page, ms = 150): Promise<void> {
  const stuck = await page.evaluate(async (sel) => {
    const frame = () =>
      new Promise<void>((done) => requestAnimationFrame(() => done()));
    const all = [...document.querySelectorAll(sel)]
      .flatMap((el) => el.getAnimations({ subtree: true }))
      .filter(
        (run) =>
          run.playState === "running" &&
          run.timeline instanceof DocumentTimeline
      );
    const at = new Map(all.map((run) => [run, Number(run.currentTime)]));
    await frame();
    await frame();
    const running = all.filter((run) => {
      const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
      const now = Number(run.currentTime);
      return (
        run.playState === "running" &&
        now > (at.get(run) ?? now) &&
        Number.isFinite(end) &&
        end - now <= 3000
      );
    });
    return Promise.race([
      Promise.all(
        running.map((run) => run.finished.catch(() => undefined))
      ).then(() => [] as string[]),
      new Promise<string[]>((done) =>
        setTimeout(
          () =>
            done(
              running
                .filter((run) => run.playState === "running")
                .map((run) => {
                  const target = (run.effect as KeyframeEffect | null)?.target;
                  return `${run instanceof CSSTransition ? `transition ${run.transitionProperty}` : `${run.constructor.name} ${run.id}`} on ${target?.tagName.toLowerCase()}.${String(target?.className).split(" ")[0]}`;
                })
            ),
          10_000
        )
      ),
    ]);
  }, BAR);
  if (stuck.length > 0) {
    throw new Error(
      `the strip's animations never landed within 10s: ${stuck.slice(0, 6).join("; ")}`
    );
  }
  await page.waitForTimeout(ms);
}

interface Read {
  id: string;
  left: number;
  opacity: number;
}

/** Every tab in the bar's strip, in order: its session, left edge and opacity. */
const read = (page: Page): Promise<Read[]> =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((tab) => ({
        id:
          tab
            .querySelector("[data-session-tab]")
            ?.getAttribute("data-session-tab") ?? "",
        left: tab.getBoundingClientRect().left,
        opacity: Number(getComputedStyle(tab).opacity),
      })),
    TAB
  );

/** The bar, the strip and its track: their opacity, and any run of their own on it. */
const wholes = (page: Page) =>
  page.evaluate(
    (sels) =>
      sels.flatMap((sel) =>
        [...document.querySelectorAll(sel)].map((el) => ({
          sel,
          opacity: Number(getComputedStyle(el).opacity),
          fading: el
            .getAnimations()
            .some(
              (run) =>
                (run instanceof CSSTransition &&
                  run.transitionProperty === "opacity") ||
                ((run.effect as KeyframeEffect | null)
                  ?.getKeyframes()
                  .some((frame) => "opacity" in frame) ??
                  false)
            ),
        }))
      ),
    [".top", BAR, `${BAR} .col`, STRIP, `${STRIP} .ff-tabs-list`]
  );

const order = (page: Page) =>
  read(page).then((tabs) => tabs.map((tab) => tab.id));
const chosen = (page: Page) =>
  page.evaluate(
    (sel) =>
      document
        .querySelector(`${sel} .ff-tab.selected [data-session-tab]`)
        ?.getAttribute("data-session-tab") ?? null,
    BAR
  );

/** Every endless run held at its start, so a capture never catches a pulse mid-way. */
const holdLoops = (page: Page) =>
  page.evaluate(() => {
    for (const run of document.getAnimations()) {
      if (run.effect?.getTiming().iterations === Number.POSITIVE_INFINITY) {
        run.pause();
        run.currentTime = 0;
      }
    }
  });

/** The centre of an element, for a real pointer. */
async function centre(page: Page, selector: string) {
  const b = await box(page, selector);
  if (!b) {
    throw new Error(`nothing drawn at ${selector}`);
  }
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}
const closeOf = (id: string) =>
  `${TAB}:has([data-session-tab="${id}"]) .tclose`;
const labelOf = (id: string) => `${TAB}:has([data-session-tab="${id}"]) .label`;

async function click(
  page: Page,
  selector: string,
  button: "left" | "middle" = "left"
) {
  const at = await centre(page, selector);
  await page.mouse.click(at.x, at.y, { button });
}

/** Opens a session by its title from Jump (⌘K), as a person reaches one that is not open. */
async function openByJump(page: Page, title: string) {
  await findInJump(page, title);
  await page.keyboard.press("Enter");
}

/** Jump (⌘K) open with `title` found, its row ready for Enter. */
async function findInJump(page: Page, title: string) {
  await page.keyboard.press("Control+k");
  const field = page.locator(".glass-face[data-face='jump'] input");
  await field.waitFor();
  await field.fill(title);
  await page
    .locator(".glass-face[data-face='jump']")
    .getByText(title, { exact: true })
    .first()
    .waitFor();
}

/** Waits until the strip holds `n` tabs, or throws. */
async function tabsAre(page: Page, n: number, ms = 60_000) {
  await page.waitForFunction(
    ([sel, want]) =>
      [...document.querySelectorAll(sel as string)].filter(
        (tab) => !((tab as HTMLElement).inert || tab.closest("[inert]"))
      ).length === want,
    [TAB, n] as const,
    { timeout: ms }
  );
  await settle(page);
}

/**
 * A desk page with `tabs` open in one group, `active` in front; `ctx` the
 * addresses the workspace holds for stored ones.
 */
async function strip(
  kit: Kit,
  base: string,
  tabs: string[],
  active: string,
  theme: Theme = "light",
  ctx: Record<string, { cwd: string; harness: string; machine: string }> = {}
): Promise<Page> {
  const page = await kit.page("desk", { theme });
  // A step that cannot happen fails, never waits for ever.
  page.setDefaultTimeout(60_000);
  const ws = {
    v: 1,
    root: { t: "l", id: "probe-leaf", tabs, active },
    focusedLeaf: "probe-leaf",
    ctx,
  };
  await page.context().addCookies([
    {
      name: "cawco-workspace",
      value: encodeURIComponent(JSON.stringify(ws)),
      url: base,
    },
  ]);
  await page.context().addInitScript((w) => {
    localStorage.setItem("cawco-workspace", JSON.stringify(w));
  }, ws);
  await open(page, `${base}/session/${active}`, `${TAB} .tclose`);
  await tabsAre(page, tabs.length);
  return page;
}

const near = (a: number, b: number, px = 1) => Math.abs(a - b) <= px;

/**
 * The strip's slides (`tab-slide`), held in the page: `catch` waits frame by
 * frame (up to 60) for them to start and holds each at its start, answering
 * how many; a fraction seeks each there and waits two frames; `play` lets
 * them run on.
 */
const slides = (page: Page, to: "catch" | "play" | number): Promise<number> =>
  page.evaluate(
    async ([sel, step]) => {
      const frame = () =>
        new Promise<void>((done) => requestAnimationFrame(() => done()));
      const runs = () =>
        [...document.querySelectorAll(sel as string)]
          .flatMap((el) => el.getAnimations({ subtree: true }))
          .filter((run) => run.id === "tab-slide");
      if (step === "catch") {
        for (let n = 0; n < 60 && runs().length === 0; n += 1) {
          await frame();
        }
        for (const run of runs()) {
          run.pause();
          run.currentTime = 0;
        }
      } else if (step === "play") {
        for (const run of runs()) {
          run.play();
        }
      } else {
        for (const run of runs()) {
          const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
          run.currentTime = end * (step as number);
        }
      }
      await frame();
      await frame();
      return runs().length;
    },
    [STRIP, to] as const
  );

/**
 * The slide's readings, held to the invariant: tabs that move go from where
 * they stood to where they land, monotonic, strictly between in the middle;
 * tabs that do not, hold; no tab that stays fades; nothing fades whole.
 */
async function scrub(
  kit: Kit,
  page: Page,
  what: string,
  act: () => Promise<unknown>,
  gone: string | null,
  hold: "clock" | "slides" = "clock"
) {
  const before = await read(page);
  const at: Read[][] = [];
  const whole: Awaited<ReturnType<typeof wholes>>[] = [];
  if (hold === "clock") {
    const clock = await Clock.on(page);
    await clock.catchRuns(act, STRIP);
    kit.check(
      `${what}: the tabs' slide runs (tab-slide)`,
      clock.runs.some((run) => run.name === "tab-slide"),
      clock.runs.map((run) => `${run.type} ${run.name || "?"}`).join(", ")
    );
    for (const f of FRACTIONS) {
      await clock.seek(f, "tab-slide");
      at.push(await read(page));
      whole.push(await wholes(page));
    }
    await clock.release();
  } else {
    // A change that navigates (Jump's open) does not land while the
    // document's clock is held still: the slides are held instead, the
    // frame they start in, and seeked there.
    await act();
    const caught = await slides(page, "catch");
    kit.check(
      `${what}: the tabs' slide runs (tab-slide)`,
      caught > 0,
      `${caught} tab-slide runs held`
    );
    for (const f of FRACTIONS) {
      await slides(page, f);
      at.push(await read(page));
      whole.push(await wholes(page));
    }
    await slides(page, "play");
  }
  await settle(page);
  const after = await read(page);
  const was = new Map(before.map((tab) => [tab.id, tab.left]));
  const lands = new Map(after.map((tab) => [tab.id, tab.left]));
  const lines: string[] = [];
  for (const [id, to] of lands) {
    const from = was.get(id);
    const xs = at.map(
      (tabs) => tabs.find((tab) => tab.id === id)?.left ?? Number.NaN
    );
    lines.push(`${id.slice(0, 4)} ${xs.map((x) => x.toFixed(1)).join(" → ")}`);
    if (from === undefined) {
      continue;
    }
    if (near(from, to, 0.5)) {
      kit.check(
        `${what}: ${id.slice(0, 4)} holds still`,
        xs.every((x) => near(x, from, 0.5)),
        xs.map((x) => x.toFixed(1)).join(" ")
      );
      continue;
    }
    const dir = Math.sign(to - from);
    const mid = xs[2] ?? Number.NaN;
    kit.check(
      `${what}: ${id.slice(0, 4)} slides ${from.toFixed(1)} → ${to.toFixed(1)}, continuously`,
      near(xs[0] ?? Number.NaN, from) &&
        near(xs.at(-1) ?? Number.NaN, to) &&
        xs.every(
          (x, i) => i === 0 || Math.sign(x - (xs[i - 1] ?? x)) !== -dir
        ) &&
        Math.abs(mid - from) > 1 &&
        Math.abs(mid - to) > 1,
      xs.map((x) => x.toFixed(1)).join(" → ")
    );
  }
  const staying = at.flatMap((tabs) => tabs.filter((tab) => tab.id !== gone));
  kit.check(
    `${what}: no tab that stays fades`,
    staying.every((tab) => tab.opacity === 1),
    staying
      .filter((tab) => tab.opacity !== 1)
      .map((tab) => `${tab.id.slice(0, 4)} ${tab.opacity}`)
      .join(", ") || "all at 1"
  );
  const faded = whole.flat().filter((w) => w.opacity !== 1 || w.fading);
  kit.check(
    `${what}: neither the bar nor the strip fades as a whole`,
    faded.length === 0,
    faded
      .map((w) => `${w.sel} ${w.opacity}${w.fading ? " fading" : ""}`)
      .join(", ") || "opacity 1, no fade, at every fraction"
  );
  if (gone) {
    const leaving = at.map(
      (tabs) => tabs.find((tab) => tab.id === gone)?.opacity ?? 0
    );
    kit.note(
      `${what}: the closing tab's own opacity ${leaving.map((o) => o.toFixed(2)).join(" → ")}`
    );
  }
  kit.note(`${what}: left edges at 0/25/50/75/100% — ${lines.join("; ")}`);
}

async function closeAndOpen(kit: Kit, base: string, ids: string[]) {
  const five = ids.slice(0, 5);
  const [first, second, middle] = five as [string, string, string];

  const page = await strip(kit, base, five, first);
  await scrub(kit, page, "close", () => click(page, closeOf(middle)), middle);
  kit.check(
    "close: the middle tab is gone",
    !(await order(page)).includes(middle)
  );
  await page.close();

  const opening = ids[5] as string;
  const page2 = await strip(kit, base, five, second);
  // Jump is found before the clock is held; the clock catches the open.
  await findInJump(page2, OPENING);
  await scrub(
    kit,
    page2,
    "open",
    () => page2.keyboard.press("Enter"),
    null,
    "slides"
  );
  const now = await order(page2);
  kit.check(
    "open: the new tab opens just after the tab it was opened from (3rd of 6)",
    now.indexOf(opening) === 2,
    now.map((id) => id.slice(0, 4)).join(" ")
  );
  await page2.close();
}

async function middleClick(kit: Kit, base: string, ids: string[]) {
  const five = ids.slice(0, 5);
  const [first, , middle] = five as [string, string, string];
  const page = await strip(kit, base, five, first);
  await page.evaluate(() => {
    const w = window as unknown as { __mid: string[] };
    w.__mid = [];
    for (const type of ["mousedown", "mouseup", "auxclick"]) {
      window.addEventListener(type, (event) => {
        const e = event as MouseEvent;
        if (e.button === 1) {
          w.__mid.push(`${type} ${e.defaultPrevented ? "prevented" : "open"}`);
        }
      });
    }
  });
  const pages = page.context().pages().length;
  const state = () =>
    page.evaluate(() => ({
      scrolls: [...document.querySelectorAll("*")]
        .filter((el) => el.scrollTop || el.scrollLeft)
        .map(
          (el) =>
            `${el.tagName}.${el.className}:${el.scrollTop},${el.scrollLeft}`
        )
        .join("|"),
      fields: [...document.querySelectorAll("textarea, input")]
        .map((el) => (el as HTMLInputElement).value)
        .join("|"),
      focus: document.activeElement?.tagName ?? "",
    }));
  const was = await state();
  await scrub(
    kit,
    page,
    "middle click",
    () => click(page, labelOf(middle), "middle"),
    middle
  );
  const heard = await page.evaluate(
    () => (window as unknown as { __mid: string[] }).__mid
  );
  const now = await state();
  kit.check(
    "middle click: the tab is closed",
    !(await order(page)).includes(middle)
  );
  kit.check(
    "middle click: its press and its click take no default (no autoscroll, paste or link)",
    heard.includes("mousedown prevented") &&
      heard.includes("auxclick prevented") &&
      !heard.some(
        (line) => line.endsWith("open") && !line.startsWith("mouseup")
      ),
    heard.join(", ")
  );
  kit.check(
    "middle click: no page opens",
    page.context().pages().length === pages
  );
  kit.check(
    "middle click: nothing scrolls, no field changes",
    now.scrolls === was.scrolls &&
      now.fields === was.fields &&
      now.focus === was.focus,
    `scrolls ${JSON.stringify(now.scrolls === was.scrolls)}, fields ${JSON.stringify(now.fields === was.fields)}, focus ${was.focus} → ${now.focus}`
  );
  await page.close();
}

async function opener(kit: Kit, base: string, ids: string[]) {
  const five = ids.slice(0, 5);
  const [, second, third, fourth] = five as [string, string, string, string];
  const opening = ids[5] as string;
  const page = await strip(kit, base, five, second);

  await openByJump(page, OPENING);
  await tabsAre(page, 6);
  let now = await order(page);
  kit.check(
    "opener: opened from tab 2 of 5, the new tab is the 3rd",
    now.indexOf(opening) === 2 && (await chosen(page)) === opening,
    now.map((id) => id.slice(0, 4)).join(" ")
  );
  await click(page, closeOf(opening));
  await tabsAre(page, 5);
  kit.check(
    "opener: closing it shows tab 2 again",
    (await chosen(page)) === second,
    `in front: ${(await chosen(page))?.slice(0, 4)}`
  );

  await openByJump(page, OPENING);
  await tabsAre(page, 6);
  now = await order(page);
  await click(page, labelOf(fourth));
  await settle(page);
  await click(page, labelOf(opening));
  await settle(page);
  await click(page, closeOf(opening));
  await tabsAre(page, 5);
  kit.check(
    "opener: switched away and back, closing it shows its right neighbour",
    (await chosen(page)) === third,
    `opened at ${now.indexOf(opening) + 1}; in front: ${(await chosen(page))?.slice(0, 4)}, right neighbour ${third.slice(0, 4)}`
  );
  await page.close();
}

async function plus(
  kit: Kit,
  base: string,
  ids: string[],
  fleet: KitFleetLike
) {
  const five = ids.slice(0, 5);
  const second = five[1] as string;
  const page = await strip(kit, base, five, second);
  const at = await page.evaluate(
    ([tab, plusSel]) => {
      const last = [...document.querySelectorAll(tab)].at(-1);
      const plusEl = document.querySelector(plusSel);
      const pad = last
        ? Number.parseFloat(
            getComputedStyle(
              last.querySelector(".ff-tab") as Element
            ).getPropertyValue("--px")
          )
        : Number.NaN;
      const r = last?.getBoundingClientRect();
      const p = plusEl?.getBoundingClientRect();
      const glyph = plusEl?.querySelector("svg")?.getBoundingClientRect();
      const close = last?.querySelector(".tclose");
      return {
        gap: r && p ? p.left - r.right : Number.NaN,
        pad,
        mid:
          r && p ? p.top + p.height / 2 - (r.top + r.height / 2) : Number.NaN,
        glyph: glyph ? `${glyph.width}×${glyph.height}` : "none",
        ink: plusEl ? getComputedStyle(plusEl).color : "",
        closeInk: close ? getComputedStyle(close).color : "",
        inTablist: Boolean(plusEl?.closest('[role="tablist"]')),
      };
    },
    [TAB, PLUS] as const
  );
  kit.check(
    '"+": it stands a tab\'s inner pad after the last tab, centred on the row',
    Math.abs(at.gap - at.pad) <= 0.5 && Math.abs(at.mid) <= 0.5,
    `gap ${at.gap.toFixed(1)}px, pad ${at.pad}px, off centre ${at.mid.toFixed(1)}px`
  );
  kit.check(
    '"+": the close X\'s look at rest (its 16px glyph and resting ink)',
    at.glyph === "16×16" && at.ink === at.closeInk,
    `glyph ${at.glyph}, ink ${at.ink} against the X's ${at.closeInk}`
  );
  kit.check('"+": it stands outside the tablist', !at.inTablist);
  const named = await page.evaluate(
    (sel) => document.querySelector(sel)?.getAttribute("aria-label"),
    PLUS
  );
  kit.check(
    '"+": its name is "New session"',
    named === "New session",
    named ?? "none"
  );
  await a11y(kit, page);
  await click(page, PLUS);
  await tabsAre(page, 6, 90_000);
  const now = await order(page);
  const made = now.find((id) => !five.includes(id)) ?? "";
  kit.check(
    '"+": the new session\'s tab is the 3rd, after the tab in front, and in front',
    now.indexOf(made) === 2 && (await chosen(page)) === made,
    now.map((id) => id.slice(0, 4)).join(" ")
  );
  const row = (id: string) =>
    fleet.query<{ cwd: string; harness: string; machine_id: string }>(
      "SELECT machine_id, cwd, harness FROM instances WHERE id = ?",
      id
    )[0];
  const was = row(second);
  const got = row(made);
  kit.check(
    '"+": it runs in the tab in front\'s machine, folder and harness',
    Boolean(
      was &&
        got &&
        was.machine_id === got.machine_id &&
        was.cwd === got.cwd &&
        was.harness === got.harness
    ),
    `${JSON.stringify(got)} against ${JSON.stringify(was)}`
  );
  await page.close();
}

/**
 * A start the hub refuses stays on the "+": its failed ink, its tooltip
 * open with the reason, the reason as its description, and no toast; the
 * next press clears it. The tab in front is a session on a machine the hub
 * does not know.
 */
async function refused(kit: Kit, base: string, ids: string[]) {
  const ghost = crypto.randomUUID();
  const first = ids[0] as string;
  const page = await strip(kit, base, [ghost, first], ghost, "light", {
    [ghost]: {
      machine: "probe-no-such-machine",
      cwd: "/nowhere",
      harness: "claude",
    },
  });
  await click(page, PLUS);
  await page.waitForSelector(`${PLUS}[data-refused]`, { timeout: 90_000 });
  const shown = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const described = el.getAttribute("aria-describedby");
    return {
      ink: getComputedStyle(el).color,
      fail: getComputedStyle(document.documentElement)
        .getPropertyValue("--status-fail-glyph")
        .trim(),
      description: described
        ? (document.getElementById(described)?.textContent ?? "")
        : "",
      tip:
        document.querySelector('[data-slot="tooltip-content"]')?.textContent ??
        "",
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
    };
  }, PLUS);
  kit.check(
    '"+" refused: the reason is its description and its open tooltip, with no toast',
    shown.description.startsWith("Couldn't start a session: ") &&
      shown.description.length > "Couldn't start a session: ".length &&
      shown.tip.includes("Couldn't start a session") &&
      shown.toasts === 0,
    `description "${shown.description}"; tooltip "${shown.tip.trim()}"; ${shown.toasts} toasts`
  );
  kit.check(
    '"+" refused: it wears the failed status ink',
    shown.ink !== "" &&
      (await page.evaluate(
        ([ink]) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--status-fail-glyph)";
          document.body.append(probe);
          const want = getComputedStyle(probe).color;
          probe.remove();
          return want === ink;
        },
        [shown.ink] as const
      )),
    shown.ink
  );
  await click(page, labelOf(first));
  await settle(page);
  await click(page, PLUS);
  await tabsAre(page, 3, 90_000);
  kit.check(
    '"+" refused: the next press clears it',
    (await page.locator(`${PLUS}[data-refused]`).count()) === 0 &&
      (await page.evaluate(
        (sel) => document.querySelector(sel)?.getAttribute("aria-describedby"),
        PLUS
      )) === null
  );
  await page.close();
}

/** axe on the bar's strips: no violation, the tablist holding tabs alone. */
async function a11y(kit: Kit, page: Page) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(
    (sel) =>
      (
        window as unknown as {
          axe: {
            run: (
              context: string,
              options: object
            ) => Promise<{
              violations: {
                id: string;
                nodes: { failureSummary: string; target: string[] }[];
              }[];
            }>;
          };
        }
      ).axe
        .run(sel, { resultTypes: ["violations"] })
        .then((r) => {
          // Every exposed control in the tablist that is not a tab, and
          // whose tab it belongs to (none: it stands in the tablist alone).
          const others = [
            ...document.querySelectorAll(
              `${sel} [role="tablist"] :is(button, a[href], [tabindex])`
            ),
          ].filter(
            (el) =>
              el.getAttribute("role") !== "tab" &&
              !el.closest('[aria-hidden="true"]')
          );
          return {
            violations: r.violations.map(
              (v) =>
                `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary.replace(/\s+/g, " ")}`).join("; ")}`
            ),
            loose: others
              .filter((el) => !el.closest(".tab"))
              .map((el) => el.outerHTML.slice(0, 80)),
            tabControls: [
              ...new Set(
                others
                  .filter((el) => el.closest(".tab"))
                  .map(
                    (el) =>
                      el.getAttribute("aria-label")?.split(" for ")[0] ??
                      el.className
                  )
              ),
            ],
          };
        }),
    BAR
  );
  kit.check(
    "axe: the tablist holds tabs alone (no control in it is exposed but a tab)",
    result.loose.length === 0 && result.tabControls.length === 0,
    [...result.loose, ...result.tabControls].join(", ") || "tabs alone"
  );
  kit.check(
    "axe: no violation on the bar's strip (aria-required-children included)",
    result.violations.length === 0,
    result.violations.join(" | ") || "none"
  );
}

/**
 * A tab from the keyboard (WAI-ARIA APG, Tabs): Delete on a focused tab
 * closes it, the focus on the tab that followed it, else the one before,
 * and the tab in front unchanged when it was not the one; Shift+F10 and the
 * menu key open its menu.
 */
async function keyboard(kit: Kit, base: string, ids: string[]) {
  const five = ids.slice(0, 5);
  const [, second, third, fourth, fifth] = five as [
    string,
    string,
    string,
    string,
    string,
  ];
  const page = await strip(kit, base, five, second);
  const tab = (id: string) =>
    page.locator(`${BAR} [role="tab"][data-session-tab="${id}"]`);
  const focused = () =>
    page.evaluate(
      () =>
        document.activeElement?.getAttribute("data-session-tab") ?? "nothing"
    );
  await tab(third).focus();
  await page.keyboard.press("Delete");
  await tabsAre(page, 4);
  kit.check(
    "keyboard: Delete closes the focused tab; focus on the tab that followed; the tab in front unchanged",
    !(await order(page)).includes(third) &&
      (await focused()) === fourth &&
      (await chosen(page)) === second,
    `focus ${(await focused()).slice(0, 4)}, in front ${(await chosen(page))?.slice(0, 4)}`
  );
  await tab(fifth).focus();
  await page.keyboard.press("Delete");
  await tabsAre(page, 3);
  kit.check(
    "keyboard: Delete on the last tab puts the focus on the one before it",
    (await focused()) === fourth,
    `focus ${(await focused()).slice(0, 4)}`
  );
  const menu = page.locator(
    "[data-slot='context-menu-content'][data-state='open']"
  );
  for (const keys of ["Shift+F10", "ContextMenu"]) {
    await tab(fourth).focus();
    await page.keyboard.press(keys);
    const opened = await menu
      .first()
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false
      );
    kit.check(
      `keyboard: ${keys} on a tab opens its menu`,
      opened && (await menu.getByText("Close", { exact: true }).count()) > 0
    );
    await page.keyboard.press("Escape");
    await menu.first().waitFor({ state: "detached", timeout: 5000 });
  }
  await page.close();
}

interface KitFleetLike {
  api: <T>(path: string, body?: unknown) => Promise<T>;
  base: string;
  query: <T>(sql: string, ...params: (string | number)[]) => T[];
  repo: string;
}

/** What a scrolling track shows past each edge, and the fade it draws there. */
interface EdgeRead {
  /** The tabs cut at the start and end edges, by name. */
  cut: { end: string[]; start: string[] };
  /** The fade drawn at each edge: its length less any cap, in px. */
  fade: { end: number; start: number };
  /** Whether tabs lie past each edge. */
  hidden: { end: boolean; start: boolean };
  scrollLeft: number;
}

const readEdges = (page: Page, track: string): Promise<EdgeRead> =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) {
      throw new Error(`no track at ${sel}`);
    }
    const style = getComputedStyle(el);
    const len = (name: string) => {
      const value = Number.parseFloat(style.getPropertyValue(name));
      return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    };
    const edges = el.getBoundingClientRect();
    const tabs = [...el.querySelectorAll<HTMLElement>("[role='tab']")].map(
      (tab) => ({
        name: (tab.textContent ?? "").trim(),
        r: tab.getBoundingClientRect(),
      })
    );
    return {
      cut: {
        start: tabs
          .filter(({ r }) => r.left < edges.left - 0.5)
          .map(({ name }) => name),
        end: tabs
          .filter(({ r }) => r.right > edges.right + 0.5)
          .map(({ name }) => name),
      },
      fade: {
        start: Math.min(len("--fade-start"), len("--fade-cap-start")),
        end: Math.min(len("--fade-end"), len("--fade-cap-end")),
      },
      hidden: {
        start: el.scrollLeft > 0.5,
        end: el.scrollLeft + el.clientWidth < el.scrollWidth - 0.5,
      },
      scrollLeft: Math.round(el.scrollLeft),
    };
  }, track);

/**
 * The project page's view strip (the kit's scrolling TabsList), at a
 * phone's 390 and a tablet's 768: wherever tabs lie past an edge, that edge
 * draws its fade, at rest with the first view chosen, with a later one
 * chosen, and scrolled to its end.
 */
async function projectStrip(kit: Kit, base: string, fleet: KitFleetLike) {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Routines",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  // Kept views: each is a tab after the project's own (Board, Table,
  // Pipeline), so the strip runs past a phone's and a tablet's width.
  for (const name of ["weekly-review", "release-notes", "on-call-rota"]) {
    const put = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: `views/${name}.json`,
          content: "{}\n",
          message: `Keep the view ${name}`,
        }),
      }
    );
    if (!put.ok) {
      throw new Error(`views/${name}.json: ${put.status} ${await put.text()}`);
    }
  }
  for (const width of [390, 768]) {
    for (const view of ["board", "pipeline"]) {
      for (const [state, at] of await projectEdges(
        kit,
        `${base}/project/${project.id}${view === "board" ? "" : `?view=${view}`}`,
        width
      )) {
        edgeCheck(kit, `project strip ${width}: ${view} chosen${state}`, at);
      }
    }
  }
}

const PROJECT_TRACK = ".strip .ff-tabs-list";

/** The project strip's edges at `width`: as it opens, and scrolled to its end. */
async function projectEdges(
  kit: Kit,
  url: string,
  width: number
): Promise<[string, EdgeRead][]> {
  const page = await kit.page(width === 390 ? "phone" : "desk");
  if (width !== 390) {
    await page.setViewportSize({ width, height: 1024 });
  }
  page.setDefaultTimeout(60_000);
  await open(page, url, `${PROJECT_TRACK} [role='tab']`);
  await page.waitForFunction(
    (sel) => document.querySelectorAll(`${sel} [role='tab']`).length >= 6,
    PROJECT_TRACK
  );
  await page.waitForTimeout(600);
  const opened = await readEdges(page, PROJECT_TRACK);
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, PROJECT_TRACK);
  await page.waitForTimeout(300);
  const ended = await readEdges(page, PROJECT_TRACK);
  await page.close();
  return [
    ["", opened],
    [", scrolled to the end", ended],
  ];
}

/** Every edge with tabs past it draws its fade, of at least 8px. */
function edgeCheck(kit: Kit, name: string, at: EdgeRead) {
  const side = (edge: "end" | "start") =>
    at.hidden[edge]
      ? `hides (cut: ${at.cut[edge].join(", ") || "none"}), fade ${at.fade[edge]}px`
      : "clear";
  const overflows = at.hidden.start || at.hidden.end;
  const missing = (["start", "end"] as const).filter(
    (edge) => at.hidden[edge] && !(at.fade[edge] >= 8)
  );
  kit.check(
    `${name}: every edge with tabs past it draws its fade (≥ 8px)`,
    overflows && missing.length === 0,
    `${overflows ? "" : "nothing past either edge; "}start ${side("start")}; end ${side("end")}; scrollLeft ${at.scrollLeft}`
  );
}

/**
 * Every seam between two tabs: where the edge of the tab in front stands,
 * which way the tab behind lies from it (1 right, -1 left), the height to
 * read it at (the tabs' middle), and the two tabs' names.
 */
const seams = (page: Page) =>
  page.evaluate((sel) => {
    const tabs = [...document.querySelectorAll<HTMLElement>(sel)];
    const name = (tab: HTMLElement) =>
      tab.querySelector(".label .text")?.textContent ?? "?";
    return tabs.slice(0, -1).map((left, i) => {
      const right = tabs[i + 1] as HTMLElement;
      const l = left.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      const leftInFront =
        getComputedStyle(left).getPropertyValue("--under-end").trim() !== "1";
      return {
        name: `${name(left)}|${name(right)}`,
        edge: leftInFront ? l.right : r.left,
        toward: leftInFront ? 1 : -1,
        y: l.top + l.height / 2,
        chosenInFront: (leftInFront ? left : right).hasAttribute("data-chosen"),
      };
    });
  }, TAB);

/** A pixel's relative luminance (WCAG 2), in a capture. */
function lum(png: PNG, at: { x: number; y: number }): number {
  const i = (png.width * at.y + at.x) * 4;
  const [r, g, b] = [0, 1, 2].map((k) => {
    const v = (png.data[i + k] ?? 0) / 255;
    return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two luminances (WCAG 2). */
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The strip's region for a capture, 12px of room round it. */
async function stripClip(page: Page) {
  const b = await box(page, STRIP);
  if (!b) {
    throw new Error("no session strip drawn");
  }
  return {
    x: Math.max(0, b.left - 12),
    y: Math.max(0, b.top),
    width: b.width + 24,
    height: b.height + 12,
  };
}

async function pixels(kit: Kit, base: string, ids: string[]) {
  // The owner's case: a chosen tab, an idle one, a working one.
  const three = [ids[0], ids[1], ids[4]] as string[];
  for (const theme of ["light", "dark"] as Theme[]) {
    const page = await strip(kit, base, three, three[0] as string, theme);
    await page.mouse.move(2, 880);
    await settle(page);
    await holdLoops(page);
    const clip = await stripClip(page);
    await overlay(page, [
      { selector: `${BAR} .shade`, style: { visibility: "hidden" } },
      { selector: `${BAR} .strip-new`, style: { visibility: "hidden" } },
    ]);
    await diff(kit, page, `rest-${theme}`, { clip });
    if (!kit.approve) {
      await overlay(page, [
        { selector: `${BAR} .shade`, style: { visibility: "hidden" } },
      ]);
      const hidden = PNG.sync.read(
        await page.screenshot({ clip, animations: "allow" })
      );
      await overlay(page, []);
      await holdLoops(page);
      await diff(kit, page, `shadows-${theme}`, { clip });
      const shown = PNG.sync.read(
        await readFile(join(kit.out, `shadows-${theme}.png`))
      );
      const changed = pixelmatch(
        hidden.data,
        shown.data,
        null,
        hidden.width,
        hidden.height,
        { threshold: 0 }
      );
      kit.note(
        `${theme}: the tabs' edges change ${changed} device px of the strip (${hidden.width}×${hidden.height})`
      );
      await glyphInk(kit, page, theme, clip, shown);
      await seamInk(kit, page, theme, clip, hidden, shown);
    }
    await page.close();
  }
}

type Clip = Awaited<ReturnType<typeof stripClip>>;

/**
 * The "+" against a resting tab's X: their computed ink, and the ink drawn,
 * each glyph's inkiest pixel (lightest at night, darkest by day) in the
 * capture.
 */
async function glyphInk(
  kit: Kit,
  page: Page,
  theme: Theme,
  clip: Clip,
  shown: PNG
) {
  const glyphs = await page.evaluate(
    ([plusSel, tabSel]) => {
      const plusSvg = document.querySelector(`${plusSel} svg`);
      const xSvg = document.querySelector(
        `${tabSel}:not([data-chosen]) .tclose svg`
      );
      const boxOf = (el: Element | null) => {
        const r = el?.getBoundingClientRect();
        return r
          ? { left: r.left, top: r.top, width: r.width, height: r.height }
          : null;
      };
      return {
        plus: plusSvg ? getComputedStyle(plusSvg).color : "",
        x: xSvg ? getComputedStyle(xSvg).color : "",
        plusBox: boxOf(plusSvg),
        xBox: boxOf(xSvg),
      };
    },
    [PLUS, TAB] as const
  );
  const peak = (b: typeof glyphs.plusBox) => {
    if (!b) {
      return Number.NaN;
    }
    let best = theme === "dark" ? 0 : 1;
    for (let y = b.top; y < b.top + b.height; y += 1 / SCALE) {
      for (let x = b.left; x < b.left + b.width; x += 1 / SCALE) {
        const l = lum(shown, {
          x: Math.round((x - clip.x) * SCALE),
          y: Math.round((y - clip.y) * SCALE),
        });
        best = theme === "dark" ? Math.max(best, l) : Math.min(best, l);
      }
    }
    return best;
  };
  const plusPeak = peak(glyphs.plusBox);
  const xPeak = peak(glyphs.xBox);
  kit.check(
    `${theme}: the "+" is the X's ink at rest, computed and drawn (inkiest pixels within 1.05:1)`,
    glyphs.plus === glyphs.x && contrast(plusPeak, xPeak) <= 1.05,
    `computed ${glyphs.plus} against ${glyphs.x}; drawn ${plusPeak.toFixed(4)} against ${xPeak.toFixed(4)} (${contrast(plusPeak, xPeak).toFixed(3)}:1)`
  );
}

/** Each seam's edge, read off the captures with the shades hidden and shown. */
async function seamInk(
  kit: Kit,
  page: Page,
  theme: Theme,
  clip: Clip,
  hidden: PNG,
  shown: PNG
) {
  for (const seam of await seams(page)) {
    const at = (x: number) => ({
      x: Math.round((x - clip.x) * SCALE),
      y: Math.round((seam.y - clip.y) * SCALE),
    });
    const behind = at(seam.edge + seam.toward * 1.5);
    const front = at(seam.edge - seam.toward * 2);
    const was = lum(hidden, behind);
    const now = lum(shown, behind);
    const frontInk = lum(shown, front);
    const numbers = `behind the edge ${contrast(was, now).toFixed(2)}:1 against unshaded; front card to behind ${contrast(frontInk, was).toFixed(2)}:1 → ${contrast(frontInk, now).toFixed(2)}:1`;
    // At night the chosen tab casts nothing (`tab-shade-chosen`): lit
    // ink beside its sheet, the lightest, only blurred its edge.
    if (theme === "dark" && seam.chosenInFront) {
      kit.check(
        `${theme}: the ${seam.name} seam, the chosen tab's, keeps its edge unblurred (no cast)`,
        contrast(frontInk, now) >= contrast(frontInk, was) - 0.005,
        numbers
      );
    } else {
      kit.check(
        `${theme}: the ${seam.name} seam's edge reads on the tab behind (its shade ≥ 1.10:1 against the tab's own ink)`,
        contrast(was, now) >= 1.1,
        numbers
      );
    }
  }
}

const spec: Spec = {
  name: "tab-strip",
  async run(kit) {
    const fleet = await kit.fleet((request: Seen) =>
      request.last.includes(SLOW)
        ? { everyMs: 3000, words: Array.from({ length: 120 }, () => "slowly") }
        : { everyMs: 20, words: ["Ready."] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const ids = await Promise.all(
      TITLES.map((title) => fleet.spawn("claude", title))
    );
    // Alpha and Echo work for the whole spec: the owner's case is a chosen
    // working tab, an idle one, and a working one.
    await fleet.send(ids[0] as string, SLOW);
    await fleet.send(ids[4] as string, SLOW);
    const base = await fleet.dashboard();
    if (process.env.PROBE_ONLY === "project-strip") {
      await projectStrip(kit, base, fleet);
      return;
    }
    await pixels(kit, base, ids);
    if (kit.approve) {
      return;
    }
    await closeAndOpen(kit, base, ids);
    await middleClick(kit, base, ids);
    await opener(kit, base, ids);
    await plus(kit, base, ids, fleet);
    await refused(kit, base, ids);
    await keyboard(kit, base, ids);
    await projectStrip(kit, base, fleet);
  },
};
export default spec;
