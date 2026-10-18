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
 * 3. A phone's head has Close as its last control, its glyph's ink on the
 *    head's trailing edge (the panel's edge less the head's inset), and
 *    under a finger its hit area is 44px each way.
 * 4. The message box as the panel's last row (composer › foot): no leaf of
 *    the body shows under it; floating (overlay), some row does.
 * 5. Chips sized to their words (suggestions › chips): each chip narrower
 *    than the column, and a one-line chip as wide as its glyph, words,
 *    gap, padding and edge.
 * 6. No console error and no page error.
 *
 * Captures of every option, for a reviewer, go to $TMPDIR/caps/ at 1440
 * (both forms, both themes) and at 390 (the phone form, both themes).
 *
 *   bun scripts/probe-kit/run.ts web caw-design
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one step at a time
import { mkdir } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
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
const CAPS = join(process.env.TMPDIR ?? "/tmp", "caps");
const FORMS = ["desk", "phone"] as const;
const LEGS: { name: string; view: View; size?: { w: number; h: number } }[] = [
  { name: "1440", view: "desk" },
  { name: "1920", view: "desk", size: { w: 1920, h: 1080 } },
  { name: "390", view: "phone" },
];

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

interface Read {
  captions: { text: string; form: string }[];
  chips: {
    text: string;
    w: number;
    column: number;
    lines: number;
    natural: number;
    left: number;
    start: number;
  }[];
  closes: {
    choice: string;
    option: string;
    last: boolean;
    inkEnd: number;
    edge: number;
    hitW: number;
    hitH: number;
  }[];
  dockFoot: number[];
  foot: { option: string; under: string[] }[];
  heads: number[];
  notices: {
    caw: { left: number; top: number; right: number };
    title: { left: number; top: number };
    line: number;
    foot: number;
  }[];
  rows: {
    choice: string;
    captionTops: number[];
    frameTops: number[];
    options: string[];
    picks: number[];
  }[];
}

/** What the assertions read, from the engine. */
const read = (page: Page): Promise<Read> =>
  page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect();
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
        const head = getComputedStyle(row);
        return {
          choice:
            panel
              .closest("[data-cawco-choice]")
              ?.getAttribute("data-cawco-choice") ?? "",
          option:
            panel
              .closest("[data-design-option]")
              ?.getAttribute("data-design-option") ?? "",
          last: !!close && controls.at(-1) === close,
          inkEnd: glyph ? r(glyph).right : Number.NaN,
          edge: r(row).right - Number.parseFloat(head.paddingRight),
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
    const visible = (el: Element, port: DOMRect) => {
      const b = r(el);
      const top = Math.max(b.top, port.top);
      const bottom = Math.min(b.bottom, port.bottom);
      const left = Math.max(b.left, port.left);
      const right = Math.min(b.right, port.right);
      return bottom - top > 0.5 && right - left > 0.5
        ? { top, bottom, left, right }
        : null;
    };
    const foot = [
      ...document.querySelectorAll(
        '[data-cawco-choice="composer"] [data-design-option]'
      ),
    ].map((option) => {
      const room = option.querySelector("[data-design-room]") as HTMLElement;
      const shell = option.querySelector(
        "[data-design-composer] .kit-dock-shell"
      ) as HTMLElement;
      const port = r(room);
      const box = r(shell);
      const leaves = [...room.querySelectorAll("*")].filter(
        (el) => el.children.length === 0 && (el.textContent ?? "").trim() !== ""
      );
      const under = leaves
        .map((el) => ({ el, seen: visible(el, port) }))
        .filter(
          ({ seen }) =>
            seen &&
            seen.bottom > box.top + 0.5 &&
            seen.top < box.bottom - 0.5 &&
            seen.right > box.left + 0.5 &&
            seen.left < box.right - 0.5
        )
        .map(({ el }) => (el.textContent ?? "").trim().slice(0, 40));
      return { option: option.getAttribute("data-design-option") ?? "", under };
    });
    const chips = [
      ...document.querySelectorAll(
        '[data-cawco-choice="suggestions"] [data-design-option="chips"] .kit-chip'
      ),
    ].map((chip) => {
      const column = chip.closest("[data-design-column]") as HTMLElement;
      const cs = getComputedStyle(column);
      const words = chip.querySelector("span:not([data-box])") as HTMLElement;
      const glyph = chip.querySelector("svg") as SVGElement;
      const range = document.createRange();
      range.selectNodeContents(words);
      const lines = new Set(
        [...range.getClientRects()].map((one) => Math.round(one.top))
      ).size;
      const own = getComputedStyle(chip);
      const natural =
        Number.parseFloat(own.paddingLeft) +
        Number.parseFloat(own.paddingRight) +
        Number.parseFloat(own.borderLeftWidth) +
        Number.parseFloat(own.borderRightWidth) +
        r(glyph).width +
        Number.parseFloat(own.columnGap) +
        range.getBoundingClientRect().width;
      return {
        text: (words.textContent ?? "").trim(),
        w: r(chip).width,
        column:
          column.clientWidth -
          Number.parseFloat(cs.paddingLeft) -
          Number.parseFloat(cs.paddingRight),
        lines,
        natural,
        left: r(chip).left,
        start: r(column).left + Number.parseFloat(cs.paddingLeft),
      };
    });
    const heads = [
      ...document.querySelectorAll("[data-design-toolbar-row]"),
    ].map((row) => r(row).height);
    const notices = [...document.querySelectorAll("[data-design-notice]")].map(
      (one) => {
        const caw = r(one.querySelector("[data-caw-status]") as Element);
        const title = r(
          one.querySelector('[data-slot="alert-title"]') as Element
        );
        return {
          caw: { left: caw.left, top: caw.top, right: caw.right },
          title: { left: title.left, top: title.top },
          line: r(
            one.querySelector('[data-slot="alert-description"]') as Element
          ).left,
          foot: r(
            one.querySelector("[data-design-notice-foot] button") as Element
          ).left,
        };
      }
    );
    const dockFoot = [
      ...document.querySelectorAll('[data-design-composer="dock"]'),
    ].map((dock) => r(dock.closest("[data-design-foot]") as Element).height);
    return { captions, rows, closes, foot, chips, heads, notices, dockFoot };
  });

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
    `${at}: every caption (${seen.captions.length}) starts with its form`,
    seen.captions.length > 0 && off.length === 0,
    off.map((one) => `"${one.text.slice(0, 40)}"`).join("; ")
  );
  kit.check(
    `${at}: the page's switch draws every frame but the phone's own decision as ${word}`,
    seen.captions
      .filter(
        (one) =>
          !(
            one.text.includes("A sheet from the foot") ||
            one.text.includes("Hanging from his tab")
          )
      )
      .every((one) => one.text.startsWith(word))
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

  const phoneHeads = seen.closes;
  const wrong = phoneHeads.filter(
    (one) =>
      !one.last ||
      Math.abs(one.inkEnd - one.edge) > 1 ||
      (coarse && (one.hitW < 43.5 || one.hitH < 43.5))
  );
  kit.check(
    `${at}: every phone head (${phoneHeads.length}) ends with Close, its ink on the trailing edge${coarse ? ", 44px under a finger" : ""}`,
    phoneHeads.length > 0 && wrong.length === 0,
    wrong
      .slice(0, 3)
      .map(
        (one) =>
          `${one.choice}/${one.option}: last ${one.last}, ink ${one.inkEnd.toFixed(1)} vs edge ${one.edge.toFixed(1)}, hit ${one.hitW}×${one.hitH}`
      )
      .join("; ")
  );

  const dock = seen.foot.find((one) => one.option === "foot");
  const floating = seen.foot.find((one) => one.option === "overlay");
  kit.check(
    `${at}: as the panel's last row, no leaf of the body shows under the message box`,
    !!dock && dock.under.length === 0,
    dock?.under.join(" | ")
  );
  kit.check(
    `${at}: floating, the conversation runs under the message box`,
    !!floating && floating.under.length > 0
  );

  const loose = seen.chips.filter(
    (one) =>
      one.w >= one.column - 0.5 ||
      (one.lines === 1 && Math.abs(one.w - one.natural) > 1)
  );
  kit.check(
    `${at}: each of ${seen.chips.length} chips is narrower than its column (${Math.round(seen.chips[0]?.column ?? 0)}px) and as wide as its words`,
    seen.chips.length > 0 && loose.length === 0,
    loose
      .map(
        (one) =>
          `"${one.text}": ${one.w.toFixed(1)} vs words ${one.natural.toFixed(1)}, ${one.lines} lines`
      )
      .join("; ")
  );

  const tall = seen.heads.filter((h) => Math.abs(h - 44) > 0.5);
  kit.check(
    `${at}: every head row (${seen.heads.length}) is 44px tall`,
    seen.heads.length > 0 && tall.length === 0,
    tall.map((h) => h.toFixed(1)).join(",")
  );
  const skew = seen.notices.filter(
    (one) =>
      Math.abs(one.title.left - one.line) > 0.5 ||
      Math.abs(one.title.left - one.foot) > 0.5 ||
      one.caw.right > one.title.left ||
      Math.abs(one.caw.top - one.title.top) > 3
  );
  kit.check(
    `${at}: in every alert row (${seen.notices.length}) the title, line and buttons share one start edge, Caw beside them from the title's top`,
    seen.notices.length > 0 && skew.length === 0,
    seen.notices
      .map(
        (one) =>
          `caw ${one.caw.left.toFixed(0)}–${one.caw.right.toFixed(0)} top ${one.caw.top.toFixed(0)}; title ${one.title.left.toFixed(1)} top ${one.title.top.toFixed(0)}, line ${one.line.toFixed(1)}, foot ${one.foot.toFixed(1)}`
      )
      .join("; ")
  );
  const [first] = seen.chips;
  kit.check(
    `${at}: the chips start on the panel's start edge`,
    !!first && Math.abs(first.left - first.start) < 0.5,
    first ? `${first.left.toFixed(1)} vs ${first.start.toFixed(1)}` : "none"
  );
  kit.note(
    `${at}: the docked foot is ${[...new Set(seen.dockFoot.map((h) => h.toFixed(1)))].join(", ")}px tall`
  );
}

/** Each option's panels, captured for the reviewer. */
async function capture(page: Page, name: string): Promise<void> {
  for (const option of await page
    .locator("[data-cawco-choice] [data-design-option]")
    .all()) {
    const choice = await option.evaluate(
      (el) =>
        el.closest("[data-cawco-choice]")?.getAttribute("data-cawco-choice") ??
        ""
    );
    const id = await option.getAttribute("data-design-option");
    await option.screenshot({
      path: join(CAPS, `${name}-${choice}-${id}.png`),
      animations: "disabled",
    });
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
            const seen = await read(page);

            assertForm(kit, seen, at, form, coarse);
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
