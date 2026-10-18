/**
 * The plan-view design preview (apps/dashboard/preview/plan-view), built and
 * served as the static folder the owner is shown, at a desk's 1440×900 and a
 * phone's 390×844 (touch), light and dark:
 *
 * - every frame's caption starts "Desk" or "Phone";
 * - no row's words run past their frame, and the page never scrolls sideways;
 * - the task-attempt frames draw one list: no second "To-dos" head or list;
 * - every row in a phone frame is 44px tall or more;
 * - nothing is written to the console as an error.
 *
 * Each frame is captured to `$TMPDIR/caps/` for a reviewer.
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
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");

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

interface Reading {
  captions: string[];
  /** Caw's needs-you faces, and how many have a drawn canvas. */
  faces: { drawn: number; total: number };
  /** The intro's title is what a press there lands on: no sheet or scrim spilt over the page. */
  introClear: boolean;
  /** Sheets not standing on their screen's foot, inside it. */
  loose: string[];
  overflows: string[];
  pageWide: { scroll: number; view: number };
  phoneRows: number;
  rails: number;
  sheets: number;
  shortPhoneRows: string[];
  taskFrames: { heads: string[]; lists: number }[];
  /** Rails whose position was never measured (still at their 0px default). */
  unmeasuredRails: number;
}

type Rows = Pick<
  Reading,
  | "captions"
  | "overflows"
  | "pageWide"
  | "phoneRows"
  | "shortPhoneRows"
  | "taskFrames"
>;
type Frames = Omit<Reading, keyof Rows>;

/** A caption names its frame first: "Desk · …" or "Phone · …". */
const CAPTION = /^(Desk|Phone) · \S/;

/** The rows: their words, their heights, the task frames' lists, the captions. */
const readRows = (page: Page): Promise<Rows> =>
  page.evaluate(() => {
    const frameOf = (el: Element) =>
      el.closest('[data-slot="phone-screen"], .desk') as HTMLElement | null;
    const overflows: string[] = [];
    for (const words of document.querySelectorAll(
      '[data-slot="words"], [data-slot="wait"], [data-slot="today-body"] [data-slot="text"]'
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
    const shortPhoneRows = phoneRows
      .filter((row) => row.getBoundingClientRect().height < 44)
      .map(
        (row) =>
          `${row.querySelector('[data-slot="words"]')?.textContent} ${row.getBoundingClientRect().height}px`
      );
    const task = document.getElementById("task");
    const taskFrames = [
      ...(task?.querySelectorAll('.desk, [data-slot="phone-screen"]') ?? []),
    ].map((frame) => ({
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
      shortPhoneRows,
      taskFrames,
    };
  });

/** The frames: each phone sheet's place, the rails, Caw's faces, the intro's clear. */
const readFrames = (page: Page): Promise<Frames> =>
  page.evaluate(() => {
    const loose: string[] = [];
    const screens = [
      ...document.querySelectorAll('[data-slot="phone-screen"]'),
    ];
    let sheets = 0;
    for (const screen of screens) {
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
    const unmeasuredRails = rails.filter(
      (rail) =>
        getComputedStyle(rail).getPropertyValue("--nest-x").trim() === "0px"
    ).length;
    const faces = [...document.querySelectorAll('[data-slot="wait"] canvas')];
    const h1 = document.querySelector("h1");
    const at = h1?.getBoundingClientRect();
    const hit = at
      ? document.elementFromPoint(at.left + 4, at.top + at.height / 2)
      : null;
    return {
      introClear: !!h1 && !!hit && h1.contains(hit),
      unmeasuredRails,
      rails: rails.length,
      faces: {
        total: faces.length,
        drawn: faces.filter((face) => (face as HTMLCanvasElement).width > 0)
          .length,
      },
      loose,
      sheets,
    };
  });

const read = async (page: Page): Promise<Reading> => ({
  ...(await readRows(page)),
  ...(await readFrames(page)),
});

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
          const seen = await read(page);

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
            `${leg}: the task frames draw one list and no "To-dos" head (${seen.taskFrames.length} frames)`,
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
            `${leg}: Caw's needs-you face is drawn (${seen.faces.drawn} of ${seen.faces.total})`,
            seen.faces.total > 0 && seen.faces.drawn === seen.faces.total
          );
          kit.check(
            `${leg}: nothing from a sheet covers the page's intro`,
            seen.introClear
          );

          // Every frame, captured for the reviewer.
          await page.screenshot({
            path: join(CAPS, `${view}-${theme}-00-intro.png`),
          });
          const figures = await page.locator("figure").all();
          for (const [index, figure] of figures.entries()) {
            // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, each scrolled into view and settled
            const section = await figure.evaluate(
              (node) => node.closest("section")?.id ?? "page"
            );
            const kind = (
              (await figure.locator("figcaption").textContent()) ?? ""
            ).startsWith("Desk")
              ? "desk"
              : "phone";
            await figure.scrollIntoViewIfNeeded();
            await settle(page);
            await figure.screenshot({
              path: join(
                CAPS,
                `${view}-${theme}-${String(index + 1).padStart(2, "0")}-${section}-${kind}.png`
              ),
            });
          }

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
