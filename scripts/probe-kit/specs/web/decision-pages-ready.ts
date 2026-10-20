/**
 * The decision pages waiting for the owner, drawn as he will see them,
 * with no hub: the plan grill (.design-foundations/decisions/
 * plan-model-grill/page.oui) and the project screens
 * (.design-foundations/decisions/project-screens/page.oui), drawn by the
 * hub's decision host on the dashboard's stage (decision-embeds.ts); each
 * `Preview("@name")` is the component canvas of the states file its
 * folder's README maps it to.
 *
 * 1. Each program, its placeholders given artifact ids, passes the hub's
 *    own check (`checkProgram`): ids, `after`s, words, media.
 * 2. Each states file a page embeds at 1440×900 and 390×844, light and
 *    dark: every frame draws; no board-card glyph under 16px; the task pane
 *    says its stage once in its head and one status (its session row speaks
 *    only for a failed or stopped session); its tabs read whole; its
 *    decision follows its review by 48px at most; on a desk Approve's →
 *    sits on its words' centre within 0.5px and no hairline stands above or
 *    below the review stage; empty content starts on the work column's
 *    edge, the column centred in a wide area within 1px, every starter card
 *    of a surface one size; on a phone Approve stands whole in its frame, a
 *    working task's Session tab shows the session, and no text runs past
 *    its frame or is cut without an ellipsis.
 * 3. Each page at 1440×900 and 390×844, light and dark: its cards and
 *    questions read from the DOM; each card offers 2 to 5 options, each
 *    with a cost line, exactly one Recommended; every option's title on one
 *    line. Every embed, scrolled to as the person would, read in its own
 *    frame: the stories its Preview names drawn, each with words in it,
 *    none of the canvas's working chrome seen, its words 12px and up as
 *    drawn (10px where the embed scales it down, as decision-embed reads
 *    them), every frame inside the embed's width, the embed as tall as
 *    what it draws, and what paints beside a narrower frame the page's own
 *    surface. Each frame it shows is shot where the person sees it
 *    (canvas-shots.ts `shootEmbedded`). The phone head's ⋯ menu stands open
 *    whole inside its story, over none of its words. Every control reaches
 *    44px under a finger at 390 and 24px under a mouse at 1440, nothing
 *    spills its box (decision-embeds.ts `pageReach`); the cost line, the
 *    count, the note's placeholder, the Recommended badge and an option's
 *    line hold 4.5:1 on what they stand on; nothing scrolls sideways; no
 *    console error, and no page or canvas dials the hub's socket.
 *
 * Each page is captured window by window (decision-embeds.ts
 * `capturePage`) and no embed's box in that capture is one flat colour; the
 * capture is files a delegate can hand over (RGB, each within the hub's
 * 1 MiB, a tall page in numbered sections cut between its cards), read back
 * pixel for pixel. Captures and their manifest go to .probe/decision-pages/
 * for a reviewer, and no file there is over the hub's 1 MiB.
 *
 *   bun scripts/probe-kit/run.ts web decision-pages-ready
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one states file, one leg at a time
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { Page } from "playwright-core";
import { checkProgram } from "../../../../packages/hub/src/decision-program";
import { FOLDER_FILE_LIMIT } from "../../../../packages/hub/src/project-folder";
import {
  blankEmbeds,
  CAWCO_BRIDGE,
  captureFaults,
  capturePage,
  EMBED_FRAME,
  embedDrawFaults,
  idOf,
  pageReach,
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
};

/** Each page, by its folder. */
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
  cutTabs?: string[];
  frames: number;
  gaps?: { gap: number; story: string }[];
  glyph?: { least: number; where: string };
  hairlines?: { lines: string[]; story: string }[];
  once?: { story: string; times: number; word: string }[];
  overflow?: { faults: string[]; story: string }[];
  rowWords?: { story: string; word: string }[];
  shown?: {
    approve: boolean | null;
    story: string;
    tab: string;
    words: number;
  }[];
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
            (svg) => !svg.closest("[data-tree-mark]")
          ),
          ...card.querySelectorAll('[data-tree-mark] > [data-slot="tile"]'),
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
    const paneHead = (body: HTMLElement) =>
      body.querySelector(
        '[data-task-pane-next] > [data-slot="head"]'
      ) as HTMLElement | null;
    out.once = frames.map(({ story, body }) => {
      const head = paneHead(body);
      const word =
        head
          ?.querySelector('[data-stage-chip] [data-slot="chip-label"]')
          ?.textContent?.trim() ?? "";
      return {
        story,
        word,
        times: count(
          [
            head?.querySelector('[data-slot="chips"]') ?? null,
            head?.querySelector('[data-slot="session-row"]') ?? null,
            ...(head?.querySelectorAll('[data-slot="badge"]') ?? []),
            // The Session tab's own status words, where it is open: the
            // session's state is the stage's to say.
            ...body.querySelectorAll('[data-session-tab] [data-slot="status"]'),
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
        '[data-task-pane-next] > [data-slot="head"]',
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
    // The decision follows what it decides on: the review's last line to
    // the foot's top, where the pane has both.
    out.gaps = frames.flatMap(({ story, body }) => {
      const stage = body.querySelector("[data-review-stage]");
      const foot = body.querySelector('[data-slot="foot"]');
      const last = stage?.lastElementChild;
      if (!(last && foot)) {
        return [];
      }
      return [{ story, gap: round(rect(foot).top - rect(last).bottom) }];
    });
    // What a phone frame shows of the pane: its open tab and how many words
    // that tab's content holds, and whether Approve stands whole inside it.
    out.shown = frames.map(({ story, body }) => {
      const content = body.querySelector<HTMLElement>('[data-slot="content"]');
      const approve = body.querySelector("[data-approve]");
      const edge = rect(body);
      const a = approve ? rect(approve) : null;
      return {
        story,
        tab: content?.dataset.content ?? "",
        // biome-ignore lint/performance/useTopLevelRegex: this runs in the page, which sees none of the module's scope
        words: (content?.innerText ?? "").split(/\s+/).filter(Boolean).length,
        approve: a
          ? a.width > 0 &&
            a.top >= edge.top - 0.5 &&
            a.bottom <= edge.bottom + 0.5 &&
            a.right <= edge.right + 0.5
          : null,
      };
    });
    // A tab's name is read whole: its words never wider than their box.
    out.cutTabs = frames.flatMap(({ story, body }) =>
      [
        ...body.querySelectorAll<HTMLElement>(
          '[data-slot="tab-item-label"] > [data-slot="text"]:not([aria-hidden])'
        ),
      ]
        .filter((text) => text.scrollWidth > text.clientWidth + 0.5)
        .map((text) => `${story}: ${text.textContent?.trim()}`)
    );
    // The session row speaks only when the stage can't: a failed or
    // stopped session. Any other word there is a second status.
    out.rowWords = frames.flatMap(({ story, body }) =>
      [
        ...body.querySelectorAll<HTMLElement>(
          '[data-slot="session-row"] [data-slot="session-word"]'
        ),
      ].map((word) => ({ story, word: word.textContent?.trim() ?? "" }))
    );
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
          ':scope > [data-slot="empty"] > *, :scope > p, :scope > [data-slot="starter-cards"]'
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
    shown: all("shown") as Read["shown"],
  };
}

/**
 * The page's own words, read from the engine: each option title's lines,
 * and the contrast of each muted line on what it stands on (every
 * ancestor's fill and opacity composited, colours as the engine paints
 * them), Send picks' with it.
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
  const open = "[data-slot=decision]:not([data-decided])";
  /** Each option's title: the lines its words take. */
  const titles = [
    ...document.querySelectorAll<HTMLElement>(`${open} [data-option]`),
  ]
    .filter((chip) => chip.getBoundingClientRect().height > 0)
    .map((chip) => ({
      option: `${chip.closest("[data-slot=decision]")?.getAttribute("data-cawco-choice")}/${chip.dataset.option}`,
      lines:
        chip.querySelector("[data-slot=option-label]")?.getClientRects()
          .length ?? 0,
    }));
  const send = document.querySelector<HTMLButtonElement>("[data-send]");
  const note = document.querySelector(
    "[data-slot=note] textarea:not([aria-hidden])"
  );
  return {
    titles,
    send: send
      ? {
          disabled: send.disabled,
          opacity: Number(getComputedStyle(send).opacity),
          contrast: ratio(send),
        }
      : null,
    contrast: {
      cost: ratio(document.querySelector(`${open} [id$="-cost"]`)),
      count: ratio(document.querySelector("[data-slot=meter]")),
      // The note's field stands folded behind "Add a note" until pressed.
      placeholder: note?.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      })
        ? ratio(note, "::placeholder")
        : "folded",
      tag: ratio(document.querySelector(`${open} [id$="-tag"]`)),
      line: ratio(document.querySelector(`${open} [id$="-line"]`)),
    },
  };
}

/**
 * The top of the project on a phone (the PhoneTop story) in an embed's own
 * document: whether its ⋯ says it is open; each menu item, whole where the
 * person sees it (inside the story's box, inside the menu's own box, which
 * scrolls nothing away, and inside the embed's window, which the page draws
 * as tall as it says) or not; the menu's last item; Ask Caw and the view
 * pill drawn inside the story and clear of the menu; and the story's own
 * words the open menu stands over.
 */
function menuOf() {
  const body = document.querySelector(
    '.cawco-frame[data-cawco-story="PhoneTop"] > .cawco-frame-body'
  );
  const edge = body?.getBoundingClientRect();
  const menu = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-content"]'
  );
  const over = menu?.getBoundingClientRect();
  const within = (r: DOMRect, box: DOMRect | undefined) =>
    !!box &&
    r.top >= box.top - 0.5 &&
    r.bottom <= box.bottom + 0.5 &&
    r.left >= box.left - 0.5 &&
    r.right <= box.right + 0.5;
  const meets = (r: DOMRect, box: DOMRect) =>
    r.left < box.right &&
    r.right > box.left &&
    r.top < box.bottom &&
    r.bottom > box.top;
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && within(r, edge) && r.bottom <= innerHeight + 0.5;
  };
  const items = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  const whole = (item: Element) =>
    seen(item) && within(item.getBoundingClientRect(), over);
  // The story's own words the open menu stands over: each element with
  // words of its own, outside the menu, whose box meets the menu's.
  const covered = over
    ? [...(body?.querySelectorAll<HTMLElement>("*") ?? [])]
        .filter(
          (el) =>
            !menu?.contains(el) &&
            [...el.childNodes].some(
              (node) =>
                node.nodeType === Node.TEXT_NODE &&
                (node.textContent ?? "").trim() !== ""
            ) &&
            !el.closest(".sr-only") &&
            el.getBoundingClientRect().width > 0 &&
            meets(el.getBoundingClientRect(), over)
        )
        .map((el) => el.innerText.trim())
    : [];
  /** A control of the bar, by its name: drawn in the story and clear of the menu. */
  const control = (selector: string) => {
    const el = body?.querySelector(selector);
    if (!el) {
      return "missing";
    }
    if (!seen(el)) {
      return "outside the story";
    }
    return over && meets(el.getBoundingClientRect(), over)
      ? "under the menu"
      : "drawn";
  };
  const spot = (r: DOMRect | undefined) =>
    r
      ? `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`
      : "none";
  return {
    boxes: `story ${spot(edge)}, menu ${spot(over)}, window ${innerWidth}×${innerHeight}`,
    askCaw: control('[aria-label="Ask Caw"]'),
    covered,
    cut: items
      .filter((item) => !whole(item))
      .map((item) => item.innerText.trim()),
    expanded:
      body
        ?.querySelector('[aria-label^="More for"]')
        ?.getAttribute("aria-expanded") ?? "no trigger",
    items: items.filter(whole).map((item) => item.innerText.trim()),
    last: items.at(-1)?.innerText.trim() ?? "none",
    menus: document.querySelectorAll('[data-slot="dropdown-menu-content"]')
      .length,
    scrolls: menu ? menu.scrollHeight - menu.clientHeight : 0,
    views: control('[aria-label^="View:"]'),
  };
}

/**
 * In an embed's own document, what paints beside each frame narrower than
 * the embed: the element at a point halfway between the embed's edge and
 * the frame's, at the frame's middle (within the window), and the first
 * background on it or an ancestor that isn't transparent.
 */
function besideOf() {
  const clear = (colour: string) =>
    colour === "transparent" ||
    colour.endsWith("/ 0)") ||
    colour.endsWith(", 0)");
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.cawco-frame[data-cawco-interaction="rest"]'
    ),
  ].flatMap((frame) => {
    const body = frame.querySelector(".cawco-frame-body");
    const r = body?.getBoundingClientRect();
    if (!r || r.left < 4) {
      return [];
    }
    const y = Math.min(r.top + r.height / 2, innerHeight - 2);
    let at = document.elementFromPoint(r.left / 2, Math.max(y, 2));
    const painter = at
      ? `${at.tagName.toLowerCase()}.${[...at.classList].join(".")}`
      : "nothing";
    while (at && clear(getComputedStyle(at).backgroundColor)) {
      at = at.parentElement;
    }
    return [
      {
        story: frame.dataset.cawcoStory ?? "",
        painter: at
          ? `${painter} (painted by ${at.tagName.toLowerCase()}.${[...at.classList].join(".")})`
          : painter,
        paint: at ? getComputedStyle(at).backgroundColor : "none",
      },
    ];
  });
}

/** What a decision page says, read from its DOM. */
function readPage() {
  const cards = [
    ...document.querySelectorAll<HTMLElement>("[data-slot=decision]"),
  ];
  return {
    title:
      document.querySelector("[data-slot=page-head] h1")?.textContent?.trim() ??
      "",
    cards: cards.map((card) => ({
      id: card.dataset.cawcoChoice ?? "",
      question: card.querySelector("h2")?.textContent?.trim() ?? "",
      options: card.querySelectorAll("[data-option]").length,
      costs: card.querySelectorAll('[id$="-cost"]').length,
      recommended: card.querySelectorAll('[id$="-tag"]').length,
      previews: card.querySelectorAll("iframe[data-slot=embed]").length,
    })),
    gone: [...document.querySelectorAll("[data-slot=media-gone]")]
      .map((one) => one.textContent?.trim() ?? "")
      .filter(Boolean),
    sideways: document.documentElement.scrollWidth - window.innerWidth,
  };
}

/**
 * A canvas talks to no hub: a page or canvas that dials the hub's socket
 * says so as a console error, with the dashboard frames that dialled it,
 * which the console check fails on (the stage's `/api` answers a dial's
 * auth read with a 500).
 */
function HUB_DIAL(): void {
  const Own = window.WebSocket;
  window.WebSocket = class extends Own {
    constructor(url: string | URL, protocols?: string | string[]) {
      if (String(url).includes("/ws/dashboard")) {
        console.error(
          `dialled the hub: ${(new Error("at").stack ?? "")
            .split("\n")
            .filter((line) => line.includes("/src/"))
            .map((line) => line.slice(line.indexOf("/src/") + "/src/".length))
            .join(" < ")}`
        );
      }
      super(url, protocols);
    }
  } as typeof WebSocket;
}

const spec: Spec = {
  name: "decision-pages-ready",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every assertion in the order the spec's head lists them
  run: async (kit: Kit) => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const manifest: {
      captures: {
        files: {
          bytes: number;
          file: string;
          rows: { from: number; to: number };
        }[];
        leg: string;
        page: string;
      }[];
      pages: Record<string, unknown>;
      reads: Record<string, unknown>;
      ran: string;
    } = { ran: new Date().toISOString(), pages: {}, captures: [], reads: {} };

    // 1. Each program, as the hub would keep it.
    const programs = new Map<string, string>();
    /** The states files the pages embed, by placeholder: what the stage serves and the sweep draws. */
    const sheets = new Set<string>();
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
          sheets.add(name);
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
        [...sheets].map((key) => [idOf(key), [FILES[key] ?? ""]])
      )
    );

    try {
      for (const view of ["desk", "phone"] as const) {
        for (const theme of THEMES) {
          const leg = `${view === "desk" ? "1440×900" : "390×844"} ${theme}`;
          // The overlay's bridge stands in for the hub's panel, as the
          // owner's page has one: the note and Send picks are live.
          const page = await kit.page(view, {
            theme,
            init: [CAWCO_BRIDGE, HUB_DIAL],
          });
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
          for (const section of sheets) {
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
          kit.check(
            `${leg}: the task pane's decision follows its review, at most 48px under it (${(pane?.gaps ?? []).map((one) => `${one.story} ${one.gap}px`).join(", ")})`,
            (pane?.gaps ?? []).length > 0 &&
              (pane?.gaps ?? []).every((one) => one.gap <= 48)
          );
          kit.check(
            `${leg}: the task pane's tabs read whole, none cut to an ellipsis`,
            (pane?.cutTabs ?? []).length === 0,
            (pane?.cutTabs ?? []).join(", ")
          );
          kit.check(
            `${leg}: the task pane says one status: its session row speaks only for a failed or stopped session (${(pane?.rowWords ?? []).map((one) => `${one.story} "${one.word}"`).join(", ") || "none shown"})`,
            (pane?.rowWords ?? []).every((one) =>
              ["Failed", "Stopped"].includes(one.word)
            )
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
            const shown = pane?.shown ?? [];
            const asks = shown.find((one) => one.story === "PhoneReviewAsks");
            const working = shown.find((one) => one.story === "PhoneWorking");
            kit.check(
              `${leg}: the phone pane shows Approve whole in its frame while its agent asks (${asks ? `${asks.tab} tab, Approve ${asks.approve ? "inside" : "cut or missing"}` : "not read"}), and a working task's Session tab with its content (${working ? `${working.tab} tab, ${working.words} words` : "not read"})`,
              asks?.approve === true &&
                working?.tab === "session" &&
                working.words >= 5,
              JSON.stringify(shown)
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
            await page.waitForSelector("[data-slot=decision]", {
              timeout: 30_000,
            });
            const embedded = (programs.get(one.name) ?? "").match(
              PREVIEW
            )?.length;
            await page.waitForFunction(
              ({ count, selector }) =>
                document.querySelectorAll(selector).length === count,
              { count: embedded ?? 0, selector: EMBED_FRAME },
              { timeout: 60_000 }
            );
            const { embeds, undrawn: undrawnIn } = await readEmbeds(
              page,
              theme,
              join(OUT, "embeds", `${one.name}-${view}`)
            );
            // The top of the project on a phone, read in its embed's own
            // document (menuOf).
            const headEmbed = page
              .frames()
              .find((embed) => embed.url().includes("ProjectHeadNewSession"));
            const headMenu = headEmbed
              ? await headEmbed.evaluate(menuOf)
              : null;
            if (one.name === "project-screens") {
              kit.check(
                `${one.name} ${leg}: the top of the project on a phone shows its ⋯ open, every item whole to the last (${headMenu?.last}), New session among them, over none of the story's words, with Ask Caw and the bar of views drawn clear of it (${headMenu ? `trigger expanded ${headMenu.expanded}; menus ${headMenu.menus}; whole: ${headMenu.items.join(", ") || "none"}; cut: ${headMenu.cut.join(", ") || "none"}; the menu scrolls ${headMenu.scrolls}px; covering: ${headMenu.covered.join(", ") || "nothing"}; Ask Caw ${headMenu.askCaw}; view pill ${headMenu.views}; ${headMenu.boxes}` : "no head embed"})`,
                !!headMenu?.items.includes("New session") &&
                  headMenu.items.includes(headMenu.last) &&
                  headMenu.cut.length === 0 &&
                  headMenu.scrolls <= 1 &&
                  headMenu.covered.length === 0 &&
                  headMenu.askCaw === "drawn" &&
                  headMenu.views === "drawn"
              );
            }
            // Each embed stands on the page's surface: its own page's
            // background, read in its frame, is the Preview frame's.
            const surfaces = await Promise.all(
              (await page.$$(EMBED_FRAME)).map(async (handle) => {
                const inner = await handle.contentFrame();
                return {
                  page: await handle.evaluate(
                    (el) => getComputedStyle(el).backgroundColor
                  ),
                  beside: inner ? await inner.evaluate(besideOf) : [],
                  file: inner
                    ? (new URL(inner.url()).searchParams.get("file") ?? "")
                    : "",
                };
              })
            );
            // What paints beside each frame narrower than its embed must be
            // the page's own surface: no gutter of another colour.
            const gutters = surfaces.flatMap((each) =>
              each.beside
                .filter((side) => side.paint !== each.page)
                .map(
                  (side) =>
                    `${each.file.split("/").at(-1)?.replace(".stories.ts", "")}/${side.story}: ${side.painter} paints ${side.paint} beside it, on ${each.page}`
                )
            );
            kit.check(
              `${one.name} ${leg}: beside every frame narrower than its embed stands the page's own surface (${
                surfaces
                  .flatMap((each) =>
                    each.beside.map(
                      (side) =>
                        `${side.story} ${side.painter} ${side.paint === each.page ? side.paint : `${side.paint} on ${each.page}`}`
                    )
                  )
                  .join(", ") || "no narrow frames"
              })`,
              gutters.length === 0,
              gutters.join("\n    ")
            );
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.evaluate(() => document.fonts.ready);
            await settle(page, 600);
            const said = await page.evaluate(readPage);
            const controls = await page.evaluate(readControls);
            const reach = await pageReach(page);
            manifest.reads[`${one.name} ${leg}`] = {
              ...said,
              embeds,
              controls,
              reach,
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
              `${one.name} ${leg}: every embed draws the component itself, read in its own frame (${embeds.length} of ${embedded ?? 0} embeds: ${embeds.map((e) => `${e.file} ${e.shots.map((shot) => `${shot.story} ${shot.stats.width / SCALE}×${shot.stats.height / SCALE} (${shot.stats.matched} points its paint)`).join(" + ") || "none"}`).join("; ")})`,
              embeds.length === (embedded ?? 0) &&
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
              ...e.frames
                .filter((f) => f.scrolls > 0)
                .map(
                  (f) =>
                    `${e.file}/${f.story}: scrolls ${f.scrolls}px sideways, so part of it is out of view`
                ),
              ...(Math.abs(e.box.h - e.tall) > 2
                ? [`${e.file}: ${e.box.h}px tall, drawing ${e.tall}px`]
                : []),
            ]);
            const types = embeds.flatMap((e) => e.frames.map((f) => f.type));
            kit.check(
              `${one.name} ${leg}: every embed at a readable size inside its card (words at ${types.length ? Math.min(...types) : 0}px and up: 12px, 10px where scaled; zoom ${[...new Set(embeds.map((e) => e.scale))].join("/") || "none"}, each embed as tall as what it draws)`,
              sizeFaults.length === 0,
              sizeFaults.join("\n    ")
            );
            const wrapped = controls.titles.filter((t) => t.lines !== 1);
            kit.check(
              `${one.name} ${leg}: every option's title on one line (${controls.titles.map((t) => `${t.option} ${t.lines}`).join(", ")})`,
              controls.titles.length > 0 && wrapped.length === 0,
              JSON.stringify(wrapped)
            );
            const unreached = reach.controls.filter((c) =>
              view === "phone" ? !c.touch : !c.pointer
            );
            kit.check(
              `${one.name} ${leg}: every control reaches ${view === "phone" ? "44px under a finger" : "24px under a mouse"} and nothing spills its box (${reach.controls.length} controls)`,
              reach.controls.length > 0 &&
                unreached.length === 0 &&
                reach.spills.length === 0,
              [...unreached.map((c) => c.line), ...reach.spills]
                .slice(0, 12)
                .join("\n    ")
            );
            const inks = Object.entries(controls.contrast);
            const { send } = controls;
            kit.check(
              `${one.name} ${leg}: muted words hold 4.5:1 (${inks.map(([name, ratio]) => `${name} ${ratio}`).join(", ")}; Send picks ${send?.disabled ? `disabled, at ${send.opacity} opacity, DESIGN.md's recipe` : send?.contrast})`,
              inks.every(
                ([, ratio]) =>
                  ratio === "folded" ||
                  (typeof ratio === "number" && ratio >= 4.5)
              ) &&
                (send?.disabled
                  ? send.opacity === 0.5
                  : (send?.contrast ?? 0) >= 4.5),
              JSON.stringify(controls.contrast)
            );
            kit.check(
              `${one.name} ${leg}: nothing scrolls sideways (${said.sideways}px past the window)`,
              said.sideways <= 0
            );
            const file = `${one.name}-${view === "desk" ? "1440" : "390"}-${theme}.png`;
            // The page tiled window by window (decision-embeds.ts
            // `capturePage`): a full-page shot paints a cross-origin embed
            // outside the first window blank.
            const capture = await capturePage(page, join(OUT, file));
            const { paints } = capture;
            const captured = captureFaults(capture);
            kit.check(
              `${one.name} ${leg}: the page's capture is files a delegate can hand over, each RGB and at most ${FOLDER_FILE_LIMIT / 1024 / 1024} MiB, its whole picture pixel for pixel (${capture.files.map((f) => `${basename(f.path)} ${(f.bytes / 1024).toFixed(0)} KiB, rows ${f.rows.from}–${f.rows.to}`).join(", ")}; ${capture.picture.width}×${capture.picture.height})`,
              capture.files.length > 0 && captured.length === 0,
              captured.join("\n    ")
            );
            const blankBoxes = blankEmbeds(paints);
            kit.check(
              `${one.name} ${leg}: the page's own capture paints every embed (${paints.map((p) => `“${p.embed}” ${Math.round(p.flat * 1000) / 10}% its commonest colour`).join(", ") || "no embeds"})`,
              paints.length === (embedded ?? 0) && blankBoxes.length === 0,
              blankBoxes.join("\n    ")
            );
            manifest.captures.push({
              files: capture.files.map((f) => ({
                bytes: f.bytes,
                file: basename(f.path),
                rows: f.rows,
              })),
              leg,
              page: one.name,
            });
          }

          kit.check(
            `${leg}: no console errors, the pages and their canvases`,
            errors.length === 0,
            [...new Set(errors)].slice(0, 12).join("\n    ")
          );
        }
      }
      // What a reviewer is handed: no file the hub would refuse.
      const over = readdirSync(OUT, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .filter((path) => statSync(path).size > FOLDER_FILE_LIMIT);
      kit.check(
        `every file in ${OUT.slice(ROOT.length + 1)} within the hub's ${FOLDER_FILE_LIMIT / 1024 / 1024} MiB`,
        over.length === 0,
        over
          .map(
            (path) =>
              `${path.slice(OUT.length + 1)}: ${(statSync(path).size / 1024 / 1024).toFixed(2)} MiB`
          )
          .join("\n    ")
      );
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
