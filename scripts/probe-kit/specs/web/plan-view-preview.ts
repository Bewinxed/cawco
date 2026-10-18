/**
 * The plan-view design preview (apps/dashboard/preview/plan-view), built and
 * served as the static folder the owner is shown, at a desk's 1440×900 and a
 * phone's 390×844 (touch), light and dark:
 *
 * - every frame's caption starts "Desk" or "Phone";
 * - no row's words run past their frame, and the page never scrolls sideways;
 * - the proposed task frames draw one list: no second "To-dos" head or list;
 * - every row in a phone frame is 44px tall or more;
 * - each phone sheet stands on its screen's foot, inside it; the nesting
 *   rails are measured off their marks; nothing covers the intro;
 * - the progress ring stands bare: no outline, border or shadow round it;
 * - no to-do or task id is written anywhere but in the Today frames;
 * - in every plan, the times end on one x and the fold counts on another;
 * - the task, delegates and live frames list the same to-dos, word for word;
 * - the plan's quiet inks (a time, a done step's words, a count, the way
 *   into a delegate's session) hold 4.5:1 on what they stand on;
 * - nothing is written to the console as an error.
 *
 * - on a phone the page holds every frame and sheet inside its width;
 * - a to-do the task and delegates states share wraps the same in both;
 * - the delegates state shows its queued and failed delegates inside the
 *   frame, and every line a step waits on is one recipe;
 * - every delegate's rail hangs from the to-do it is under, and its own
 *   steps' rail from its tile.
 *
 * Each frame is captured to `$TMPDIR/caps/round3/`, the live frame at the
 * beat its delegate's step has folded open and the beat its to-do ticks.
 *
 *   bun scripts/probe-kit/run.ts web plan-view-preview
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Kit, Spec, View } from "../../kit";
import { open, ROOT, settle, THEMES } from "../../kit";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const OUT = join(DASHBOARD, "preview", "plan-view", "out");
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps", "round3");

/** A caption names its frame first: "Desk · …" or "Phone · …". */
const CAPTION = /^(Desk|Phone) · \S/;
/** The live frame's beats worth a still: folded open, then the to-do ticked. */
const LIVE_BEATS = [3, 4];

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

interface Rows {
  captions: string[];
  overflows: string[];
  pageWide: { scroll: number; view: number };
  phoneRows: number;
  shortPhoneRows: string[];
  /** The proposed task frames: their "To-dos" heads and their lists. */
  taskFrames: { heads: string[]; lists: number }[];
}

/** The rows: their words, their heights, the task frames' lists, the captions. */
const readRows = (page: Page): Promise<Rows> =>
  page.evaluate(() => {
    const frameOf = (el: Element) =>
      el.closest('[data-slot="phone-screen"], .desk') as HTMLElement | null;
    const overflows: string[] = [];
    for (const words of document.querySelectorAll(
      '[data-slot="words"], [data-slot="wait"], [data-today] [data-slot="text"]'
    )) {
      const frame = frameOf(words);
      if (!frame) {
        continue;
      }
      const box = words.getBoundingClientRect();
      const edge = frame.getBoundingClientRect();
      const spills =
        box.left < edge.left - 0.5 ||
        box.right > edge.right + 0.5 ||
        (words as HTMLElement).scrollWidth >
          (words as HTMLElement).clientWidth + 1;
      if (spills) {
        overflows.push(
          `${words.textContent?.slice(0, 40)} (${Math.round(box.left)}–${Math.round(box.right)} in ${Math.round(edge.left)}–${Math.round(edge.right)})`
        );
      }
    }
    const phoneRows = [
      ...document.querySelectorAll(
        '[data-slot="phone-screen"] [data-slot="plan-row"]'
      ),
    ];
    const taskFrames = [
      ...(document
        .getElementById("task")
        ?.querySelectorAll('.desk, [data-slot="phone-screen"]') ?? []),
    ]
      .filter((frame) => !frame.querySelector("[data-today]"))
      .map((frame) => ({
        heads: [...frame.querySelectorAll("h1, h2, h3, h4")]
          .map((head) => head.textContent?.trim() ?? "")
          .filter((text) =>
            text.toLowerCase().replaceAll("-", "").includes("todos")
          ),
        lists: frame.querySelectorAll('[data-slot="plan"] > ul').length,
      }));
    return {
      captions: [...document.querySelectorAll("figcaption")].map(
        (caption) => caption.textContent?.trim() ?? ""
      ),
      overflows,
      pageWide: {
        scroll: document.scrollingElement?.scrollWidth ?? 0,
        view: window.innerWidth,
      },
      phoneRows: phoneRows.length,
      shortPhoneRows: phoneRows
        .filter((row) => row.getBoundingClientRect().height < 44)
        .map(
          (row) =>
            `${row.querySelector('[data-slot="words"]')?.textContent} ${row.getBoundingClientRect().height}px`
        ),
      taskFrames,
    };
  });

interface Frames {
  /** The intro's title is what a press there lands on: no sheet or scrim spilt over the page. */
  introClear: boolean;
  /** Sheets not standing on their screen's foot, inside it. */
  loose: string[];
  rails: number;
  sheets: number;
  /** Rails whose position was never measured (still at their 0px default). */
  unmeasuredRails: number;
}

/** The frames: each phone sheet's place, the rails, the intro's clear. */
const readFrames = (page: Page): Promise<Frames> =>
  page.evaluate(() => {
    const loose: string[] = [];
    let sheets = 0;
    for (const screen of document.querySelectorAll(
      '[data-slot="phone-screen"]'
    )) {
      const sheet = screen.querySelector('[data-slot="drawer-content"]');
      if (!sheet) {
        loose.push("a screen with no sheet");
        continue;
      }
      sheets += 1;
      const box = sheet.getBoundingClientRect();
      const edge = screen.getBoundingClientRect();
      if (
        Math.abs(box.bottom - edge.bottom) > 1 ||
        box.top < edge.top - 0.5 ||
        box.left < edge.left - 0.5 ||
        box.right > edge.right + 0.5 ||
        box.height < 200
      ) {
        loose.push(
          `sheet ${Math.round(box.top)}–${Math.round(box.bottom)} in screen ${Math.round(edge.top)}–${Math.round(edge.bottom)}`
        );
      }
    }
    const rails = [
      ...document.querySelectorAll('[data-slot="plan"] .kit-nest'),
    ];
    const h1 = document.querySelector("h1");
    const at = h1?.getBoundingClientRect();
    const hit = at
      ? document.elementFromPoint(at.left + 4, at.top + at.height / 2)
      : null;
    return {
      introClear: !!h1 && !!hit && h1.contains(hit),
      loose,
      rails: rails.length,
      sheets,
      unmeasuredRails: rails.filter(
        (rail) =>
          getComputedStyle(rail).getPropertyValue("--nest-x").trim() === "0px"
      ).length,
    };
  });

interface Faces {
  /** Text outside the Today frames that writes a to-do's or a task's id. */
  ids: string[];
  /** Plans whose times, or whose fold counts, do not end on one x. */
  ragged: string[];
  /** Progress rings drawn with an outline, border or shadow round them. */
  ringBoxes: string[];
  rings: number;
  /** Top-level to-do words of the task, delegates and live frames. */
  todos: { delegates: string[]; live: string[]; task: string[] };
}

/** The progress rings: any drawn with an outline, border or shadow round them. */
const readRings = (page: Page): Promise<{ boxes: string[]; rings: number }> =>
  page.evaluate(() => {
    const rings = [...document.querySelectorAll('[data-slot="progress"]')];
    const boxes = rings
      .flatMap((ring) => [ring, ...ring.querySelectorAll("svg")])
      .map((el) => ({ el, style: getComputedStyle(el) }))
      .filter(
        ({ style }) =>
          style.boxShadow !== "none" ||
          style.outlineStyle !== "none" ||
          Number.parseFloat(style.borderTopWidth) > 0
      )
      .map(
        ({ el, style }) =>
          `${el.tagName}: shadow ${style.boxShadow}, outline ${style.outlineStyle}, border ${style.borderTopWidth}`
      );
    return { boxes, rings: rings.length };
  });

/** The faces: the ids, the trailing columns, the shared rows. */
const readFaces = async (page: Page): Promise<Faces> => {
  const { boxes, rings } = await readRings(page);
  const rest = await page.evaluate(() => {
    const ids: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const written = text.includes("td-") || text.includes("tsk-");
      if (written && !node.parentElement?.closest("[data-today]")) {
        ids.push(`"${text.trim().slice(0, 50)}"`);
      }
    }

    const ragged: string[] = [];
    for (const [index, plan] of [
      ...document.querySelectorAll('[data-slot="plan"]'),
    ].entries()) {
      for (const slot of ["time", "fold"]) {
        const ends = [
          ...plan.querySelectorAll(`[data-slot="${slot}"]`),
        ].flatMap((cell) =>
          slot === "time" && !cell.textContent?.trim()
            ? []
            : [Math.round(cell.getBoundingClientRect().right * 2) / 2]
        );
        if (new Set(ends).size > 1) {
          ragged.push(
            `plan ${index + 1} ${slot}s end at ${[...new Set(ends)]}`
          );
        }
      }
    }

    const topWords = (frame: Element | null | undefined) =>
      [
        ...(frame?.querySelectorAll(
          '[data-slot="plan"] > ul > li > [data-slot="plan-row"] [data-slot="words"]'
        ) ?? []),
      ].map((words) => words.textContent?.trim() ?? "");
    return {
      ids,
      ragged,
      todos: {
        task: topWords(document.querySelector("#task .desk")),
        delegates: topWords(document.querySelector("#delegates .desk")),
        live: topWords(document.querySelector('[data-slot="live"] .desk')),
      },
    };
  });
  return { ...rest, ringBoxes: boxes, rings };
};

/** A quiet ink's contrast on what it stands on, rasterised as the page draws it. */
const readInks = (page: Page): Promise<{ least: number; what: string }[]> =>
  page.evaluate(() => {
    const pen = document.createElement("canvas").getContext("2d", {
      willReadFrequently: true,
    });
    const rgb = (color: string): number[] => {
      if (!pen) {
        return [0, 0, 0];
      }
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = color;
      pen.fillRect(0, 0, 1, 1);
      return [...pen.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const ground = (el: Element): string => {
      for (let at: Element | null = el; at; at = at.parentElement) {
        const paint = getComputedStyle(at).backgroundColor;
        if (paint !== "rgba(0, 0, 0, 0)" && paint !== "transparent") {
          return paint;
        }
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (p: number[]) =>
      0.2126 * lin(p[0] ?? 0) +
      0.7152 * lin(p[1] ?? 0) +
      0.0722 * lin(p[2] ?? 0);
    const ratio = (a: number[], b: number[]) => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const inks = [
      ['[data-slot="time"]:not(:empty)', "a time"],
      ['[data-state="done"] > [data-slot="words"]', "a done step's words"],
      ['[data-slot="fold"] [data-slot="count"]', "a fold's count"],
      ['[data-slot="plan"] .open', "the way into a delegate's session"],
      ['[data-slot="plan"] .open svg', "its glyph"],
    ] as const;
    return inks.map(([selector, what]) => {
      const found = [...document.querySelectorAll(selector)];
      const least = Math.min(
        ...found.map((el) =>
          ratio(rgb(getComputedStyle(el).color), rgb(ground(el)))
        )
      );
      return { what: `${what} (${found.length})`, least };
    });
  });

interface Layout {
  /** Carried rows looked at. */
  carried: number;
  /** Desk heads with a task's title, and how far each stands off the "Plan" title's line. */
  heads: number;
  headsOff: string[];
  /** Rows of the delegates state outside what their frame shows. */
  hidden: string[];
  /** Figures, desk scrollers or phone sheets past the viewport's sides. */
  outside: string[];
  pageWide: number;
  /** Delegates whose rail does not hang from their to-do, or whose steps' rail not from their tile. */
  railsOff: string[];
  /** The device's width. */
  screen: number;
  waits: number;
  /** Waiting lines whose type differs from the first, or which hold a mark. */
  waitsOff: string[];
  /** Shared to-dos whose words wrap to a different height in the two states. */
  wraps: string[];
}

/**
 * Figures, desk scrollers and phone sheets past the device's sides, and the
 * page's width against the device's: on a phone a page wider than the
 * screen widens the layout viewport itself, so `innerWidth` alone would read
 * the overflow as the screen. Anything else past the screen's edge that no
 * scroller holds is named, the widest first.
 */
const readOutside = (
  page: Page
): Promise<Pick<Layout, "outside" | "pageWide" | "screen">> =>
  page.evaluate(() => {
    const view = Math.min(window.innerWidth, screen.width);
    const past = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.left < -0.5 || box.right > view + 0.5;
    };
    const held = (el: Element) =>
      el.closest('[data-slot="desk-scroll"], [data-slot="phone-screen"]') !==
        null &&
      !el.matches('[data-slot="desk-scroll"], [data-slot="phone-screen"]');
    const named = (el: Element) => {
      const box = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}[${el.getAttribute("data-slot") ?? ""}] ${Math.round(box.left)}–${Math.round(box.right)}`;
    };
    const outside = [
      ...[
        ...document.querySelectorAll(
          'figure, [data-slot="desk-scroll"], [data-slot="drawer-content"]'
        ),
      ].filter(past),
      ...[...document.querySelectorAll("body *")]
        .filter((el) => past(el) && !held(el))
        .sort(
          (a, b) =>
            b.getBoundingClientRect().width - a.getBoundingClientRect().width
        )
        .slice(0, 4),
    ].map(named);
    return {
      outside: [...new Set(outside)],
      pageWide: Math.max(
        window.innerWidth,
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ),
      screen: screen.width,
    };
  });

/** The proposed (not Today) desk or phone figure of a section. */
const PROPOSED = (section: string, kind: string): string =>
  `#${section} figure[data-kind="${kind}"]:not(:has([data-today]))`;

/** The to-dos the task and delegates states share, and how tall each one's words stand. */
const readWraps = (page: Page): Promise<Pick<Layout, "wraps">> =>
  page.evaluate(
    ([task, out]) => {
      const tops = (selector: string) =>
        new Map(
          [
            ...document.querySelectorAll(
              `${selector} [data-slot="plan"] > ul > li > [data-slot="plan-row"] [data-slot="words"]`
            ),
          ].map((words) => [
            words.textContent?.trim() ?? "",
            Math.round(words.getBoundingClientRect().height),
          ])
        );
      const wraps: string[] = [];
      for (const [index, selector] of task.entries()) {
        const there = tops(out[index] ?? "");
        for (const [words, height] of tops(selector)) {
          if (there.get(words) !== height) {
            wraps.push(`"${words}" ${height}px against ${there.get(words)}px`);
          }
        }
      }
      return { wraps };
    },
    [
      [PROPOSED("task", "desk"), PROPOSED("task", "phone")],
      [PROPOSED("delegates", "desk"), PROPOSED("delegates", "phone")],
    ]
  );

/** The delegates state's queued and failed rows against what their frame shows, and the waiting lines' type. */
const readDelegates = (
  page: Page
): Promise<Pick<Layout, "hidden" | "waits" | "waitsOff">> =>
  page.evaluate(
    (figures) => {
      const hidden: string[] = [];
      for (const selector of figures) {
        const figure = document.querySelector(selector);
        const edge = figure
          ?.querySelector(".body, .scroll")
          ?.getBoundingClientRect();
        for (const row of figure?.querySelectorAll(
          '[data-state="queued"], [data-state="failed"]'
        ) ?? []) {
          const box = row.getBoundingClientRect();
          const inside =
            !!edge &&
            box.top >= edge.top - 0.5 &&
            box.bottom <= edge.bottom + 0.5;
          if (!inside) {
            hidden.push(
              `"${row.querySelector('[data-slot="words"]')?.textContent}" ${Math.round(box.top)}–${Math.round(box.bottom)} in ${Math.round(edge?.top ?? 0)}–${Math.round(edge?.bottom ?? 0)}`
            );
          }
        }
      }
      const waits = [...document.querySelectorAll('[data-slot="wait"]')];
      const typeOf = (el: Element) => {
        const style = getComputedStyle(el);
        return `${style.fontSize} ${style.fontWeight} ${style.lineHeight} ${style.fontFamily}`;
      };
      const first = waits[0] ? typeOf(waits[0]) : "";
      const waitsOff = waits
        .filter((el) => typeOf(el) !== first || el.children.length > 0)
        .map(
          (el) =>
            `"${el.textContent?.trim()}": ${typeOf(el)}, ${el.children.length} marks`
        );
      return { hidden, waits: waits.length, waitsOff };
    },
    [PROPOSED("delegates", "desk"), PROPOSED("delegates", "phone")]
  );

/** Each delegate's rail against its to-do's mark, and its own steps' rail against its tile. */
const readRails = (page: Page): Promise<Pick<Layout, "carried" | "railsOff">> =>
  page.evaluate(() => {
    const railX = (list: Element) =>
      list.getBoundingClientRect().left +
      Number.parseFloat(getComputedStyle(list).getPropertyValue("--nest-x"));
    const centre = (el: Element | null | undefined) => {
      const box = el?.getBoundingClientRect();
      return box ? box.left + box.width / 2 : Number.NaN;
    };
    const offBy = (list: Element, mark: Element | null | undefined) =>
      Math.abs(railX(list) - centre(mark));
    const carried = [
      ...document.querySelectorAll(
        'figure [data-slot="plan-row"][data-carried]'
      ),
    ].filter((row) => !row.closest("[data-today]"));
    const railsOff = carried.flatMap((row) => {
      const words = row.querySelector('[data-slot="words"]')?.textContent;
      const item = row.parentElement;
      const list = item?.parentElement;
      const hostRow = list?.parentElement
        ?.closest("li")
        ?.querySelector(':scope > [data-slot="plan-row"]');
      if (!(
        list?.classList.contains("kit-nest") &&
        hostRow?.querySelector(".tick-target")
      )) {
        return [`"${words}" is not under a to-do`];
      }
      const off = offBy(list, hostRow.querySelector(".pv-mark"));
      const own = item?.querySelector(":scope > ul.kit-nest");
      const away = own ? offBy(own, row.querySelector(".pv-mark")) : 0;
      return [
        ...(off > 1.5
          ? [`"${words}": rail ${off.toFixed(1)}px off its to-do's mark`]
          : []),
        ...(away > 1.5
          ? [`"${words}": steps' rail ${away.toFixed(1)}px off its tile`]
          : []),
      ];
    });
    return { carried: carried.length, railsOff };
  });

/**
 * Each desk head's title against its task's title: both set in the label
 * size on the mark line, so one centre is one baseline.
 */
const readHeads = (page: Page): Promise<Pick<Layout, "heads" | "headsOff">> =>
  page.evaluate(() => {
    const heads = [
      ...document.querySelectorAll('[data-slot="side-head"]'),
    ].filter((head) => head.querySelector(".task-title"));
    const middle = (el: Element | null) => {
      const box = el?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : Number.NaN;
    };
    const headsOff = heads
      .map((head) =>
        Math.abs(
          middle(head.querySelector(".title")) -
            middle(head.querySelector(".task-title"))
        )
      )
      .filter((off) => !(off <= 0.5))
      .map((off) => `${off.toFixed(2)}px apart`);
    return { heads: heads.length, headsOff };
  });

/** The layout: the phone page's width, the shared rows' wraps, the delegates' frames and rails. */
const readLayout = async (page: Page): Promise<Layout> => ({
  ...(await readHeads(page)),
  ...(await readOutside(page)),
  ...(await readWraps(page)),
  ...(await readDelegates(page)),
  ...(await readRails(page)),
});

function checkLayout(kit: Kit, leg: string, seen: Layout): void {
  kit.check(
    `${leg}: in all ${seen.heads} desk heads the task's title stands on the "Plan" title's line`,
    seen.heads > 0 && seen.headsOff.length === 0,
    seen.headsOff.join(" | ")
  );
  kit.check(
    `${leg}: every frame, desk scroller and phone sheet stands inside the screen, and the page is the screen's width (${seen.pageWide} ≤ ${seen.screen})`,
    seen.outside.length === 0 && seen.pageWide <= seen.screen,
    seen.outside.join(" | ")
  );
  kit.check(
    `${leg}: the to-dos the task and delegates states share wrap the same in both`,
    seen.wraps.length === 0,
    seen.wraps.join(" | ")
  );
  kit.check(
    `${leg}: the queued and failed delegates stand inside their frame, desk and phone`,
    seen.hidden.length === 0,
    seen.hidden.join(" | ")
  );
  kit.check(
    `${leg}: all ${seen.waits} waiting lines are one recipe, with no leading mark`,
    seen.waits > 0 && seen.waitsOff.length === 0,
    seen.waitsOff.join(" | ")
  );
  kit.check(
    `${leg}: all ${seen.carried} delegates hang from their to-do's mark, their steps from their tile`,
    seen.carried > 0 && seen.railsOff.length === 0,
    seen.railsOff.join(" | ")
  );
}

async function captureLive(page: Page, prefix: string): Promise<void> {
  const live = page.locator("figure[data-slot=live]");
  for (const beat of LIVE_BEATS) {
    // biome-ignore lint/performance/noAwaitInLoops: the live frame's beats, in their order
    await page.waitForSelector(`figure[data-slot=live][data-beat="${beat}"]`, {
      timeout: 30_000,
    });
    await live.scrollIntoViewIfNeeded();
    await settle(page);
    await live.screenshot({
      path: join(CAPS, `${prefix}-90-live-beat-${beat + 1}.png`),
    });
  }
}

async function capture(page: Page, prefix: string): Promise<void> {
  await page.screenshot({ path: join(CAPS, `${prefix}-00-intro.png`) });
  const figures = await page.locator("figure:not([data-slot=live])").all();
  for (const [index, figure] of figures.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, each scrolled into view and settled
    const section = await figure.evaluate(
      (node) => node.closest("section")?.id ?? "page"
    );
    const today = (await figure.locator("[data-today]").count()) > 0;
    const caption = (await figure.locator("figcaption").textContent()) ?? "";
    const kind = caption.trim().startsWith("Desk") ? "desk" : "phone";
    await figure.scrollIntoViewIfNeeded();
    await settle(page);
    await figure.screenshot({
      path: join(
        CAPS,
        `${prefix}-${String(index + 1).padStart(2, "0")}-${section}-${today ? "today-" : ""}${kind}.png`
      ),
    });
  }
  await captureLive(page, prefix);
}

function checkRows(kit: Kit, leg: string, seen: Rows): void {
  const bad = seen.captions.filter((caption) => !CAPTION.test(caption));
  kit.check(
    `${leg}: all ${seen.captions.length} captions start "Desk ·" or "Phone ·"`,
    seen.captions.length > 0 && bad.length === 0,
    bad.join(" | ")
  );
  kit.check(
    `${leg}: no row's words run past their frame`,
    seen.overflows.length === 0,
    seen.overflows.join(" | ")
  );
  kit.check(
    `${leg}: the page does not scroll sideways (${seen.pageWide.scroll} ≤ ${seen.pageWide.view})`,
    seen.pageWide.scroll <= seen.pageWide.view
  );
  kit.check(
    `${leg}: the proposed task frames draw one list and no "To-dos" head (${seen.taskFrames.length} frames)`,
    seen.taskFrames.length === 2 &&
      seen.taskFrames.every(
        (frame) => frame.lists === 1 && frame.heads.length === 0
      ),
    JSON.stringify(seen.taskFrames)
  );
  kit.check(
    `${leg}: all ${seen.phoneRows} phone rows are 44px or taller`,
    seen.phoneRows > 0 && seen.shortPhoneRows.length === 0,
    seen.shortPhoneRows.join(" | ")
  );
}

function checkFrames(kit: Kit, leg: string, seen: Frames): void {
  kit.check(
    `${leg}: all ${seen.sheets} phone sheets stand on their screen's foot, inside it`,
    seen.sheets > 0 && seen.loose.length === 0,
    seen.loose.join(" | ")
  );
  kit.check(
    `${leg}: all ${seen.rails} nesting rails are measured off their marks`,
    seen.rails > 0 && seen.unmeasuredRails === 0,
    `${seen.unmeasuredRails} at 0px`
  );
  kit.check(
    `${leg}: nothing from a sheet covers the page's intro`,
    seen.introClear
  );
}

const same = (a: string[], b: string[]): boolean =>
  a.length > 0 && a.length === b.length && a.every((w, i) => w === b[i]);

function checkFaces(kit: Kit, leg: string, seen: Faces): void {
  kit.check(
    `${leg}: all ${seen.rings} progress rings stand bare, no outline, border or shadow`,
    seen.rings > 0 && seen.ringBoxes.length === 0,
    seen.ringBoxes.join(" | ")
  );
  kit.check(
    `${leg}: no to-do or task id outside the Today frames`,
    seen.ids.length === 0,
    seen.ids.join(" | ")
  );
  kit.check(
    `${leg}: in every plan the times end on one x and the counts on another`,
    seen.ragged.length === 0,
    seen.ragged.join(" | ")
  );
  kit.check(
    `${leg}: the task, delegates and live frames list the same ${seen.todos.task.length} to-dos, word for word`,
    same(seen.todos.task, seen.todos.delegates) &&
      same(seen.todos.task, seen.todos.live),
    JSON.stringify(seen.todos)
  );
}

const spec: Spec = {
  name: "plan-view-preview",
  run: async (kit: Kit) => {
    await build();
    const served = serveFolder();
    mkdirSync(CAPS, { recursive: true });
    try {
      for (const view of ["desk", "phone"] as View[]) {
        for (const theme of THEMES) {
          const leg = `${view} ${theme}`;
          // biome-ignore lint/performance/noAwaitInLoops: one page per leg, in turn
          const page = await kit.page(view, { theme });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          await open(
            page,
            `${served.base}/?theme=${theme}`,
            '[data-slot="phone-screen"] [data-slot="plan-row"]'
          );
          await settle(page);

          checkRows(kit, leg, await readRows(page));
          checkFrames(kit, leg, await readFrames(page));
          checkFaces(kit, leg, await readFaces(page));
          checkLayout(kit, leg, await readLayout(page));
          for (const ink of await readInks(page)) {
            kit.check(
              `${leg}: ${ink.what} holds ${ink.least.toFixed(2)}:1, at least 4.5:1`,
              ink.least >= 4.5
            );
          }

          await capture(page, `${view}-${theme}`);
          kit.check(
            `${leg}: no console errors`,
            errors.length === 0,
            errors.slice(0, 5).join(" | ")
          );
        }
      }
      kit.note(`captures in ${CAPS}`);
    } finally {
      served.stop();
    }
  },
};

export default spec;
