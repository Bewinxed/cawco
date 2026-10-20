/**
 * The two decision pages waiting for the owner, drawn as he will see them,
 * with no hub: the plan grill (.design-foundations/decisions/
 * plan-model-grill/page.oui) and the project screens
 * (.design-foundations/decisions/project-screens/page.oui), drawn by the
 * hub's decision host on the dashboard's stage (decision-embeds.ts); each
 * `Preview("@name")` is the component canvas of the states file its
 * folder's README maps it to.
 *
 * 1. Each program, its placeholders given artifact ids, passes the hub's
 *    own check (`checkProgram`): ids, `after`s, words, media.
 * 2. Each proposed states file at 1440×900 and 390×844, light and dark:
 *    every frame draws; no board-card glyph under 16px; the task pane says
 *    its stage once in its head; Approve's → sits on its words' centre
 *    within 0.5px; no hairline above or below the review stage; empty
 *    content starts on the work column's edge, the column centred in a
 *    wide area within 1px, every starter card of a surface one size; at
 *    390 no text past its frame or cut without an ellipsis.
 * 3. Each page at 1440×900 and 390×844, light and dark: its card count and
 *    questions read from the DOM; each card offers 2 to 5 options, each
 *    with a cost line, exactly one Recommended, which stands over its
 *    option's label. Every embed, scrolled to as the person would, read in
 *    its own frame: its pixels painted (not one flat colour), the stories
 *    its Preview names drawn (every story when it names none), each with
 *    words in it, none of the canvas's working chrome seen (band, crumb,
 *    foot, steps, section heads, labels, statuses), its words at 12px or
 *    more as drawn and every frame inside the embed's width, and the embed
 *    as tall as what it draws. Each frame it shows is shot where the person
 *    sees it (canvas-shots.ts `shootEmbedded`): nothing over it, not one
 *    colour, its pixels its DOM's paint. Each option as
 *    tall as its own content (a chip no taller than its row's tallest
 *    content); at 390 the note and Send picks 44px tall (DESIGN.md, The 44
 *    Touch Rule); the cost line, the state, the count, the note's
 *    placeholder, the Recommended tag and an option's line at 4.5:1 or more
 *    on what they stand on, and no offline notice (the page is CawCo's,
 *    through its bridge); nothing scrolls sideways past the window (a story
 *    too wide for its card at 10px words scrolls in its own frame); no
 *    console error.
 *
 * Captures and their manifest go to .probe/decision-pages/ for a reviewer.
 *
 *   bun scripts/probe-kit/run.ts web decision-pages-ready
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one states file, one leg at a time
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  capturePage,
  EMBED_FRAME,
  embedDrawFaults,
  embedPaints,
  idOf,
  readEmbeds,
  STAGE_START_MS,
  startDecisionStage,
} from "../../decision-embeds";
import { type Kit, ROOT, SCALE, type Spec, settle, THEMES } from "../../kit";

const OUT = join(ROOT, ".probe/decision-pages");

/** Each states file a page embeds, by its placeholder, from apps/dashboard. */
const FILES: Record<string, string> = {
  pane: "src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts",
  card: "src/lib/cawco/tasks/TaskCardStateLine.stories.ts",
  empty: "src/lib/cawco/project/WorkColumnEmpty.stories.ts",
  head: "src/lib/cawco/project/ProjectHeadNewSession.stories.ts",
  "run-order": "src/lib/cawco/views/ViewPipelineRunOrder.stories.ts",
  removed: "src/lib/cawco/views/preview/PipelineRemovedFixture.stories.ts",
};

const PAGES = [
  {
    name: "plan-model-grill",
    folder: ".design-foundations/decisions/plan-model-grill",
  },
  {
    name: "project-screens",
    folder: ".design-foundations/decisions/project-screens",
  },
] as const;

const PLACEHOLDER = /"@([a-z0-9-]+)"/g;
const PREVIEW = /\bPreview\(/g;
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Read {
  arrow?: { off: number; story: string }[];
  blank: string[];
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
  starters?: { cards: number; h: number; story: string; w: number }[];
}

/** One states file's frames, read in CSS px of the frame (the world's zoom taken out). */
function measure({
  section,
  phone,
  story: only,
}: {
  phone: boolean;
  section: string;
  story?: string;
}): Read {
  const z = window.__cawcoCanvas?.world().z ?? 1;
  const round = (n: number) => Math.round(n * 10) / 10;
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

  if (section === "card") {
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

  if (section === "pane") {
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
  }

  if (section === "empty") {
    out.starters = frames.flatMap(({ story, body }) => {
      const cards = [...body.querySelectorAll('[data-slot="starter"]')].map(
        rect
      );
      if (cards.length === 0) {
        return [];
      }
      const ws = cards.map((one) => one.width);
      const hs = cards.map((one) => one.height);
      return [
        {
          story,
          cards: cards.length,
          w: round(Math.max(...ws) - Math.min(...ws)),
          h: round(Math.max(...hs) - Math.min(...hs)),
        },
      ];
    });
    out.columns = frames.flatMap(({ story, body }) => {
      const col = body.querySelector<HTMLElement>("[data-work-column]");
      // The first ancestor with a box: a decorator's wrapper may be `display: contents`.
      let parent = col?.parentElement ?? null;
      while (parent && getComputedStyle(parent).display === "contents") {
        parent = parent.parentElement;
      }
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
      ].map((el) => round(rect(el).left - c.left));
      return [
        {
          story,
          leftGap: round(
            c.left - (p.left + Number.parseFloat(style.paddingLeft))
          ),
          rightGap: round(
            p.right - Number.parseFloat(style.paddingRight) - c.right
          ),
          lines,
        },
      ];
    });
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
          // Unseen text (a field's hidden measuring twin, autosize.svelte.ts) is no one's to read.
          if (
            !own ||
            el.closest(".sr-only") ||
            getComputedStyle(el).visibility === "hidden"
          ) {
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

/** The canvas swept a states file, or every rest frame says how it drew. */
function drawn(): boolean {
  if (window.__cawcoCanvas?.swept) {
    return true;
  }
  const rest = [
    ...document.querySelectorAll('.cawco-frame[data-cawco-interaction="rest"]'),
  ];
  return (
    rest.length > 0 &&
    rest.every((frame) =>
      // biome-ignore lint/performance/useTopLevelRegex: this runs in the page, which sees none of the module's scope
      /^(drawn|failed|empty)/.test(
        frame.querySelector(".cawco-frame-status")?.textContent?.trim() ?? ""
      )
    )
  );
}

/** Each rest frame's status that is not "drawn"; a phone's frames off its one view say "unshown", stepped to one by one. */
function undrawn(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].flatMap((frame) => {
    const status =
      frame.querySelector(".cawco-frame-status")?.textContent?.trim() ?? "";
    return status.startsWith("drawn") || status.startsWith("unshown")
      ? []
      : [`${frame.dataset.cawcoStory}: ${status || "no status"}`];
  });
}

/** One states file on the canvas, swept, then read whole and frame by frame on a phone. */
async function sweepFile(
  page: Page,
  stage: number,
  section: string,
  phone: boolean,
  theme: string
): Promise<Read> {
  const file = FILES[section] ?? "";
  await page.goto(
    `http://127.0.0.1:${stage}/@cawco/canvas?file=${encodeURIComponent(file)}&by=stage&scheme=${theme}`,
    { waitUntil: "domcontentloaded" }
  );
  // A sweep that never ends is this file's fault, read with the rest, never the run's end.
  const swept = await page
    .waitForFunction(drawn, null, { timeout: STAGE_START_MS })
    .then(
      () => true,
      () => false
    );
  await page.evaluate(() => document.fonts.ready);
  await settle(page, 400);
  const whole = await page.evaluate(measure, { section, phone: false });
  whole.blank = [
    ...whole.blank,
    ...(swept
      ? []
      : [`the stage's sweep didn't end in ${STAGE_START_MS / 1000} s`]),
    ...(await page.evaluate(undrawn)),
  ];
  if (!phone) {
    return whole;
  }
  const stories = await page.evaluate(() =>
    (window.__cawcoCanvas?.frames() ?? [])
      .filter((one) => one.interaction === "rest")
      .map((one) => ({ key: one.key, story: one.story }))
  );
  // A phone shows one frame at a time, so the others have no box: each is read once stepped to.
  whole.blank = [
    ...(swept
      ? []
      : [`the stage's sweep didn't end in ${STAGE_START_MS / 1000} s`]),
    ...(await page.evaluate(undrawn)),
  ];
  const reads: Read[] = [];
  for (const frame of stories) {
    await page.evaluate((key) => window.__cawcoCanvas?.go(key), frame.key);
    await settle(page, 250);
    // The status follows the next render report, which waits for the page to go quiet.
    await page
      .waitForFunction(
        (key) =>
          ["drawn", "failed", "empty"].includes(
            document.querySelector<HTMLElement>(
              `.cawco-frame[data-cawco-key="${CSS.escape(key)}"] .cawco-frame-status`
            )?.dataset.state ?? ""
          ),
        frame.key,
        { timeout: 15_000 }
      )
      .catch(() => undefined);
    const shown = await page.evaluate(
      (key) =>
        document.querySelector<HTMLElement>(
          `.cawco-frame[data-cawco-key="${CSS.escape(key)}"] .cawco-frame-status`
        )?.dataset.state ?? "",
      frame.key
    );
    if (shown !== "drawn") {
      whole.blank.push(`${frame.story}: ${shown || "no status"} once shown`);
    }
    if (frame.story.includes("Phone")) {
      reads.push(
        await page.evaluate(measure, {
          section,
          phone: true,
          story: frame.story,
        })
      );
    }
  }
  const all = <K extends keyof Read>(key: K) =>
    reads.flatMap((one) => (one[key] as unknown[] | undefined) ?? []);
  const glyphs = reads.flatMap((one) => (one.glyph ? [one.glyph] : []));
  return {
    ...whole,
    glyph: glyphs.length
      ? glyphs.reduce((a, b) => (b.least < a.least ? b : a))
      : whole.glyph,
    once: [
      ...(whole.once ?? []),
      ...(all("once") as NonNullable<Read["once"]>),
    ],
    columns: [
      ...(whole.columns ?? []),
      ...(all("columns") as NonNullable<Read["columns"]>),
    ],
    starters: [
      ...(whole.starters ?? []),
      ...(all("starters") as NonNullable<Read["starters"]>),
    ],
    overflow: all("overflow") as Read["overflow"],
  };
}

/**
 * The page's own controls, read from the engine: each option chip's height
 * against what its row's tallest content needs, the Recommended tag's top
 * against its label's, the note's and Send picks' heights, and the
 * contrast of each muted line on what it stands on (every ancestor's fill
 * and opacity composited, colours as the engine paints them).
 */
function readControls() {
  const paint = document.createElement("canvas");
  paint.width = 1;
  paint.height = 1;
  const ctx = paint.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgba = (colour: string): number[] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [
      d[0] as number,
      d[1] as number,
      d[2] as number,
      (d[3] as number) / 255,
    ];
  };
  const over = (base: number[], top: number[], a: number) =>
    base.map((v, i) => v * (1 - a) + (top[i] as number) * a);
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const x = v / 255;
      return x <= 0.039_28 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * f(c[0] as number) +
      0.7152 * f(c[1] as number) +
      0.0722 * f(c[2] as number)
    );
  };
  const ratio = (el: Element | null, pseudo?: string) => {
    if (!el) {
      return null;
    }
    const chain: Element[] = [];
    for (let at: Element | null = el; at; at = at.parentElement) {
      chain.unshift(at);
    }
    let base = [255, 255, 255];
    let opacity = 1;
    for (const at of chain) {
      const style = getComputedStyle(at);
      opacity *= Number(style.opacity);
      const fill = rgba(style.backgroundColor);
      base = over(base, fill, (fill[3] as number) * opacity);
    }
    const ink = rgba(getComputedStyle(el, pseudo).color);
    const inked = over(base, ink, (ink[3] as number) * opacity);
    const [hi, lo] = [lum(inked), lum(base)].sort((a, b) => b - a) as [
      number,
      number,
    ];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const shown = (el: Element) => el.getBoundingClientRect().height > 0;
  const chips = [...document.querySelectorAll<HTMLElement>(".dp-opt")].filter(
    shown
  );
  /** What a chip's content needs: its children's span, its padding and border. */
  const need = (chip: HTMLElement) => {
    const kids = [...chip.children]
      .filter(shown)
      .map((el) => el.getBoundingClientRect());
    const style = getComputedStyle(chip);
    const edge = [
      "paddingTop",
      "paddingBottom",
      "borderTopWidth",
      "borderBottomWidth",
    ]
      .map((key) => Number.parseFloat(style[key as "paddingTop"]))
      .reduce((a, b) => a + b, 0);
    return kids.length
      ? Math.max(...kids.map((r) => r.bottom)) -
          Math.min(...kids.map((r) => r.top)) +
          edge
      : edge;
  };
  const rows = new Map<string, HTMLElement[]>();
  for (const chip of chips) {
    const key = `${chip.closest(".dp-card")?.id}|${Math.round(chip.getBoundingClientRect().top)}`;
    rows.set(key, [...(rows.get(key) ?? []), chip]);
  }
  const options = [...rows.values()].flatMap((row) => {
    const most = Math.max(...row.map(need));
    return row.map((chip) => ({
      option: `${chip.closest(".dp-card")?.id.replace("decision-", "")}/${chip.dataset.option}`,
      h: Math.round(chip.getBoundingClientRect().height),
      need: Math.round(most),
    }));
  });
  const tags = [
    ...document.querySelectorAll<HTMLElement>(".dp-opt .dp-tag"),
  ].map((tag) => {
    const label = tag.closest(".dp-opt")?.querySelector("b");
    return {
      option: tag.closest<HTMLElement>(".dp-opt")?.dataset.option ?? "",
      above:
        !!label &&
        tag.getBoundingClientRect().bottom <=
          label.getBoundingClientRect().top + 0.5,
      h: Math.round(tag.getBoundingClientRect().height),
    };
  });
  const send = document.querySelector<HTMLButtonElement>(".dp-send");
  const note = document.querySelector(".dp-note textarea");
  return {
    options,
    tags,
    send: send
      ? {
          h: Math.round(send.getBoundingClientRect().height),
          disabled: send.disabled,
          opacity: Number(getComputedStyle(send).opacity),
          contrast: ratio(send),
        }
      : null,
    note: note ? Math.round(note.getBoundingClientRect().height) : null,
    offline: document.querySelector(".dp-offline")?.textContent?.trim() ?? "",
    contrast: {
      cost: ratio(document.querySelector(".dp-cost")),
      state: ratio(document.querySelector(".dp-state:not(.on)")),
      count: ratio(document.querySelector(".dp-meter > span")),
      placeholder: ratio(note, "::placeholder"),
      tag: ratio(document.querySelector(".dp-tag")),
      line: ratio(document.querySelector('.dp-opt span[id$="-line"]')),
    },
  };
}

/** What a decision page says, read from its DOM. */
function readPage() {
  const cards = [...document.querySelectorAll<HTMLElement>(".dp-card")];
  return {
    title: document.querySelector(".dp-hero h1")?.textContent?.trim() ?? "",
    cards: cards.map((card) => ({
      id: card.dataset.cawcoChoice ?? "",
      question: card.querySelector("h2")?.textContent?.trim() ?? "",
      options: card.querySelectorAll(".dp-opt").length,
      costs: card.querySelectorAll(".dp-cost").length,
      recommended: card.querySelectorAll(".dp-tag").length,
      previews: card.querySelectorAll("iframe.frame").length,
      diagrams: card.querySelectorAll("svg").length,
    })),
    gone: [...document.querySelectorAll(".dp-card .gone")]
      .map((one) => one.textContent?.trim() ?? "")
      .filter(Boolean),
    sideways: document.documentElement.scrollWidth - window.innerWidth,
  };
}

const spec: Spec = {
  name: "decision-pages-ready",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const manifest: {
      captures: { file: string; leg: string; page: string }[];
      pages: Record<string, unknown>;
      reads: Record<string, unknown>;
      ran: string;
    } = { ran: new Date().toISOString(), pages: {}, captures: [], reads: {} };

    // 1. Each program, as the hub would keep it.
    const programs = new Map<string, string>();
    /** The states files the pages embed, by placeholder: what the stage serves and the sweep draws. */
    const embedded = new Set<string>();
    for (const one of PAGES) {
      const written = readFileSync(join(ROOT, one.folder, "page.oui"), "utf8");
      const names = [...written.matchAll(PLACEHOLDER)].map((m) => m[1] ?? "");
      // A placeholder with no states file, or one whose file is not on disk,
      // is refused here by name: the stage would 404 it and its sweep hang.
      const unknown = names.filter(
        (name) =>
          !(
            FILES[name] &&
            existsSync(join(ROOT, "apps/dashboard", FILES[name] ?? ""))
          )
      );
      const program = written.replace(
        PLACEHOLDER,
        (_, name: string) => `"${idOf(name)}"`
      );
      let refusal = "";
      let read: ReturnType<typeof checkProgram>["read"] | null = null;
      try {
        ({ read } = checkProgram(program));
      } catch (error) {
        refusal = (error as Error).message;
      }
      kit.check(
        `${one.name}: the hub's check keeps the program (${read?.cards.length ?? 0} decisions; placeholders ${names.join(", ") || "none"})`,
        !refusal && unknown.length === 0,
        refusal || unknown.join(", ")
      );
      programs.set(one.name, program);
      for (const name of names) {
        if (!unknown.includes(name)) {
          embedded.add(name);
        }
      }
      manifest.pages[one.name] = {
        folder: one.folder,
        placeholders: Object.fromEntries(
          names.map((name) => [`@${name}`, `apps/dashboard/${FILES[name]}`])
        ),
        decisions: read?.cards.map((card) => ({
          id: card.id,
          options: card.options.map((option) => option.id),
          after: card.after,
        })),
      };
    }

    const stage = await startDecisionStage(
      programs,
      Object.fromEntries(
        [...embedded].map((key) => [idOf(key), [FILES[key] ?? ""]])
      )
    );

    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          const page = await kit.page(view, { theme, init: [CAWCO_BRIDGE] });
          const errors: string[] = [];
          page.on("console", (message) => {
            if (message.type() === "error") {
              // A failed load says only its status; its location names what failed.
              const where = message.location().url;
              errors.push(
                `${message.text().slice(0, 240)}${where ? ` (${where})` : ""}`
              );
            }
          });
          page.on("pageerror", (error) =>
            errors.push(error.message.slice(0, 240))
          );

          // 2. The proposed states files.
          const read: Partial<Record<string, Read>> = {};
          for (const section of embedded) {
            read[section] = await sweepFile(
              page,
              stage.stagePort,
              section,
              view === "phone",
              theme
            );
          }
          manifest.reads[`canvas ${leg}`] = read;
          const blank = Object.entries(read).flatMap(([name, one]) =>
            (one?.blank ?? []).map((story) => `${name}/${story}`)
          );
          kit.check(
            `${leg}: every frame of every option draws (${Object.entries(read)
              .map(([name, one]) => `${name} ${one?.frames ?? 0}`)
              .join(", ")})`,
            blank.length === 0 &&
              Object.values(read).every((one) => (one?.frames ?? 0) > 0),
            blank.join(", ")
          );
          const { card, pane, empty } = read;
          kit.check(
            `${leg}: no glyph on a board card under 16px (smallest ${r1(card?.glyph?.least ?? 0)}px)`,
            (card?.glyph?.least ?? 0) >= 15.5,
            card?.glyph?.where
          );
          kit.check(
            `${leg}: the task pane says its stage once in its head (${(pane?.once ?? []).map((one) => `${one.story} "${one.word}" ${one.times}×`).join(", ")})`,
            (pane?.once ?? []).length > 0 &&
              (pane?.once ?? []).every((one) => one.times === 1)
          );
          if (view === "desk") {
            kit.check(
              `${leg}: the → in Approve sits on its words' centre within 0.5px (${(pane?.arrow ?? []).map((one) => `${one.story} ${one.off}px`).join(", ")})`,
              (pane?.arrow ?? []).length > 0 &&
                (pane?.arrow ?? []).every((one) => one.off <= 0.5)
            );
            kit.check(
              `${leg}: no hairline above or below the review stage`,
              (pane?.hairlines ?? []).length > 0 &&
                (pane?.hairlines ?? []).every((one) => one.lines.length === 0),
              JSON.stringify(pane?.hairlines)
            );
            const wide = (empty?.columns ?? []).filter((one) =>
              ["Board", "Decisions", "Caw"].includes(one.story)
            );
            kit.check(
              `${leg}: the work column stands centred in a wide area, within 1px (${wide.map((one) => `${one.story} ${one.leftGap}/${one.rightGap}`).join(", ")})`,
              wide.length === 3 &&
                wide.every((one) => Math.abs(one.leftGap - one.rightGap) <= 1)
            );
          }
          kit.check(
            `${leg}: empty content starts on the work column's start edge`,
            (empty?.columns ?? []).length > 0 &&
              (empty?.columns ?? []).every((one) =>
                one.lines.every((x) => Math.abs(x) <= 1)
              ),
            JSON.stringify(empty?.columns)
          );
          kit.check(
            `${leg}: every starter card of a surface is one size (${(empty?.starters ?? []).map((one) => `${one.story} ${one.cards} ±${one.w}×${one.h}`).join(", ")})`,
            (empty?.starters ?? []).length > 0 &&
              (empty?.starters ?? []).every((one) => one.w <= 1 && one.h <= 1)
          );
          if (view === "phone") {
            const faults = Object.entries(read).flatMap(([name, one]) =>
              (one?.overflow ?? [])
                .filter((each) => each.faults.length > 0)
                .map(
                  (each) => `${name}/${each.story}: ${each.faults.join("; ")}`
                )
            );
            kit.check(
              `${leg}: no text past a phone frame or cut without an ellipsis`,
              faults.length === 0,
              faults.join("\n    ")
            );
          }

          // 3. Each page, its canvases embedded live.
          for (const one of PAGES) {
            await page.goto(stage.pageUrl(one.name, theme), {
              waitUntil: "load",
            });
            await page.waitForSelector(".dp-card", { timeout: 30_000 });
            const previews = (programs.get(one.name) ?? "").match(
              PREVIEW
            )?.length;
            await page.waitForFunction(
              ({ count, selector }) =>
                document.querySelectorAll(selector).length === count,
              { count: previews ?? 0, selector: EMBED_FRAME },
              { timeout: 60_000 }
            );
            const { embeds, undrawn: undrawnIn } = await readEmbeds(
              page,
              theme,
              join(OUT, "embeds", `${one.name}-${view}`)
            );
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.evaluate(() => document.fonts.ready);
            await settle(page, 600);
            const said = await page.evaluate(readPage);
            const controls = await page.evaluate(readControls);
            manifest.reads[`${one.name} ${leg}`] = {
              ...said,
              embeds,
              controls,
            };
            kit.check(
              `${one.name} ${leg}: ${said.cards.length} cards, “${said.cards.map((c) => c.question).join("”, “")}”`,
              said.cards.length > 0 &&
                said.cards.every(
                  (c) =>
                    c.options >= 2 &&
                    c.options <= 5 &&
                    c.costs === c.options &&
                    c.recommended === 1
                ),
              JSON.stringify(said.cards)
            );
            const drawnFaults = embeds.flatMap(embedDrawFaults);
            kit.check(
              `${one.name} ${leg}: every embed draws the component itself, read in its own frame (${embeds.length} of ${previews ?? 0} embeds: ${embeds.map((e) => `${e.file} ${e.shots.map((shot) => `${shot.story} ${shot.stats.width / SCALE}×${shot.stats.height / SCALE} (${shot.stats.matched} points its paint)`).join(" + ") || "none"}`).join("; ")})`,
              embeds.length === (previews ?? 0) &&
                drawnFaults.length === 0 &&
                undrawnIn.length === 0 &&
                said.gone.length === 0,
              [...drawnFaults, ...undrawnIn, ...said.gone].join("\n    ")
            );
            const chromeSeen = embeds.flatMap((e) =>
              e.chrome.map((part) => `${e.file}: ${part}`)
            );
            kit.check(
              `${one.name} ${leg}: no embed shows the canvas's working chrome`,
              chromeSeen.length === 0,
              chromeSeen.slice(0, 12).join("\n    ")
            );
            const sizeFaults = embeds.flatMap((e) => [
              ...e.frames
                .filter((f) => f.type < (f.zoom < 1 ? 10 : 12))
                .map(
                  (f) =>
                    `${e.file}/${f.story}: its words at ${f.type}px (zoom ${f.zoom})`
                ),
              ...e.frames
                .filter((f) => f.right > e.width + 1)
                .map(
                  (f) =>
                    `${e.file}/${f.story}: ${f.right - e.width}px past the embed`
                ),
              ...(Math.abs(e.box.h - e.tall) > 2
                ? [`${e.file}: ${e.box.h}px tall, drawing ${e.tall}px`]
                : []),
            ]);
            const types = embeds.flatMap((e) => e.frames.map((f) => f.type));
            const scrollers = embeds.flatMap((e) =>
              e.frames
                .filter((f) => f.wide)
                .map(
                  (f) =>
                    `${e.file}/${f.story} ${f.w}px at zoom ${f.zoom}, ${f.scrolls}px to scroll`
                )
            );
            sizeFaults.push(
              ...embeds.flatMap((e) =>
                e.frames
                  .filter((f) => f.wide && !(f.scrollable && f.scrolls > 0))
                  .map(
                    (f) =>
                      `${e.file}/${f.story}: wider than its card, yet its frame doesn't scroll sideways`
                  )
              )
            );
            kit.check(
              `${one.name} ${leg}: every embed at a readable size inside its card (words at ${types.length ? Math.min(...types) : 0}px and up, zoom ${[...new Set(embeds.map((e) => e.scale))].join("/") || "none"}, each embed as tall as what it draws${scrollers.length ? `; scrolling sideways at 10px words: ${scrollers.join(", ")}` : ""})`,
              sizeFaults.length === 0,
              sizeFaults.join("\n    ")
            );
            const stretched = controls.options.filter((o) => o.h > o.need + 1);
            kit.check(
              `${one.name} ${leg}: each option as tall as its own content (${controls.options.map((o) => `${o.option} ${o.h}/${o.need}px`).join(", ")})`,
              controls.options.length > 0 && stretched.length === 0,
              JSON.stringify(stretched)
            );
            kit.check(
              `${one.name} ${leg}: Recommended stands over its option's label (${controls.tags.map((t) => `${t.option} ${t.h}px`).join(", ")})`,
              controls.tags.length === said.cards.length &&
                controls.tags.every((t) => t.above),
              JSON.stringify(controls.tags)
            );
            if (view === "phone") {
              kit.check(
                `${one.name} ${leg}: the note ${controls.note}px and Send picks ${controls.send?.h}px tall, 44px under a finger`,
                (controls.note ?? 0) >= 44 && (controls.send?.h ?? 0) >= 44
              );
            }
            const inks = Object.entries(controls.contrast);
            const { send } = controls;
            kit.check(
              `${one.name} ${leg}: muted words hold 4.5:1 (${inks.map(([name, ratio]) => `${name} ${ratio}`).join(", ")}; Send picks ${send?.disabled ? `disabled, at ${send.opacity} opacity, DESIGN.md's recipe` : send?.contrast}), no offline notice`,
              controls.offline === "" &&
                inks.every(([, ratio]) => ratio !== null && ratio >= 4.5) &&
                (send?.disabled
                  ? send.opacity === 0.5
                  : (send?.contrast ?? 0) >= 4.5),
              JSON.stringify({
                ...controls.contrast,
                offline: controls.offline,
              })
            );
            kit.check(
              `${one.name} ${leg}: nothing scrolls sideways (${said.sideways}px past the window)`,
              said.sideways <= 0
            );
            const file = `${one.name}-${view === "desk" ? "1440" : "390"}-${theme}.png`;
            // Playwright's own full page beside it, read the same way: what the earlier captures were.
            const fullPage = await embedPaints(
              page,
              PNG.sync.read(
                await page.screenshot({
                  fullPage: true,
                  animations: "disabled",
                })
              )
            );
            const paints = await capturePage(page, join(OUT, file));
            const blankIn = blankEmbeds(paints);
            kit.check(
              `${one.name} ${leg}: the page's own capture, window by window, paints every embed (${paints.map((p) => `${Math.round(p.flat * 1000) / 10}%`).join(", ")} its commonest colour; Playwright's full page reads ${blankEmbeds(fullPage).length} of ${fullPage.length} blank)`,
              paints.length === (previews ?? 0) && blankIn.length === 0,
              blankIn.join("\n    ")
            );
            manifest.captures.push({ file, leg, page: one.name });
            manifest.reads[`${one.name} ${leg}`] = {
              ...(manifest.reads[`${one.name} ${leg}`] as object),
              paints,
              fullPage,
            };
          }

          kit.check(
            `${leg}: no console errors, the pages and their canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ")
          );
        }
      }
    } finally {
      writeFileSync(
        join(OUT, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      await stage.stop();
    }
  },
};

export default spec;
