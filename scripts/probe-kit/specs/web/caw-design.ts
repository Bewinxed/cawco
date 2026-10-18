/**
 * Caw's panel design page (apps/dashboard/harness/caw-design), the page the
 * owner picks on: built (`bun harness/build.ts caw-design`) and served as
 * the static folder it is, at 1440×900, 1920×1080 and 390×844 (touch), light
 * and dark, with every panel drawn as a desk's and as a phone's.
 *
 * 1. Every caption starts with its form ("Desk", "Phone"), the frame's own.
 * 2. Each decision (`data-cawco-choice`) holds its options in one row, their
 *    captions and their panels each on one top, each option with one Pick
 *    (`data-option`), no two alike.
 * 3. At a 390 window every phone frame, scrolled to, stands whole at x 0.
 * 4. A phone's head has Close as its last control, its glyph's ink on the
 *    head's trailing edge, and under a finger its hit area is 44px each way.
 *    Every head row is 44px tall.
 * 5. The decided message box (the panel's last row): no leaf of the body
 *    shows under it, and the body scrolled from its top fades its top edge.
 * 6. The alert row: Caw beside the words, the title, line and buttons on
 *    one start edge; the title and the line hold 4.5:1 on the tint and the
 *    way out's edge 3:1 against it.
 * 7. Chips: each narrower than its column and, on one line, as wide as its
 *    glyph, words, gap, padding and edge; at least two share a line; the
 *    first starts on the message box's edge.
 * 8. No task id (`hb-12`, `tsk-12`) in any proposal.
 * 9. The 12px meta lines (the thread's name in the head, the filed tasks'
 *    head and descriptions) hold 4.5:1 on their ground.
 * 10. No console error and no page error.
 *
 * Captures of every option's panels (each state of a two-state option on
 * its own), for a reviewer, go to $TMPDIR/caps/round2/ at 1440 (both forms,
 * both themes) and at 390 (the phone form, both themes).
 *
 *   bun scripts/probe-kit/run.ts web caw-design
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one step at a time
import { mkdir } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { contrast, type Rgb } from "../../ink";
import {
  type Kit,
  open,
  ROOT,
  type Spec,
  settle,
  THEMES,
  type View,
} from "../../kit";

const DASHBOARD = join(ROOT, "apps", "dashboard");
const DIST = join(DASHBOARD, "dist-harness", "caw-design");
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps", "round2");
const FORMS = ["desk", "phone"] as const;
const LEGS: { name: string; view: View; size?: { w: number; h: number } }[] = [
  { name: "1440", view: "desk" },
  { name: "1920", view: "desk", size: { w: 1920, h: 1080 } },
  { name: "390", view: "phone" },
];
/** A task's id as the hub writes it. */
const TASK_ID = /\b(?:hb|tsk)-\d+\b/;
const NOT_LETTERS = /[^a-z]+/g;
const TRAILING_DASH = /-$/;

/** Builds the page, as its folder's README says. */
async function build(): Promise<void> {
  const child = Bun.spawn(["bun", "harness/build.ts", "caw-design"], {
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
      `the page's build exited ${code}: ${(err || out).slice(-2000)}`
    );
  }
}

/** The built folder, served as the static files it is. */
function serve() {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      const file = normalize(join(DIST, path === "/" ? "index.html" : path));
      if (!file.startsWith(DIST)) {
        return new Response(null, { status: 403 });
      }
      return new Response(Bun.file(file));
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

/** A text and its ground, as the screen composites them. */
interface Pair {
  bg: Rgb;
  fg: Rgb;
  what: string;
}

interface Read {
  captions: { text: string; form: string }[];
  chips: {
    box: number;
    column: number;
    left: number;
    lines: number;
    natural: number;
    text: string;
    top: number;
    w: number;
  }[];
  closes: {
    choice: string;
    edge: number;
    hitH: number;
    hitW: number;
    inkEnd: number;
    last: boolean;
    option: string;
  }[];
  fade: number;
  heads: number[];
  ids: string[];
  meta: Pair[];
  notices: {
    act: Pair;
    caw: { left: number; right: number; top: number };
    foot: number;
    h: number;
    line: Pair & { left: number };
    title: Pair & { left: number; top: number };
  }[];
  rows: {
    captionTops: number[];
    choice: string;
    frameTops: number[];
    options: string[];
    picks: number[];
  }[];
  under: string[];
}

/** What the assertions read, from the engine. */
const read = (page: Page): Promise<Read> =>
  page.evaluate((idSource) => {
    const r = (el: Element) => el.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    /** The colours as drawn, the top one last, composited on the canvas. */
    const paint = (layers: string[]): [number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        ctx.fillStyle = "#000";
        ctx.fillStyle = layer;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [red = 0, green = 0, blue = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return [red, green, blue];
    };
    const opaque = (c: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return (ctx.getImageData(0, 0, 1, 1).data[3] ?? 0) === 255;
    };
    /** Every background under an element, the opaque one first. */
    const grounds = (el: Element) => {
      const layers: string[] = [];
      for (let at: Element | null = el; at; at = at.parentElement) {
        const bg = getComputedStyle(at).backgroundColor;
        // biome-ignore lint/performance/useTopLevelRegex: runs in the page, which receives this function's source alone
        const alpha = bg.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/);
        if (alpha && Number(alpha[1] ?? alpha[2]) === 0) {
          continue;
        }
        layers.unshift(bg);
        if (opaque(bg)) {
          break;
        }
      }
      return layers;
    };
    /** A text on its ground, or (`own`) a control's edge on what it stands on. */
    const pair = (el: Element, what: string, own = false) => {
      const under = grounds(own ? (el.parentElement ?? el) : el);
      const style = getComputedStyle(el);
      return {
        what,
        bg: paint(under),
        fg: paint([...under, own ? style.borderTopColor : style.color]),
      };
    };

    const captions = [...document.querySelectorAll("figcaption.caption")].map(
      (one) => ({
        text: (one.textContent ?? "").trim(),
        form:
          one
            .closest("[data-design-frame]")
            ?.getAttribute("data-design-frame") ?? "",
      })
    );
    const rows = [...document.querySelectorAll("[data-cawco-choice]")].map(
      (section) => {
        const frames = [
          ...section.querySelectorAll("[data-design-row] > figure"),
        ];
        return {
          choice: section.getAttribute("data-cawco-choice") ?? "",
          captionTops: frames.map(
            (f) => r(f.querySelector("figcaption") as Element).top
          ),
          frameTops: frames.map(
            (f) => r(f.querySelector("[data-design-option]") as Element).top
          ),
          options: frames.flatMap((f) =>
            [...f.querySelectorAll("[data-option]")].map(
              (b) => b.getAttribute("data-option") ?? ""
            )
          ),
          picks: frames.map((f) => f.querySelectorAll("[data-option]").length),
        };
      }
    );
    const closes = [...document.querySelectorAll("[data-design-panel]")]
      .filter((panel) => panel.closest('[data-design-form="phone"]'))
      .map((panel) => {
        const row = panel.querySelector(
          "[data-design-toolbar-row]"
        ) as HTMLElement;
        const close = panel.querySelector(
          "[data-design-close]"
        ) as HTMLElement | null;
        const controls = [...row.querySelectorAll("button")];
        const glyph = close?.querySelector("svg");
        const after = close ? getComputedStyle(close, "::after") : null;
        return {
          choice:
            panel
              .closest("[data-cawco-choice]")
              ?.getAttribute("data-cawco-choice") ?? "fix",
          option:
            panel
              .closest("[data-design-option]")
              ?.getAttribute("data-design-option") ?? "",
          last: !!close && controls.at(-1) === close,
          inkEnd: glyph ? r(glyph).right : Number.NaN,
          edge:
            r(row).right -
            Number.parseFloat(getComputedStyle(row).paddingRight),
          hitW:
            after && after.content !== "none"
              ? Number.parseFloat(after.width)
              : 0,
          hitH:
            after && after.content !== "none"
              ? Number.parseFloat(after.height)
              : 0,
        };
      });
    const decided = document.querySelector('[data-design-fix="composer"]');
    const room = decided?.querySelector("[data-design-room]") as HTMLElement;
    const shell = decided?.querySelector(
      "[data-design-composer] .kit-dock-shell"
    ) as HTMLElement;
    const port = r(room);
    const box = r(shell);
    const under = [...room.querySelectorAll("*")]
      .filter(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() !== ""
      )
      .filter((el) => {
        const b = r(el);
        const top = Math.max(b.top, port.top);
        const bottom = Math.min(b.bottom, port.bottom);
        return (
          bottom - top > 0.5 &&
          bottom > box.top + 0.5 &&
          top < box.bottom - 0.5 &&
          b.right > box.left + 0.5 &&
          b.left < box.right - 0.5
        );
      })
      .map((el) => (el.textContent ?? "").trim().slice(0, 40));
    const fade =
      room.scrollTop > 0
        ? Number.parseFloat(
            getComputedStyle(room).getPropertyValue("--fade-start")
          )
        : -1;

    const chips = [
      ...document.querySelectorAll(
        '[data-cawco-choice="suggestions"] [data-design-option="chips"] .kit-chip'
      ),
    ].map((chip) => {
      const panel = chip.closest("[data-design-panel]") as HTMLElement;
      const column = chip.closest("[data-design-column]") as HTMLElement;
      const cs = getComputedStyle(column);
      const words = chip.querySelector("span") as HTMLElement;
      const glyph = chip.querySelector("svg") as SVGElement;
      const range = document.createRange();
      range.selectNodeContents(words);
      const lines = new Set(
        [...range.getClientRects()].map((one) => Math.round(one.top))
      ).size;
      const own = getComputedStyle(chip);
      return {
        text: (words.textContent ?? "").trim(),
        w: r(chip).width,
        top: Math.round(r(chip).top),
        left: r(chip).left,
        box: r(
          panel.querySelector(
            "[data-design-composer] .kit-dock-shell"
          ) as Element
        ).left,
        column:
          column.clientWidth -
          Number.parseFloat(cs.paddingLeft) -
          Number.parseFloat(cs.paddingRight),
        lines,
        natural:
          Number.parseFloat(own.paddingLeft) +
          Number.parseFloat(own.paddingRight) +
          Number.parseFloat(own.borderLeftWidth) +
          Number.parseFloat(own.borderRightWidth) +
          r(glyph).width +
          Number.parseFloat(own.columnGap) +
          range.getBoundingClientRect().width,
      };
    });
    const heads = [
      ...document.querySelectorAll("[data-design-toolbar-row]"),
    ].map((row) => r(row).height);
    const notices = [...document.querySelectorAll("[data-design-notice]")].map(
      (one) => {
        const caw = r(one.querySelector("[data-caw-status]") as Element);
        const title = one.querySelector(
          "[data-design-notice-title]"
        ) as Element;
        const line = one.querySelector("[data-design-notice-line]") as Element;
        const act = one.querySelector("[data-design-notice-act]") as Element;
        return {
          caw: { left: caw.left, top: caw.top, right: caw.right },
          title: {
            ...pair(title, "title"),
            left: r(title).left,
            top: r(title).top,
          },
          line: { ...pair(line, "line"), left: r(line).left },
          act: pair(act, "way out", true),
          foot: r(act).left,
          h: r(one).height,
        };
      }
    );
    const idPattern = new RegExp(idSource);
    const ids = [...document.querySelectorAll("[data-design-option]")]
      .filter(
        (option) =>
          !option.closest('[data-cawco-choice="filed-tasks"]') ||
          option.getAttribute("data-design-option") !== "today"
      )
      .flatMap((option) => {
        const walker = document.createTreeWalker(option, NodeFilter.SHOW_TEXT);
        const found: string[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? "";
          if (
            idPattern.test(text) &&
            !node.parentElement?.closest("[data-design-details]")
          ) {
            found.push(text.trim().slice(0, 40));
          }
        }
        return found;
      });
    const meta = [
      ...[
        ...document.querySelectorAll(
          '[data-design-thread-switch="line"] .which'
        ),
      ]
        .slice(0, 1)
        .map((el) => pair(el, "the thread's name in the head")),
      ...[...document.querySelectorAll("[data-design-filed] .head")]
        .slice(0, 1)
        .map((el) => pair(el, "the filed tasks' head")),
      ...[...document.querySelectorAll('[data-design-filed="rows"] .summary')]
        .slice(0, 1)
        .map((el) => pair(el, "a filed task's description")),
    ];
    return {
      captions,
      rows,
      closes,
      under,
      fade,
      chips,
      heads,
      notices,
      ids,
      meta,
    };
  }, TASK_ID.source);

/** Every capture unit: each state of a two-state option, else the option. */
const UNITS =
  "[data-design-option]:not(:has(.state)), [data-design-option] .state";

/**
 * Scrolls each unit's row so the unit starts at the row's start, then reads
 * where each phone screen stands: the 390 window's check.
 */
const placed = (page: Page) =>
  page.evaluate((units) => {
    const out: { left: number; right: number; what: string }[] = [];
    for (const unit of document.querySelectorAll(units)) {
      const row = unit.closest("[data-design-row], .row") as HTMLElement;
      row.style.scrollSnapType = "none";
      row.scrollLeft +=
        unit.getBoundingClientRect().left - row.getBoundingClientRect().left;
      for (const screen of unit.querySelectorAll("[data-design-screen]")) {
        const box = screen.getBoundingClientRect();
        out.push({
          what: `${unit.closest("[data-cawco-choice]")?.getAttribute("data-cawco-choice") ?? "fix"}/${unit.closest("[data-design-option]")?.getAttribute("data-design-option")}`,
          left: box.left,
          right: box.right,
        });
      }
      row.style.scrollSnapType = "";
    }
    return out;
  }, UNITS);

/** At a 390 window, every phone frame scrolled to stands whole at x 0. */
async function assertPlaced(kit: Kit, page: Page, at: string): Promise<void> {
  const screens = await placed(page);
  const out = screens.filter(
    (one) => Math.abs(one.left) > 0.5 || one.right > 390.5
  );
  kit.check(
    `${at}: every phone frame (${screens.length}), scrolled to, stands whole at x 0 in the 390 window`,
    screens.length > 0 && out.length === 0,
    out
      .map(
        (one) => `${one.what}: ${one.left.toFixed(1)}–${one.right.toFixed(1)}`
      )
      .join("; ")
  );
}

/** Each unit, scrolled to its row's start, captured whole. */
async function capture(page: Page, name: string): Promise<void> {
  const units = await page.locator(UNITS).all();
  for (const [at, unit] of units.entries()) {
    const label = await unit.evaluate((el, n) => {
      const row = el.closest("[data-design-row], .row") as HTMLElement;
      row.style.scrollSnapType = "none";
      row.scrollLeft +=
        el.getBoundingClientRect().left - row.getBoundingClientRect().left;
      const choice =
        el.closest("[data-cawco-choice]")?.getAttribute("data-cawco-choice") ??
        "fixed";
      const option =
        el
          .closest("[data-design-option]")
          ?.getAttribute("data-design-option") ?? "";
      const state = el.classList.contains("state")
        ? (el.querySelector(".state-name")?.textContent ?? String(n))
        : "";
      return { choice, option, state };
    }, at);
    const slug = label.state
      ? `-${label.state.toLowerCase().replace(NOT_LETTERS, "-").replace(TRAILING_DASH, "")}`
      : "";
    await unit.screenshot({
      path: join(CAPS, `${name}-${label.choice}-${label.option}${slug}.png`),
    });
    await unit.evaluate((el) => {
      (
        el.closest("[data-design-row], .row") as HTMLElement
      ).style.scrollSnapType = "";
    });
  }
}

/** Every assertion on one form of one leg. */
function assertForm(
  kit: Kit,
  seen: Read,
  at: string,
  form: (typeof FORMS)[number],
  coarse: boolean
): void {
  const word = form === "phone" ? "Phone" : "Desk";
  const off = seen.captions.filter(
    (one) => !one.text.startsWith(one.form === "phone" ? "Phone" : "Desk")
  );
  kit.check(
    `${at}: every caption (${seen.captions.length}) starts with its form, and the switch draws all but the phone's own decision as ${word}`,
    seen.captions.length > 0 &&
      off.length === 0 &&
      seen.captions.filter((one) => one.form === form).length >=
        seen.captions.length - 2,
    off.map((one) => `"${one.text.slice(0, 40)}"`).join("; ")
  );

  for (const row of seen.rows) {
    const spread = (tops: number[]) => Math.max(...tops) - Math.min(...tops);
    kit.check(
      `${at}: ${row.choice}'s ${row.options.length} options share one row, each with one Pick`,
      row.options.length >= 2 &&
        spread(row.captionTops) < 0.5 &&
        spread(row.frameTops) < 0.5 &&
        row.picks.every((n) => n === 1) &&
        new Set(row.options).size === row.options.length,
      `caption tops ${row.captionTops.map(Math.round).join(",")}, frame tops ${row.frameTops.map(Math.round).join(",")}, picks ${row.picks.join(",")}`
    );
  }

  const wrong = seen.closes.filter(
    (one) =>
      !one.last ||
      Math.abs(one.inkEnd - one.edge) > 1 ||
      (coarse && (one.hitW < 43.5 || one.hitH < 43.5))
  );
  kit.check(
    `${at}: every phone head (${seen.closes.length}) ends with Close, its ink on the trailing edge${coarse ? ", 44px under a finger" : ""}`,
    seen.closes.length > 0 && wrong.length === 0,
    wrong
      .slice(0, 3)
      .map(
        (one) =>
          `${one.choice}/${one.option}: last ${one.last}, ink ${one.inkEnd.toFixed(1)} vs edge ${one.edge.toFixed(1)}, hit ${one.hitW}×${one.hitH}`
      )
      .join("; ")
  );
  const tall = seen.heads.filter((h) => Math.abs(h - 44) > 0.5);
  kit.check(
    `${at}: every head row (${seen.heads.length}) is 44px tall`,
    seen.heads.length > 0 && tall.length === 0,
    tall.map((h) => h.toFixed(1)).join(",")
  );

  kit.check(
    `${at}: the decided message box: no leaf of the body shows under it`,
    seen.under.length === 0,
    seen.under.join(" | ")
  );
  kit.check(
    `${at}: the decided panel, scrolled, fades its top edge (${seen.fade}px)`,
    seen.fade > 0
  );

  const skew = seen.notices.filter(
    (one) =>
      Math.abs(one.title.left - one.line.left) > 0.5 ||
      Math.abs(one.title.left - one.foot) > 0.5 ||
      one.caw.right > one.title.left ||
      Math.abs(one.caw.top - one.title.top) > 3
  );
  kit.check(
    `${at}: in every alert row (${seen.notices.length}) the title, line and buttons share one start edge, Caw beside them from the title's top`,
    seen.notices.length > 0 && skew.length === 0,
    skew
      .map(
        (one) =>
          `caw ${one.caw.left.toFixed(0)}–${one.caw.right.toFixed(0)}; title ${one.title.left.toFixed(1)}, line ${one.line.left.toFixed(1)}, foot ${one.foot.toFixed(1)}`
      )
      .join("; ")
  );
  kit.note(
    `${at}: the alert rows stand ${seen.notices.map((one) => one.h.toFixed(1)).join(", ")}px tall`
  );
  for (const one of seen.notices) {
    const title = contrast(one.title.fg, one.title.bg);
    const line = contrast(one.line.fg, one.line.bg);
    const act = contrast(one.act.fg, one.act.bg);
    kit.check(
      `${at}: an alert row's title holds ${title.toFixed(2)}:1 and its line ${line.toFixed(2)}:1 on the tint (4.5:1), its way out's edge ${act.toFixed(2)}:1 against it (3:1)`,
      title >= 4.5 && line >= 4.5 && act >= 3,
      `tint rgb(${one.title.bg.join(",")})`
    );
  }

  const loose = seen.chips.filter(
    (one) =>
      one.w >= one.column - 0.5 ||
      (one.lines === 1 && Math.abs(one.w - one.natural) > 1)
  );
  const [first] = seen.chips;
  const lines = new Map<number, number>();
  for (const one of seen.chips) {
    lines.set(one.top, (lines.get(one.top) ?? 0) + 1);
  }
  const shared = Math.max(0, ...lines.values());
  kit.check(
    `${at}: ${seen.chips.length} chips, each narrower than its column (${Math.round(first?.column ?? 0)}px) and as wide as its words, ${shared} on one line, the first on the message box's edge`,
    seen.chips.length > 0 &&
      loose.length === 0 &&
      shared >= 2 &&
      !!first &&
      Math.abs(first.left - first.box) < 0.5,
    `${loose.map((one) => `"${one.text}": ${one.w.toFixed(1)} vs ${one.natural.toFixed(1)}`).join("; ")}; first ${first?.left.toFixed(1)} vs box ${first?.box.toFixed(1)}`
  );

  kit.check(
    `${at}: no task id in any proposal`,
    seen.ids.length === 0,
    seen.ids.join(" | ")
  );
  for (const one of seen.meta) {
    const ratio = contrast(one.fg, one.bg);
    kit.check(
      `${at}: ${one.what} holds ${ratio.toFixed(2)}:1 on its ground (4.5:1)`,
      ratio >= 4.5
    );
  }
}

const spec: Spec = {
  name: "caw-design",
  run: async (kit) => {
    await build();
    const served = serve();
    await mkdir(CAPS, { recursive: true });
    try {
      for (const leg of LEGS) {
        for (const theme of THEMES) {
          const page = await kit.page(leg.view, { theme });
          if (leg.size) {
            await page.setViewportSize({
              width: leg.size.w,
              height: leg.size.h,
            });
          }
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          const coarse = leg.view === "phone";
          for (const form of FORMS) {
            const at = `${leg.name} ${theme} ${form}`;
            await open(
              page,
              `${served.base}/?form=${form}`,
              "[data-cawco-choice]"
            );
            await settle(page, 400);
            assertForm(kit, await read(page), at, form, coarse);
            if (leg.name === "390") {
              await assertPlaced(kit, page, at);
            }
            if (
              leg.name === "1440" ||
              (leg.name === "390" && form === "phone")
            ) {
              await capture(page, `${leg.name}-${theme}-${form}`);
            }
          }
          kit.check(
            `${leg.name} ${theme}: no console or page error`,
            errors.length === 0,
            errors.slice(0, 5).join(" | ")
          );
          await page.close();
        }
      }
    } finally {
      served.stop();
    }
  },
};
export default spec;
