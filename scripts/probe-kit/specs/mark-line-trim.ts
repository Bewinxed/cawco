/**
 * Every run of words the mark line recipe trims stands at its trimmed
 * height (DESIGN.md, The Mark Line Rule; design.css `mark-text`). The
 * recipe trims a run to its x-height (`text-box: trim-both ex alphabetic`)
 * and pads back what the trim took, so the run keeps its line's height. The
 * trim applies to a block container alone (CSS Inline 3, text-box-trim:
 * "this property does not apply to, or propagate through, flex, grid, or
 * table formatting contexts"), so a run that is a flex or grid container
 * keeps its full line and takes the padding as well: a builder's one-line
 * marked row stood 34px, its words' line 20px.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) and the built dashboard, in Chromium and WebKit at the desk
 * (1440) and the phone (390), on the live screens (home, a session, a
 * project, usage, each Configure page, the pending button's bench, a
 * machine's menu whose pause the hub refused, its item saying why under its
 * label, the project's tasks filtered, its Filter saying a count, and on
 * the phone an artifact with an open pin on its own tab, the window narrowed
 * until Comments goes into the head's More and More says its count), every
 * element whose computed `text-box-trim` is
 * not `none` and that is drawn with words in it is read three ways: as it
 * stands, with its trim off, and with its padding off. A run whose trim
 * takes effect stands shorter than with its trim off. A finding is a run
 * the trim leaves as it is while its padding still adds to it: it stands
 * taller than trimmed by that padding. Each is named with its display, its
 * height, the padding it carries and its row's (its parent's) height.
 *
 * Read on their own as well: the filter's count pill, a box on the
 * button's line, stands at its declared height (`h-space-5`, 18px); More's
 * count, its own mark line, has its number trimmed and standing at its line.
 *
 *   bun scripts/probe-kit/run.ts mark-line-trim
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page at a time, each read as it stands
import type { Page } from "playwright-core";
import type { Pin } from "../../../packages/core/src/comments";
import { machineWords } from "../../../packages/core/src/words/machine";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import { MACHINE, until } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  VIEWS,
  type View,
} from "../kit";
import { pagePins, writePagePins } from "../pins";
import { fleetUp, made } from "./artifact-resize-loop";

const ENGINES: Engine[] = ["chromium", "webkit"];
const SIZES: View[] = ["desk", "phone"];
const READY = '[data-slot="shell"]';
/** The task filter's count pill, on the project's strip or its bar. */
const FILTER_COUNT = '[data-filter-trigger] [data-slot="count"]';
/** The count the side card's More says for a control in it (Comments'). */
const MORE_COUNT = '[data-slot="side-head"] [data-slot="more-count"]';
/** The preview's page, in the side card. */
const PREVIEW_FRAME = 'iframe[title="Preview"]';

/** A comment pinned on the page, open: Comments counts it. */
const OPEN_PIN: Pin = {
  id: "probe-mark-line-pin-1",
  number: 1,
  kind: "comment",
  anchor: { selector: "h1", source: null, text: "Lay out the chip wraps" },
  at: new Date().toISOString(),
  by: "person",
  elements: [],
  point: { x: 0.5, y: 0.5 },
  thread: [
    {
      id: "probe-mark-line-entry-1",
      by: "person",
      text: "The second chip wraps too early",
      at: new Date().toISOString(),
    },
  ],
};

/**
 * Narrows the window a step at a time, from its width down to `to`, until
 * `selector` stands: the head moves its controls into More as its room
 * goes. Throws when it never does.
 */
const narrowUntil = async (
  page: Page,
  selector: string,
  to: number,
  step: number
): Promise<void> => {
  const { width: from, height } = page.viewportSize() ?? {
    width: 1440,
    height: 900,
  };
  const heads: string[] = [];
  for (let width = from; width >= to; width -= step) {
    await page.setViewportSize({ width, height });
    await settle(page);
    if ((await page.locator(selector).locator("visible=true").count()) > 0) {
      return;
    }
    heads.push(
      `${width}: ${await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="side-head"] button')]
          .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())
          .join(" | ")
      )}`
    );
  }
  throw new Error(
    `${selector} stood at no width from ${from} to ${to}; the head at each: ${heads.filter((_, at) => at % 10 === 0).join(" ;; ")}`
  );
};

/** The box `selector` stands in, and its words' run inside it. */
const boxOf = (page: Page, selector: string) =>
  page.evaluate((one) => {
    // The one drawn: a phone's strip keeps a second, folded away.
    const el =
      [...document.querySelectorAll<HTMLElement>(one)].find(
        (each) => each.getBoundingClientRect().width > 0
      ) ?? null;
    if (!el) {
      return null;
    }
    const run = el.querySelector<HTMLElement>(":scope > span");
    const height = (box: HTMLElement | null) =>
      box ? Math.round(box.getBoundingClientRect().height * 100) / 100 : null;
    return {
      height: height(el),
      declared: getComputedStyle(el).height,
      space5: getComputedStyle(document.documentElement)
        .getPropertyValue("--space-5")
        .trim(),
      run: height(run),
      runTrim: run
        ? getComputedStyle(run).getPropertyValue("text-box-trim")
        : null,
      lineHeight: run ? getComputedStyle(run).lineHeight : null,
    };
  }, selector);

/** A run the trim left untrimmed, as the page measured it. */
interface Untrimmed {
  display: string;
  /** Its height as it stands. */
  height: number;
  /** How much shorter it stands with its padding off: the padding it carries. */
  padding: number;
  /** Its parent's display and height: the row or track it stands in. */
  parent: string;
  path: string;
  text: string;
}

/**
 * In the page: every drawn, worded element whose trim is on, read as it
 * stands, with its trim off and with its padding off; those the trim leaves
 * as they are while the padding adds to them.
 */
function untrimmedRuns(): { read: number; runs: Untrimmed[] } {
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let at: Element | null = el;
    while (at && parts.length < 4) {
      const slot = at.getAttribute("data-slot");
      const classes = [...at.classList]
        .filter((name) => !name.includes(":"))
        .slice(0, 4)
        .join(".");
      parts.unshift(
        `${at.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}${classes ? `.${classes}` : ""}`
      );
      at = at.parentElement;
    }
    return parts.join(" > ");
  };
  const heightOf = (el: Element) => el.getBoundingClientRect().height;
  const runs: Untrimmed[] = [];
  let read = 0;
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const style = getComputedStyle(el);
    const trim = style.getPropertyValue("text-box-trim");
    if (!trim || trim === "none") {
      continue;
    }
    // In running text a run is an inline box: its padding moves no line.
    if (
      style.display === "inline" ||
      style.display === "contents" ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      continue;
    }
    const height = heightOf(el);
    if (height === 0 || !el.textContent?.trim()) {
      continue;
    }
    read += 1;
    const before = el.getAttribute("style");
    el.style.setProperty("text-box", "normal", "important");
    const trimOff = heightOf(el);
    el.style.removeProperty("text-box");
    el.style.setProperty("padding-block", "0px", "important");
    const paddingOff = heightOf(el);
    if (before === null) {
      el.removeAttribute("style");
    } else {
      el.setAttribute("style", before);
    }
    const padding = height - paddingOff;
    if (trimOff - height < 0.5 && padding > 0.5) {
      const parent = el.parentElement;
      runs.push({
        path: pathOf(el),
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
        display: style.display,
        height: Math.round(height * 100) / 100,
        padding: Math.round(padding * 100) / 100,
        parent: parent
          ? `${getComputedStyle(parent).display} ${Math.round(heightOf(parent) * 100) / 100}px`
          : "none",
      });
    }
  }
  return { read, runs };
}

interface Place {
  /** Done on the open page before the read: a menu opened. */
  act?: (page: Page) => Promise<void>;
  /** What the act brought up, on screen as the page is read. */
  holds?: string;
  /** A reading of its own, beside the sweep: whether it holds, and what it read. */
  measure?: (page: Page) => Promise<{ ok: boolean; detail: string }>;
  name: string;
  path: string;
  ready?: string;
  /** The sizes the state stands at; every one when unsaid. */
  sizes?: View[];
}

/** Pins one open comment on the artifact's page, as the overlay writes one, and waits for the doc to hold it. */
const pinOn = async (kit: Kit, base: string, artifact: string) => {
  const page = await kit.page("desk");
  await open(page, `${base}/artifact/${artifact}`, PREVIEW_FRAME);
  const frame = await until(
    "the preview's page, its doc joined",
    async () => {
      const inside = await (
        await page.locator(PREVIEW_FRAME).first().elementHandle()
      )?.contentFrame();
      const joined = await inside
        ?.evaluate(
          () =>
            !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
              .cawcoArtifact?.doc
        )
        .catch(() => false);
      return joined ? inside : null;
    },
    Boolean,
    60_000
  );
  if (frame) {
    await writePagePins(frame, OPEN_PIN);
    await until(
      "the pin in the page's doc",
      async () => Object.keys(await pagePins(frame)).length,
      (n) => n > 0,
      20_000
    );
  }
  await page.close();
};

const setUp = async (kit: Kit): Promise<{ base: string; places: Place[] }> => {
  const fleet: KitFleet = await fleetUp(kit);
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Mac layer",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  await fleet.api(`/api/projects/${project.id}/tasks`, {
    title: "Mark line pill",
  });
  const session = await fleet.spawn("claude", "Mark line", fleet.repo, {
    projectId: project.id,
  });
  const artifact = await made(kit, "1", "chip-wraps", () =>
    fleet.send(session, "PROBE-CALL:1")
  );
  const base = await fleet.dashboard();
  if (artifact) {
    await pinOn(kit, base, artifact);
  }
  const configs = [
    "config",
    "config/accounts",
    "config/connections",
    "config/devices",
    "config/mcp",
    "config/rules",
    "config/skills",
    "config/hooks",
    "config/models",
    "config/spend",
    "config/updates",
    "config/phone",
    "config/browsers",
    "config/cli-tools",
    "config/memory",
    "config/delegate-types",
    "config/subagents",
    "config/previews",
  ];
  const places: Place[] = [
    { name: "home", path: "" },
    { name: "session", path: `session/${session}` },
    {
      // A menu item whose work failed says why under its label (PendingContent's
      // reason): its words run two lines, label and reason, in one trimmed run.
      name: "machines card, a pause the hub refused",
      path: `session/${session}`,
      holds: "[data-reason]",
      act: async (page) => {
        await page.route("**/api/machines/*/pause", (route) =>
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "the hub is restarting" }),
          })
        );
        // The desk keeps the machines in the bar's card, a phone in its sidebar.
        const opener = page
          .locator("[data-machines]")
          .locator("visible=true")
          .first();
        if ((await opener.count()) > 0) {
          await opener.click();
        } else {
          await page
            .getByRole("button", { name: sidebarWords.openNavigation })
            .click();
          await page.waitForSelector('[data-rail-sheet][data-state="open"]');
        }
        await page
          .locator('li[data-machine] [data-slot="row"]')
          .locator("visible=true")
          .first()
          .click({ button: "right" });
        await page
          .getByRole("menuitem", { name: machineWords.pauseUntil })
          .click();
        await page
          .locator('[role="menu"]')
          .last()
          .getByRole("menuitem")
          .first()
          .click();
        await page.waitForSelector("[data-reason]", { timeout: 10_000 });
      },
    },
    { name: "project", path: `project/${project.id}` },
    {
      // The filter's count stands on its trigger while a filter does (the
      // URL's words): a box on the button's line, at its own height.
      name: "project, its tasks filtered",
      path: `project/${project.id}?q=Mark`,
      holds: FILTER_COUNT,
      act: async (page) => {
        await page
          .locator(FILTER_COUNT)
          .locator("visible=true")
          .first()
          .waitFor({ timeout: 20_000 });
      },
      measure: async (page) => {
        const pill = await boxOf(page, FILTER_COUNT);
        return {
          ok:
            pill !== null &&
            pill.declared === pill.space5 &&
            pill.height === Number.parseFloat(pill.space5),
          detail: JSON.stringify(pill),
        };
      },
    },
    ...(artifact
      ? [
          {
            // Comments goes into More as the head's room goes, and More says
            // its count: the count's words trimmed beside its glyph. Only a
            // phone's head is that narrow: a desk's keeps Comments standing
            // down to 300px, on the artifact's own tab and beside its
            // session alike, More taking the other controls.
            name: "artifact, Comments in More with its count",
            sizes: ["phone"],
            path: `artifact/${artifact}`,
            ready: '[data-slot="side-card"]',
            holds: MORE_COUNT,
            act: (page: Page) => narrowUntil(page, MORE_COUNT, 300, 10),
            measure: async (page: Page) => {
              const count = await boxOf(page, MORE_COUNT);
              return {
                ok:
                  count !== null &&
                  count.runTrim !== null &&
                  count.runTrim !== "none" &&
                  count.run !== null &&
                  count.lineHeight !== null &&
                  Math.abs(count.run - Number.parseFloat(count.lineHeight)) <
                    0.5,
                detail: JSON.stringify(count),
              };
            },
          } satisfies Place,
        ]
      : []),
    { name: "usage", path: "usage" },
    ...configs.map((path) => ({ name: path, path })),
    {
      name: "pending button bench",
      path: "motion/button-pending",
      ready: "body",
    },
  ];
  return { base, places };
};

/** One place read on `page`: its runs the trim left as they were, or null when it could not be brought up. */
const readPlace = async (
  kit: Kit,
  page: Page,
  base: string,
  place: Place,
  size: View,
  leg: string
): Promise<{ read: number; runs: Untrimmed[] } | null> => {
  try {
    await page.setViewportSize({
      width: VIEWS[size].width,
      height: VIEWS[size].height,
    });
    await open(page, `${base}/${place.path}`, place.ready ?? READY);
    await place.act?.(page);
    await settle(page);
  } catch (error) {
    const said = `${leg} ${place.name}: not read (${error})`;
    if (place.holds) {
      kit.check(`${leg} ${place.name}: brought up`, false, said);
    } else {
      kit.note(said);
    }
    return null;
  }
  if (place.holds) {
    kit.check(
      `${leg} ${place.name}: ${place.holds} stands as it is read`,
      (await page.locator(place.holds).count()) > 0
    );
  }
  if (place.measure) {
    const measured = await place.measure(page);
    kit.check(
      `${leg} ${place.name}: it stands at its own height`,
      measured.ok,
      measured.detail
    );
  }
  return page.evaluate(untrimmedRuns);
};

const run = async (kit: Kit): Promise<void> => {
  const { base, places } = await setUp(kit);
  for (const engine of ENGINES) {
    for (const size of SIZES) {
      const leg = `${engine} ${size}`;
      const page = await kit.page(size, { engine });
      const found: string[] = [];
      let read = 0;
      for (const place of places.filter(
        (one) => !one.sizes || one.sizes.includes(size)
      )) {
        const seen = await readPlace(kit, page, base, place, size, leg);
        read += seen?.read ?? 0;
        for (const one of seen?.runs ?? []) {
          found.push(
            `${place.name}: ${one.path} "${one.text}" (${one.display}) stands ${one.height}px, ${one.padding}px of it padding the trim never took back; its row ${one.parent}`
          );
        }
      }
      kit.check(
        `${leg}: every trimmed run stands at its trimmed height (${read} runs read on ${places.length} screens)`,
        read > 0 && found.length === 0,
        found.length > 0
          ? `\n  ${[...new Set(found)].join("\n  ")}`
          : "none taller"
      );
      await page.close();
    }
  }
};

export default { name: "mark-line-trim", run } satisfies Spec;
