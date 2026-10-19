/**
 * The plan-view design preview (apps/dashboard/preview/plan-view): three
 * ways to draw the plan, One ledger, Lanes and Crew first, built and served
 * as the static page the stories' fixture also draws, at a desk's 1440×900
 * and a phone's 390×844 (touch), light and dark:
 *
 * - every step and delegate row leads with an 18px tile (the bordered step
 *   tile or the delegate's SessionMark), and no dot mark is drawn;
 * - a step opens to its description: in place on the desk and in One
 *   ledger on the phone, on a pushed page in Lanes and Crew first;
 * - no to-do, task or session id is written outside the Today frames;
 * - one Pick per variation, inside the page's one choice, Crew first marked
 *   Recommended;
 * - every caption starts "Desk ·" or "Phone ·";
 * - at 390 no words run past their frame and the page never scrolls
 *   sideways; every phone row shown is 44px or taller;
 * - the progress sweep runs only on a working delegate's line, and every
 *   working delegate's line shown has one; scrubbed through the DevTools
 *   protocol's Animation domain, the band crosses the fill from its start
 *   to its end over one run;
 * - nothing is written to the console as an error.
 *
 * Each frame is captured to `$TMPDIR/caps/` and the clone's `caps/`, the
 * live frames at two beats.
 *
 *   bun scripts/probe-kit/run.ts web plan-view-preview
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import type { Kit, Spec, View } from "../../kit";
import { open, ROOT, settle, THEMES } from "../../kit";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const OUT = join(DASHBOARD, "preview", "plan-view", "out");
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");
const CLONE_CAPS = join(ROOT, "caps");

/** A caption names its frame first: "Desk · …" or "Phone · …". */
const CAPTION = /^(Desk|Phone) · \S/;
const VARIATIONS = ["a", "b", "c"] as const;

async function build(): Promise<void> {
  const child = Bun.spawn(["bun", "preview/build.ts", "plan-view"], {
    cwd: DASHBOARD,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `preview build exited ${code}: ${(err || out).slice(-2000)}`
    );
  }
}

function serveFolder(): { base: string; stop: () => void } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(OUT, path === "/" ? "index.html" : path));
      return (await file.exists())
        ? new Response(file)
        : new Response("not found", { status: 404 });
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

/**
 * Installed on the page: whether an element is shown to the person (laid
 * out, visible, not inside a shut fold or a page pushed away).
 */
const SHOWN = `window.pvShown = (el) => {
  if (!el.checkVisibility({ visibilityProperty: true })) return false;
  if (el.closest('[data-slot="fold-body"]:not([data-open])')) return false;
  if (el.closest("[data-today]")) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};`;

declare global {
  interface Window {
    pvShown: (el: Element) => boolean;
  }
}

interface Faces {
  captions: string[];
  dots: number;
  /** Text outside Today that writes an id. */
  ids: string[];
  /** Rows whose lead is not an 18px tile. */
  leads: string[];
  overflows: string[];
  pageWide: { scroll: number; view: number };
  picks: { choices: number; perSection: string[]; recommended: string[] };
  rows: number;
  shortPhoneRows: string[];
}

const readFaces = (page: Page): Promise<Faces> =>
  page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('figure [data-slot="plan-row"]'),
    ].filter((row) => window.pvShown(row));
    const leads = rows.flatMap((row) => {
      const mark = row.querySelector(
        ':scope > .pv-lead [data-slot="step-tile"], :scope > .pv-lead [data-slot="tree-mark"]'
      );
      const words = row
        .querySelector('[data-slot="words"]')
        ?.textContent?.trim()
        .slice(0, 40);
      if (!mark) {
        return [`"${words}" leads with no tile`];
      }
      const box = mark.getBoundingClientRect();
      const bordered =
        mark.getAttribute("data-slot") === "tree-mark" ||
        getComputedStyle(mark).borderTopWidth === "1px";
      return Math.abs(box.width - 18) <= 0.5 &&
        Math.abs(box.height - 18) <= 0.5 &&
        bordered
        ? []
        : [
            `"${words}" leads with ${box.width.toFixed(1)}×${box.height.toFixed(1)}, border ${getComputedStyle(mark).borderTopWidth}`,
          ];
    });
    // biome-ignore lint/performance/useTopLevelRegex: it runs in the page, once per read
    const ID = /\b(td|tsk)-\d+\b|\b[a-z0-9]+-[a-z0-9]+-[0-9a-f]{3}\b/;
    const ids: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      if (ID.test(text) && !node.parentElement?.closest("[data-today]")) {
        ids.push(`"${text.trim().slice(0, 50)}"`);
      }
    }
    const overflows: string[] = [];
    for (const words of document.querySelectorAll(
      'figure :is([data-slot="words"], [data-slot="wait"], [data-slot="description"], [data-slot="report"])'
    )) {
      if (!window.pvShown(words)) {
        continue;
      }
      const frame = words.closest(
        '[data-slot="phone-screen"], [data-slot="side-card"]'
      );
      const box = words.getBoundingClientRect();
      const edge = frame?.getBoundingClientRect();
      const spills =
        !edge ||
        box.left < edge.left - 0.5 ||
        box.right > edge.right + 0.5 ||
        (words as HTMLElement).scrollWidth >
          (words as HTMLElement).clientWidth + 1;
      if (spills) {
        overflows.push(
          `${words.textContent?.trim().slice(0, 40)} (${Math.round(box.left)}–${Math.round(box.right)} in ${Math.round(edge?.left ?? 0)}–${Math.round(edge?.right ?? 0)})`
        );
      }
    }
    const shortPhoneRows = rows
      .filter(
        (row) =>
          row.closest('[data-slot="phone-screen"]') &&
          row.getBoundingClientRect().height < 44
      )
      .map(
        (row) =>
          `${row.querySelector('[data-slot="words"]')?.textContent?.trim()} ${row.getBoundingClientRect().height}px`
      );
    const sections = [...document.querySelectorAll("section[data-variation]")];
    return {
      captions: [...document.querySelectorAll("figcaption")]
        .filter((caption) => (caption as HTMLElement).offsetParent !== null)
        .map((caption) => (caption as HTMLElement).innerText.trim()),
      dots: document.querySelectorAll(
        '[data-slot="step-mark"], .pv-mark, .step-tick'
      ).length,
      ids,
      leads,
      overflows,
      pageWide: {
        scroll: document.scrollingElement?.scrollWidth ?? 0,
        view: window.innerWidth,
      },
      picks: {
        choices: document.querySelectorAll(
          '[data-cawco-choice="plan-variation"]'
        ).length,
        perSection: sections.map((section) => {
          const options = [
            ...section.querySelectorAll(
              '[data-cawco-choice="plan-variation"] [data-option]'
            ),
          ].map((option) => option.getAttribute("data-option"));
          return `${section.getAttribute("data-variation")}:${options.join(",")}`;
        }),
        recommended: sections
          .filter((section) => section.querySelector("[data-option] .dp-tag"))
          .map((section) => section.getAttribute("data-variation") ?? ""),
      },
      rows: rows.length,
      shortPhoneRows,
    };
  });

/** The sweeps on the page: on which delegates' lines they run. */
const readSweeps = (
  page: Page
): Promise<{ off: string[]; running: number; workingLines: number }> =>
  page.evaluate(() => {
    const runs = document
      .getAnimations()
      .filter(
        (run) =>
          run instanceof CSSAnimation &&
          run.animationName === "kit-skeleton-sweep" &&
          (run.effect as KeyframeEffect | null)?.target instanceof Element &&
          ((run.effect as KeyframeEffect).target as Element).matches(
            ".pv-sweep"
          )
      );
    const off: string[] = [];
    for (const run of runs) {
      const target = (run.effect as KeyframeEffect).target as Element;
      const status = target
        .closest('[data-slot="progress-line"]')
        ?.getAttribute("data-status");
      if (status !== "live") {
        off.push(`a sweep on a ${status} delegate's line`);
      }
    }
    const lines = [
      ...document.querySelectorAll('[data-slot="progress-line"]'),
    ].filter((line) => window.pvShown(line));
    for (const line of lines) {
      const status = line.getAttribute("data-status");
      const has = line.querySelector(".pv-sweep");
      if (status === "live" && !has) {
        off.push("a working delegate's line with no sweep");
      }
      if (status !== "live" && has) {
        off.push(`a sweep drawn on a ${status} delegate's line`);
      }
    }
    return {
      off,
      running: runs.length,
      workingLines: lines.filter(
        (line) => line.getAttribute("data-status") === "live"
      ).length,
    };
  });

/** Where the band stands across its fill, -1 (before it) to 1 (past it). */
const bandAt = (page: Page, within: string): Promise<number> =>
  page.evaluate((selector) => {
    const band = document.querySelector(`${selector} .pv-sweep`);
    const box = band?.parentElement?.getBoundingClientRect();
    const at = band?.getBoundingClientRect();
    return box && at && box.width > 0
      ? (at.left - box.left) / box.width
      : Number.NaN;
  }, within);

/**
 * Scrubs the sweep on one frame's working delegate: its run restarted and
 * held on the protocol's clock, then seeked through its length.
 */
async function scrubSweep(
  page: Page,
  within: string
): Promise<{ at: number[]; length: number }> {
  const clock = await Clock.on(page);
  await page.locator(within).scrollIntoViewIfNeeded();
  await clock.catchRuns(
    () =>
      page.evaluate((selector) => {
        for (const band of document.querySelectorAll<HTMLElement>(
          `${selector} .pv-sweep`
        )) {
          band.style.animationName = "none";
          band.getBoundingClientRect();
          band.style.animationName = "";
        }
      }, within),
    within
  );
  const length = clock.length("kit-skeleton-sweep");
  const at: number[] = [];
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) {
    // biome-ignore lint/performance/noAwaitInLoops: one point on the clock at a time
    await clock.seek(fraction, "kit-skeleton-sweep");
    at.push(await bandAt(page, within));
  }
  await clock.release();
  return { at, length };
}

/** Opens a step from its words in each variation's first frame of a kind, and reads what opened. */
async function openStep(page: Page, kind: "desk" | "phone"): Promise<string[]> {
  const faults: string[] = [];
  for (const variation of VARIATIONS) {
    const figure = `section[data-variation="${variation}"] .frames > figure:nth-child(${kind === "phone" ? 2 : 1})`;
    const words = page
      .locator(
        `${figure} [data-row="a1"] > [data-slot="plan-row"] [data-slot="words"]`
      )
      .first();
    // biome-ignore lint/performance/noAwaitInLoops: one variation at a time
    await words.scrollIntoViewIfNeeded();
    await words.click();
    await page.waitForTimeout(450);
    const read = await page.evaluate(
      ([selector, paged]) => {
        const frame = document.querySelector(selector);
        const description = paged
          ? frame?.querySelector(
              '[data-slot="pushed-page"] [data-slot="description"]'
            )
          : frame?.querySelector(
              '[data-row="a1"] [data-slot="fold-body"][data-open] [data-slot="description"]'
            );
        const box = description?.getBoundingClientRect();
        const stack = frame
          ?.querySelector('[data-slot="push-stack"]')
          ?.getBoundingClientRect();
        return {
          height: box?.height ?? 0,
          shown: !!description && window.pvShown(description),
          text: description?.textContent?.trim().slice(0, 30) ?? "",
          inPlace: !paged || (!!stack && !!box && box.left >= stack.left - 1),
        };
      },
      [figure, kind === "phone" && variation !== "a"] as const
    );
    if (!(read.shown && read.height > 20 && read.inPlace)) {
      faults.push(`${variation}: ${JSON.stringify(read)}`);
    }
    // Put it back as the frame stood.
    if (kind === "phone" && variation !== "a") {
      await page
        .locator(`${figure} [data-slot="pushed-page"] .back`)
        .first()
        .click();
    } else {
      await words.click();
    }
    await page.waitForTimeout(350);
  }
  return faults;
}

function checkFaces(kit: Kit, leg: string, seen: Faces, phone: boolean): void {
  kit.check(
    `${leg}: all ${seen.rows} rows shown lead with an 18px bordered tile or a delegate's tile`,
    seen.rows > 0 && seen.leads.length === 0,
    seen.leads.slice(0, 6).join(" | ")
  );
  kit.check(`${leg}: no dot marks drawn`, seen.dots === 0, `${seen.dots}`);
  kit.check(
    `${leg}: no to-do, task or session id outside the Today frames`,
    seen.ids.length === 0,
    seen.ids.slice(0, 6).join(" | ")
  );
  kit.check(
    `${leg}: one choice, one Pick per variation (${seen.picks.perSection.join(" ")}), Crew first recommended`,
    seen.picks.choices >= 1 &&
      seen.picks.perSection.join(" ") === "a:a b:b c:c" &&
      seen.picks.recommended.join(",") === "c",
    JSON.stringify(seen.picks)
  );
  const bad = seen.captions.filter((caption) => !CAPTION.test(caption));
  kit.check(
    `${leg}: all ${seen.captions.length} captions start "Desk ·" or "Phone ·"`,
    seen.captions.length > 0 && bad.length === 0,
    bad.join(" | ")
  );
  kit.check(
    `${leg}: no words run past their frame`,
    seen.overflows.length === 0,
    seen.overflows.slice(0, 6).join(" | ")
  );
  kit.check(
    `${leg}: the page does not scroll sideways (${seen.pageWide.scroll} ≤ ${seen.pageWide.view})`,
    seen.pageWide.scroll <= seen.pageWide.view
  );
  if (phone) {
    kit.check(
      `${leg}: every phone row shown is 44px or taller`,
      seen.shortPhoneRows.length === 0,
      seen.shortPhoneRows.slice(0, 6).join(" | ")
    );
  }
}

async function capture(page: Page, prefix: string): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const figures = await page.locator("figure:visible").all();
  let shots = 0;
  for (const [index, figure] of figures.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, each scrolled into view and settled
    const where = await figure.evaluate((node) => ({
      section:
        node.closest("section")?.getAttribute("data-variation") ??
        node.closest("section")?.id ??
        "page",
      kind: node.getAttribute("data-kind") ?? "frame",
    }));
    await figure.scrollIntoViewIfNeeded();
    await settle(page);
    const name = `${prefix}-${where.section}-${String(index + 1).padStart(2, "0")}-${where.kind}`;
    const beats = where.kind === "live" ? [0, 3] : [null];
    for (const beat of beats) {
      if (beat !== null) {
        // biome-ignore lint/performance/noAwaitInLoops: the live frame's beats, in their order
        await page.waitForSelector(
          `section[data-variation="${where.section}"] figure[data-slot=live][data-beat="${beat}"]`,
          { timeout: 20_000 }
        );
        await page.waitForTimeout(400);
      }
      const file = `${name}${beat === null ? "" : `-beat-${beat + 1}`}.png`;
      await figure.screenshot({ path: join(CAPS, file) });
      copyFileSync(join(CAPS, file), join(CLONE_CAPS, file));
      shots += 1;
    }
  }
  return shots;
}

const spec: Spec = {
  name: "plan-view-preview",
  run: async (kit: Kit) => {
    await build();
    const served = serveFolder();
    mkdirSync(CAPS, { recursive: true });
    mkdirSync(CLONE_CAPS, { recursive: true });
    try {
      for (const view of ["desk", "phone"] as View[]) {
        for (const theme of THEMES) {
          const leg = `${view} ${theme}`;
          const phone = view === "phone";
          // biome-ignore lint/performance/noAwaitInLoops: one page per leg, in turn
          const page = await kit.page(view, { theme });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          await page.addInitScript(SHOWN);
          await open(
            page,
            `${served.base}/?theme=${theme}`,
            '[data-slot="phone-screen"] [data-slot="plan-row"]'
          );
          await settle(page);

          checkFaces(kit, leg, await readFaces(page), phone);

          const sweeps = await readSweeps(page);
          kit.check(
            `${leg}: ${sweeps.running} sweeps run, each on a working delegate's line, and all ${sweeps.workingLines} working lines shown sweep`,
            sweeps.running > 0 &&
              sweeps.workingLines > 0 &&
              sweeps.off.length === 0,
            sweeps.off.slice(0, 6).join(" | ")
          );
          const within = `section[data-variation="c"] .frames > figure:nth-child(${phone ? 2 : 1})`;
          const scrub = await scrubSweep(page, within);
          const [start = Number.NaN, , half = Number.NaN, , end = Number.NaN] =
            scrub.at;
          const rising = scrub.at.every(
            (value, index) => index === 0 || value > (scrub.at[index - 1] ?? 0)
          );
          kit.check(
            `${leg}: scrubbed over its ${scrub.length}ms run, the sweep crosses the working line's fill (${scrub.at.map((value) => value.toFixed(2)).join(" → ")})`,
            scrub.length === 1200 &&
              rising &&
              Math.abs(start + 1) < 0.05 &&
              Math.abs(half) < 0.05 &&
              end > 0.9,
            JSON.stringify(scrub)
          );

          const opened = await openStep(page, phone ? "phone" : "desk");
          kit.check(
            `${leg}: a step opens to its description in all three variations (${phone ? "in place in One ledger, on a pushed page in Lanes and Crew first" : "in place"})`,
            opened.length === 0,
            opened.join(" | ")
          );

          const shots = await capture(page, `${view}-${theme}`);
          kit.note(`${leg}: ${shots} captures`);
          kit.check(
            `${leg}: no console errors`,
            errors.length === 0,
            errors.slice(0, 5).join(" | ")
          );
        }
      }
      kit.note(`captures in ${CAPS} and ${CLONE_CAPS}`);
    } finally {
      served.stop();
    }
  },
};

export default spec;
