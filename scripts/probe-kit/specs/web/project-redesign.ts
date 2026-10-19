/**
 * The project redesign's options on the workspace's stage (design-explore):
 * each option of the decision page is a states file drawn on the component
 * canvas (the board card today and with one state line, the task pane
 * today and as one unit, the Pipeline as the run order and removed, the
 * empty surfaces today and on the work column, the project head with New
 * session). At 1440×900 and 390×844, light and dark, the canvas sweeps
 * each states file (`by=stage`: the stage's own render, its report kept
 * for the hub) and every frame must draw; the proposed frames are read:
 *
 * - no glyph on a board card under 16px (a session's tree mark counts as
 *   its 18px tile);
 * - the task pane says its stage once: the stage's name stands once among
 *   its chips, its session row and any badge in its head;
 * - the → in Approve is a mark centred on its words' x-height, within 0.5px;
 * - no hairline above or below the review stage;
 * - empty content starts on the work column's start edge, and on a desk
 *   that column stands centred in its area (left gap equals right gap
 *   within 1px);
 * - the starter cards of a surface are all one size;
 * - at 390 no text runs past its frame or is cut without an ellipsis;
 * - no console error.
 *
 * Today's numbers are printed beside each. Every frame of a view's own form
 * is captured to $TMPDIR/caps and the clone's caps/ for a reviewer.
 *
 *   PROBE_STAGE=http://127.0.0.1:<stage port> bun scripts/probe-kit/run.ts web project-redesign
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Kit, Spec } from "../../kit";
import { open, settle, THEMES } from "../../kit";

const STAGE =
  process.env.PROBE_STAGE ??
  (process.env.CAWCO_STAGE_PORT
    ? `http://127.0.0.1:${process.env.CAWCO_STAGE_PORT}`
    : "");

const REPO = join(import.meta.dir, "../../../..");

declare global {
  interface Window {
    /** The component canvas's state (agent stage-host canvas/runtime.ts `CanvasState`), what this spec reads. */
    __cawcoCanvas?: {
      frames: () => { interaction: string; key: string; story: string }[];
      go: (key: string) => void;
      swept: boolean;
      world: () => { x: number; y: number; z: number };
    };
  }
}

const SECTIONS = {
  cardToday: "src/lib/cawco/tasks/TaskCard.stories.ts",
  card: "src/lib/cawco/tasks/TaskCardStateLine.stories.ts",
  paneToday: "src/lib/cawco/tasks/TaskPane.stories.ts",
  pane: "src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts",
  runOrder: "src/lib/cawco/views/ViewPipelineRunOrder.stories.ts",
  removed: "src/lib/cawco/views/preview/PipelineRemovedFixture.stories.ts",
  emptyToday: "src/lib/cawco/project/preview/EmptyTodayFixture.stories.ts",
  empty: "src/lib/cawco/project/WorkColumnEmpty.stories.ts",
  head: "src/lib/cawco/project/ProjectHeadNewSession.stories.ts",
} as const;
type SectionName = keyof typeof SECTIONS;
const PROPOSED: SectionName[] = [
  "card",
  "pane",
  "runOrder",
  "removed",
  "empty",
  "head",
];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The canvas swept the states file, fonts in; why not, when it never does. */
async function sweep(page: Page, file: string, theme: string): Promise<void> {
  try {
    await open(
      page,
      `${STAGE}/@cawco/canvas?file=${encodeURIComponent(file)}&by=stage&scheme=${theme}`,
      // Swept; or, where the installed stage's sweep stops at a story's
      // endless animation (its probe finished every animation), every frame
      // drawn all the same.
      () => {
        if (window.__cawcoCanvas?.swept) {
          return true;
        }
        const rest = [
          ...document.querySelectorAll(
            '.cawco-frame[data-cawco-interaction="rest"]'
          ),
        ];
        return (
          rest.length > 0 &&
          rest.every((frame) =>
            /^(drawn|failed|empty)/.test(
              frame.querySelector(".cawco-frame-status")?.textContent?.trim() ??
                ""
            )
          )
        );
      },
      120_000
    );
  } catch (error) {
    const said = await page.evaluate(() => ({
      canvas: Boolean(window.__cawcoCanvas),
      frames: window.__cawcoCanvas?.frames().length ?? 0,
      errors: (
        (window as unknown as { __cawcoErrors?: { error: unknown }[] })
          .__cawcoErrors ?? []
      )
        .slice(0, 5)
        .map((one) => String(one.error).slice(0, 300)),
      body: document.body.innerText.slice(0, 300),
    }));
    throw new Error(`${file} (${theme}) never swept: ${JSON.stringify(said)}`, {
      cause: error,
    });
  }
  await settle(page, 400);
}

/** Every rest frame whose form is the view's, captured. */
async function capture(
  page: Page,
  section: SectionName,
  view: "desk" | "phone",
  theme: string,
  dirs: string[]
): Promise<{ reads: Read[]; shot: number }> {
  const reads: Read[] = [];
  const frames = await page.evaluate(() =>
    (window.__cawcoCanvas?.frames() ?? [])
      .filter((one) => one.interaction === "rest")
      .map((one) => ({ key: one.key, story: one.story }))
  );
  let shot = 0;
  for (const frame of frames) {
    if (frame.story.includes("Phone") !== (view === "phone")) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one frame brought into view at a time
    await page.evaluate((key) => window.__cawcoCanvas?.go(key), frame.key);
    await settle(page, 250);
    if (view === "phone") {
      // A phone's canvas mounts the one frame it shows: read it now.
      reads.push(
        await page.evaluate(measure, {
          section,
          phone: true,
          story: frame.story,
        })
      );
    }
    const png = await page
      .locator(
        `.cawco-frame[data-cawco-story="${frame.story}"] .cawco-frame-body`
      )
      .first()
      .screenshot({ animations: "disabled" });
    const name = `${section}-${frame.story}-${view}-${theme}.png`;
    await Promise.all(dirs.map((dir) => Bun.write(join(dir, name), png)));
    shot += 1;
  }
  return { reads, shot };
}

interface Read {
  arrow?: { off: number; story: string }[];
  /** Frames whose body drew nothing. */
  blank: string[];
  boardGaps?: { left: number; right: number };
  columns?: {
    leftGap: number;
    lines: number[];
    rightGap: number;
    story: string;
  }[];
  frames: number;
  glyph?: { least: number; where: string };
  hairlines?: { lines: string[]; story: string }[];
  once?: { story: string; times: number; word: string }[];
  overflow?: { faults: string[]; story: string }[];
  stageBorders?: string[];
  starters?: { cards: number; h: number; story: string; w: number }[];
}

/** One states file's frames, read in CSS px of the frame (the world's zoom taken out). */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read per kind of sheet, run in the page in one evaluate
function measure({
  section,
  phone,
  story: only,
}: {
  phone: boolean;
  section: string;
  /** Only this story's frame: the one a phone's canvas has mounted. */
  story?: string;
}): Read {
  const z = window.__cawcoCanvas?.world().z ?? 1;
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left / z,
      right: r.right / z,
      top: r.top / z,
      bottom: r.bottom / z,
      width: r.width / z,
      height: r.height / z,
    };
  };
  const frames = [...document.querySelectorAll<HTMLElement>(".cawco-frame")]
    .filter(
      (frame) =>
        frame.dataset.cawcoInteraction === "rest" &&
        (!only || frame.dataset.cawcoStory === only)
    )
    .map((frame) => ({
      story: frame.dataset.cawcoStory ?? "",
      body: frame.querySelector<HTMLElement>(
        ".cawco-frame-body"
      ) as HTMLElement,
    }));
  const out: Read = {
    frames: frames.length,
    blank: frames
      .filter(
        (one) =>
          !one.body ||
          rect(one.body).height < 8 ||
          one.body.innerText.trim() === ""
      )
      .map((one) => one.story),
  };
  const kind = section.replace("Today", "");

  if (kind === "card") {
    let least = Number.POSITIVE_INFINITY;
    let where = "";
    for (const { story, body } of frames) {
      for (const card of body.querySelectorAll('[data-slot="task-card"]')) {
        const marks = [
          ...[...card.querySelectorAll("svg")].filter(
            (svg) => !svg.closest(".tree-mark")
          ),
          ...card.querySelectorAll('.tree-mark > [data-slot="tile"]'),
        ];
        for (const mark of marks) {
          const r = rect(mark);
          const size = Math.min(r.width, r.height);
          if (r.width > 0 && size < least) {
            least = size;
            where = story;
          }
        }
      }
    }
    out.glyph = { least, where };
  }

  if (kind === "pane") {
    const count = (roots: (Element | null)[], word: string) => {
      const pattern = new RegExp(`\\b${word}\\b`, "gi");
      let n = 0;
      for (const root of roots) {
        if (!(root && word)) {
          continue;
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node.parentElement as Element).closest(".sr-only")) {
            n += (node.textContent ?? "").match(pattern)?.length ?? 0;
          }
        }
      }
      return n;
    };
    out.once = frames.map(({ story, body }) => {
      if (section === "paneToday") {
        const meta = body.querySelector('[data-slot="meta"]');
        const word =
          meta?.querySelector('[aria-label="Stage"]')?.textContent?.trim() ??
          "";
        return { story, word, times: count([meta], word) };
      }
      const head = body.querySelector('[data-slot="head"].head');
      const word =
        head
          ?.querySelector("[data-stage-chip] .chip-label")
          ?.textContent?.trim() ?? "";
      return {
        story,
        word,
        times: count(
          [
            head?.querySelector('[data-slot="chips"]') ?? null,
            head?.querySelector('[data-slot="session-row"]') ?? null,
            ...(head?.querySelectorAll('[data-slot="badge"]') ?? []),
          ],
          word
        ),
      };
    });
    if (section === "pane") {
      out.arrow = frames.flatMap(({ story, body }) => {
        const button = body.querySelector("[data-approve]");
        const mark = button?.querySelector("[data-arrow-mark]");
        if (!(button && mark)) {
          return [];
        }
        const m = rect(mark);
        const mid = (m.top + m.bottom) / 2;
        const off = Math.max(
          ...[...button.querySelectorAll(":scope > span")].map((span) => {
            const r = rect(span);
            return Math.abs((r.top + r.bottom) / 2 - mid);
          })
        );
        return [{ story, off: Math.round(off * 100) / 100 }];
      });
      out.hairlines = frames.flatMap(({ story, body }) => {
        if (!body.querySelector("[data-review-stage]")) {
          return [];
        }
        const lines = [
          '[data-slot="head"].head',
          '[data-slot="content"]',
          "[data-review-stage]",
          '[data-slot="foot"]',
        ].flatMap((selector) => {
          const el = body.querySelector(selector);
          if (!el) {
            return [];
          }
          const style = getComputedStyle(el);
          return [
            style.borderTopStyle !== "none" &&
            Number.parseFloat(style.borderTopWidth) > 0
              ? `${selector} top`
              : "",
            style.borderBottomStyle !== "none" &&
            Number.parseFloat(style.borderBottomWidth) > 0
              ? `${selector} bottom`
              : "",
          ].filter(Boolean);
        });
        return [{ story, lines }];
      });
    } else {
      out.stageBorders = frames.flatMap(({ story, body }) => {
        const stage = body.querySelector('[data-band="stage"]');
        return stage
          ? [
              `${story} ${getComputedStyle(stage).borderTopWidth}/${getComputedStyle(stage).borderBottomWidth}`,
            ]
          : [];
      });
    }
  }

  if (kind === "empty") {
    out.starters = frames.flatMap(({ story, body }) => {
      const cards = [
        ...body.querySelectorAll(
          '[data-slot="starter"], [data-slot="routine-starters"] .kit-chip'
        ),
      ].map(rect);
      if (cards.length === 0) {
        return [];
      }
      const ws = cards.map((one) => one.width);
      const hs = cards.map((one) => one.height);
      return [
        {
          story,
          cards: cards.length,
          w: r1(Math.max(...ws) - Math.min(...ws)),
          h: r1(Math.max(...hs) - Math.min(...hs)),
        },
      ];
    });
    if (section === "empty") {
      out.columns = frames.flatMap(({ story, body }) => {
        const col = body.querySelector<HTMLElement>("[data-work-column]");
        const parent = col?.parentElement;
        if (!(col && parent)) {
          return [];
        }
        const p = rect(parent);
        const style = getComputedStyle(parent);
        const c = rect(col);
        const lines = [
          ...col.querySelectorAll(
            ':scope .kit-empty > *, :scope > .purpose, :scope > [data-slot="starter-cards"]'
          ),
        ].map((el) => r1(rect(el).left - c.left));
        return [
          {
            story,
            leftGap: r1(
              c.left - (p.left + Number.parseFloat(style.paddingLeft))
            ),
            rightGap: r1(
              p.right - Number.parseFloat(style.paddingRight) - c.right
            ),
            lines,
          },
        ];
      });
    } else {
      const board = frames
        .find((one) => one.story === "Board")
        ?.body.querySelector("[data-today-empty]");
      if (board?.parentElement) {
        const p = rect(board.parentElement);
        const style = getComputedStyle(board.parentElement);
        const c = rect(board);
        out.boardGaps = {
          left: r1(c.left - p.left - Number.parseFloat(style.paddingLeft)),
          right: r1(p.right - Number.parseFloat(style.paddingRight) - c.right),
        };
      }
    }
  }

  if (phone) {
    out.overflow = frames
      .filter((one) => one.story.includes("Phone"))
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one sweep of a frame's text, each fault named as it is found
      .map(({ story, body }) => {
        const edge = rect(body);
        const faults: string[] = [];
        if (body.scrollWidth > body.clientWidth + 1) {
          faults.push(
            `scrolls sideways ${body.scrollWidth} > ${body.clientWidth}`
          );
        }
        for (const el of body.querySelectorAll<HTMLElement>("*")) {
          const own = [...el.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              (node.textContent ?? "").trim()
          );
          if (!own || el.closest(".sr-only")) {
            continue;
          }
          const r = rect(el);
          if (r.width === 0) {
            continue;
          }
          let scroller = false;
          for (
            let up = el.parentElement;
            up && up !== body;
            up = up.parentElement
          ) {
            const ox = getComputedStyle(up).overflowX;
            if (
              (ox === "auto" || ox === "scroll") &&
              up.scrollWidth > up.clientWidth
            ) {
              scroller = true;
              break;
            }
          }
          if (
            !scroller &&
            (r.right > edge.right + 1 || r.left < edge.left - 1)
          ) {
            faults.push(
              `${el.className || el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" past the frame`
            );
          }
          const style = getComputedStyle(el);
          const clips =
            style.overflowX === "hidden" || style.overflowX === "clip";
          const clamped =
            style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
          if (
            clips &&
            el.scrollWidth > el.clientWidth + 1 &&
            style.textOverflow !== "ellipsis" &&
            !clamped
          ) {
            faults.push(
              `${el.className || el.tagName} cut without an ellipsis`
            );
          }
        }
        return { story, faults: faults.slice(0, 5) };
      });
  }
  return out;
}

/** A phone's reads, frame by frame, laid over the canvas's own (its frame count). */
function merge(whole: Read, frames: Read[]): Read {
  const all = <K extends keyof Read>(key: K) =>
    frames.flatMap((one) => (one[key] as unknown[] | undefined) ?? []);
  const glyphs = frames.flatMap((one) => (one.glyph ? [one.glyph] : []));
  return {
    ...whole,
    blank: frames.flatMap((one) => one.blank),
    glyph: glyphs.length
      ? glyphs.reduce((a, b) => (b.least < a.least ? b : a))
      : whole.glyph,
    once: all("once") as Read["once"],
    arrow: all("arrow") as Read["arrow"],
    hairlines: all("hairlines") as Read["hairlines"],
    stageBorders: all("stageBorders") as Read["stageBorders"],
    columns: all("columns") as Read["columns"],
    starters: all("starters") as Read["starters"],
    overflow: all("overflow") as Read["overflow"],
  };
}

const spec: Spec = {
  name: "project-redesign",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion of a view and scheme in the order the spec's head lists them
  run: async (kit: Kit) => {
    if (!STAGE) {
      kit.check(
        "the stage's address is known (PROBE_STAGE, or CAWCO_STAGE_PORT inside a workspace)",
        false
      );
      return;
    }
    const dirs = [
      join(process.env.TMPDIR ?? kit.out, "caps"),
      join(REPO, "caps"),
    ];
    await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
    const only = process.env.PROBE_ONLY?.split(",");
    const sections = (Object.keys(SECTIONS) as SectionName[]).filter(
      (one) => !only || only.includes(one)
    );
    let shots = 0;
    for (const view of ["desk", "phone"] as const) {
      for (const theme of THEMES) {
        const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
        // biome-ignore lint/performance/noAwaitInLoops: one view and scheme at a time, each its own page
        const page = await kit.page(view, { theme });
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text().slice(0, 240));
          }
        });
        page.on("pageerror", (error) =>
          errors.push(error.message.slice(0, 240))
        );
        const refused: string[] = [];
        page.on("response", (response) => {
          if (response.status() >= 400) {
            refused.push(
              `${response.status()} ${response.url().slice(0, 160)}`
            );
          }
        });
        const read: Partial<Record<SectionName, Read>> = {};
        for (const section of sections) {
          // biome-ignore lint/performance/noAwaitInLoops: one states file on the canvas at a time
          await sweep(page, SECTIONS[section], theme);
          const whole = await page.evaluate(measure, { section, phone: false });
          const stepped = await capture(page, section, view, theme, dirs);
          shots += stepped.shot;
          read[section] = view === "desk" ? whole : merge(whole, stepped.reads);
        }
        const blank = sections.flatMap((one) =>
          (read[one]?.blank ?? []).map((story) => `${one}/${story}`)
        );
        kit.check(
          `${leg}: every frame of every option draws (${sections.map((one) => `${one} ${read[one]?.frames ?? 0}`).join(", ")})`,
          blank.length === 0 &&
            sections.every((one) => (read[one]?.frames ?? 0) > 0),
          blank.join(", ")
        );
        const { card, cardToday, pane, paneToday, empty, emptyToday } = read;
        if (card?.glyph) {
          kit.check(
            `${leg}: no glyph on a proposed board card under 16px (smallest ${r1(card.glyph.least)}px; today's ${r1(cardToday?.glyph?.least ?? 0)}px)`,
            card.glyph.least >= 15.5,
            card.glyph.where
          );
        }
        if (pane?.once) {
          kit.check(
            `${leg}: the proposed task pane says its stage once in its head (today: ${(paneToday?.once ?? []).map((one) => `${one.story} "${one.word}" ${one.times}×`).join(", ")})`,
            pane.once.every((one) => one.times === 1),
            `\n    ${JSON.stringify(pane.once)}`
          );
          kit.check(
            `${leg}: the → in Approve is a mark centred on its words, within 0.5px (${(pane.arrow ?? []).map((one) => `${one.story} ${one.off}px`).join(", ")})`,
            (pane.arrow ?? []).length > 0 &&
              (pane.arrow ?? []).every((one) => one.off <= 0.5)
          );
          kit.check(
            `${leg}: no hairline above or below the proposed review stage (today's stage: ${(paneToday?.stageBorders ?? []).join(", ")})`,
            (pane.hairlines ?? []).length > 0 &&
              (pane.hairlines ?? []).every((one) => one.lines.length === 0),
            `\n    ${JSON.stringify(pane.hairlines)}`
          );
        }
        if (empty?.columns) {
          kit.check(
            `${leg}: empty content starts on the work column's start edge`,
            empty.columns.length > 0 &&
              empty.columns.every((one) =>
                one.lines.every((x) => Math.abs(x) <= 1)
              ),
            `\n    ${JSON.stringify(empty.columns)}`
          );
          if (view === "desk") {
            const wide = empty.columns.filter((one) =>
              ["Board", "Decisions", "Caw"].includes(one.story)
            );
            kit.check(
              `${leg}: the work column stands centred in a wide area, left gap equal to right gap within 1px (today's empty board: ${JSON.stringify(emptyToday?.boardGaps)})`,
              wide.length === 3 &&
                wide.every((one) => Math.abs(one.leftGap - one.rightGap) <= 1),
              `\n    ${JSON.stringify(wide)}`
            );
          }
          kit.check(
            `${leg}: the starter cards of each surface are one size (today: ${(emptyToday?.starters ?? []).map((one) => `${one.story} ±${one.w}×${one.h}`).join(", ")})`,
            (empty.starters ?? []).length > 0 &&
              (empty.starters ?? []).every((one) => one.w <= 1 && one.h <= 1),
            `\n    ${JSON.stringify(empty.starters)}`
          );
        }
        if (view === "phone") {
          const faults = PROPOSED.filter((one) =>
            sections.includes(one)
          ).flatMap((one) =>
            (read[one]?.overflow ?? [])
              .filter((each) => each.faults.length > 0)
              .map((each) => `${one}/${each.story}: ${each.faults.join("; ")}`)
          );
          kit.check(
            `${leg}: no text overflow or sideways scroll in the proposed phone frames`,
            faults.length === 0,
            faults.length ? `\n    ${faults.join("\n    ")}` : ""
          );
        }
        kit.check(
          `${leg}: no console errors`,
          errors.length === 0,
          errors.length
            ? `\n    ${[...new Set([...errors, ...refused])].slice(0, 12).join("\n    ")}`
            : ""
        );
      }
    }
    kit.note(`${shots} frames captured to ${dirs.join(" and ")}`);
  },
};

export default spec;
