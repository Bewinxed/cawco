/**
 * A project's Memory view (report 1 and report 2 of the memory screen's
 * design; hub memory-view.ts, dashboard ViewMemory, MemoryFile): read from
 * the engine (the fleet's rule 6), never from pixels.
 *
 * On the dashboard's stage (stage-host, started in apps/dashboard as the
 * daemon starts one, minus the workspace boundary), the states file
 * ViewMemory.stories.ts, its data the fixture folders run through the
 * hub's own parsers:
 *
 * 1. The fixtures are current: `scripts/memory-fixtures.ts --check`.
 * 2. Every story is drawn, light and dark, with zero page errors and no
 *    unnamed story; no frame is narrower than its viewport.
 * 3. Each block's and the side card's content box stands at its width: a
 *    1440 desk lays Inbox, Facts and In briefs on one row at one, two and
 *    one of four columns; a phone stacks them at the page's width; the
 *    card stands at its place's width. No wrapping text box is narrower
 *    than 120px; a row's title, meta and ⋯ never overlap; nothing spills
 *    past its frame (the overflow sweep), light and dark.
 * 4. The 40-word fact wraps, and its meta line stays one line, cut at the
 *    sources chip, never at the uses' chevron. A block's tools stand inside
 *    its head; a file's name keeps 10rem wherever the ledger stands in
 *    columns (the hostile states at 320 too: a 640 window at 200% zoom).
 * 4a. The empty page's Make a note puts "Make a note: " in Caw's composer,
 *    the caret after it, and sends nothing.
 * 5. One capture per story, light and dark, the frame alone, to the clone's
 *    `.probe/memory-view/` for a reviewer; this spec never reads them.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model; Jev from the kit's mock), the desk fixture's folder seeded
 * into a project:
 *
 * 6. `GET …/memory`, `…/memory/file` and `…/memory/notes/:note` answer the
 *    folder's real numbers: what the hub's `memoryPage` draws from the
 *    same files, line by line, and the hub's thresholds.
 * 7. A task's brief carries fact lines, and In briefs, the file's 14-day
 *    uses and its line's briefs say so (db `brief_fact_uses`). Its share is
 *    its lines' characters over the room the brief had for fact lines (the
 *    budget less AGENTS.md, as memory.ts `briefWhole` reckons it). Its
 *    live meter is scaled to the busiest brief listed and names its
 *    characters.
 * 8. Archive unused makes the hub's archive proposal, parked as a card whose
 *    link opens the Memory view on its file, and the card lands on its row.
 * 9. A note added from the field reaches AGENTS.md's `## Notes`.
 * 8a. A question asked of a row takes its own clicks: at desk the point
 *    under each of its buttons' centres is that button, never the row's
 *    opener.
 * 8b. The Needs-you chip counts per tab: on Memory the proposals, on Board
 *    the tasks alone, and pressing it on Board never empties the board.
 * 10. Curate inbox runs the curator routine: Jev's sort proposes the lasting
 *    note and archives the rest, and their rows leave on the hub's word
 *    while the proposal lands under its note; every animation the view ran
 *    meanwhile is on DESIGN.md's clocks and curves (storyboard C).
 * 10a. A reconnect (the hub restarted under the page) keeps the page drawn:
 *    the Knowledge rows are the same nodes, at the same scroll, and no
 *    skeleton stood.
 * 11. At 390, 680 and 1440 the live page's blocks and the open file card
 *    hold their boxes, and the overflow sweep totals zero, light and dark.
 *    Curate inbox stands as one button in Inbox's head, and every head has
 *    one ⋯. On the phone (a coarse pointer) every small control's touch
 *    area is 44px or more.
 *
 * Fold and Reshape ask the curator's model session, a delegate: probe-kit
 * spec `memory-view-curator`, which runs on the host.
 *
 *   bun scripts/probe-kit/run.ts memory-view
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../packages/agent/src/stage-host/build";
import {
  type MemoryFactFile,
  type MemoryNoteView,
  type MemoryPage,
  memoryViewWords,
} from "../../../packages/core/src/memory-view";
import type {
  FrameRender,
  RenderReport,
} from "../../../packages/core/src/stage";
import { briefWhole } from "../../../packages/hub/src/memory";
import { THRESHOLDS } from "../../../packages/hub/src/memory-view";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type JevAsked, type JevCall, jevMock, jevOn } from "../jev-mock";
import {
  type Kit,
  type KitFleet,
  ROOT,
  type Spec,
  THEMES,
  type View,
} from "../kit";

const DASHBOARD = join(ROOT, "apps/dashboard");
const STATES = "src/lib/cawco/views/ViewMemory.stories.ts";
const FIXTURES = join(DASHBOARD, "src/lib/cawco/memory/fixtures");
const DESK = join(FIXTURES, "desk");
const CAPS = join(ROOT, ".probe/memory-view");

const NOTE = {
  ports: "n-20261019-100000-a1b2c3",
  maestro: "n-20261019-090000-b2c3d4",
  jevoff: "n-20261019-070000-c3d4e5",
} as const;
const FORTY = "A start republishes every runtime file";
const LEGACY_PATH = "knowledge/legacy.md";
const LEGACY =
  "Legacy: what was kept long ago.\n\n- The legacy queue drains on Sundays (since 2025-01-01, from n-20250101-090000-f0f0f0, used 2025-01-01)\n";
const NOTE_REF = /notes\["([^"]+)"\]/;
const FACT_REF = /facts\["([^"]+)"\]/;
/** DESIGN.md's clocks and curves (design/tokens, motion): every animation the view runs is on one of them. */
const TOKENS = {
  durations: [
    "--dur-stagger",
    "--dur-cascade",
    "--dur-ghost",
    "--dur-control",
    "--dur-menu",
    "--dur-toggle",
    "--dur-exit",
    "--dur-morph",
    "--dur-rail",
    "--dur-fade",
    "--dur-mark-hold",
    "--dur-pop",
    "--dur-panel",
    "--dur-grow",
    "--dur-grow-exit",
    "--dur-lift",
    "--dur-press-hold",
    "--dur-settle",
    "--dur-reveal",
    "--dur-hold",
    "--dur-loop",
    "--breath",
  ],
  curves: [
    "--ease-out",
    "--ease-in-out",
    "--ease-drawer",
    "--ease-crossfade",
    "--ease-arrive",
    "--ease-figure",
    "--ease-glide-in",
    "--ease-glide-out",
  ],
};
const FIELD_NOTE = "PROBE-MEMORY-VIEW notes from the field reach AGENTS.md.";

// --- the stage --------------------------------------------------------------------

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** The stage host over the dashboard, started as the daemon starts one. */
async function stageOf(): Promise<{ base: string; stop: () => void }> {
  mkdirSync(join(DASHBOARD, ".cawco/stage"), { recursive: true });
  writeFileSync(
    join(DASHBOARD, ".cawco/stage/host.mjs"),
    await buildStageHost()
  );
  const port = await freePort();
  const child: ChildProcess = spawn(
    "bun",
    [join(DASHBOARD, ".cawco/stage/host.mjs")],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        CAWCO_STAGE: "1",
        CAWCO_STAGE_PORT: String(port),
        CAWCO_STAGE_FRAMEWORK: "svelte",
        // SvelteKit's: the root layout's app.css (the kit's recipes, Tailwind's utilities) draws in every frame, as in the app.
        CAWCO_STAGE_KIT: "1",
        CAWCO_STAGE_TOOLCHAIN: "vite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  child.stdout?.on("data", hear);
  child.stderr?.on("data", hear);
  await until(
    "the stage's ready",
    () => words,
    (said) => said.includes('"cawco":"ready"'),
    120_000
  );
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => child.kill("SIGTERM"),
  };
}

/** The page's report once every loaded section is drawn and the page has gone quiet. */
async function reportOn(page: Page): Promise<RenderReport> {
  await page.waitForFunction(
    () => {
      const state = (
        window as unknown as { __cawcoCanvas?: { report: RenderReport | null } }
      ).__cawcoCanvas;
      return !!state?.report && state.report.sections.length > 0;
    },
    null,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(2500);
  return page.evaluate(
    () =>
      (window as unknown as { __cawcoCanvas: { report: RenderReport } })
        .__cawcoCanvas.report
  );
}

/** What a frame's (or a page's) box holds, read in the page: blocks, the card, rows, text and spills. */
interface Drawn {
  blocks: { block: string; h: number; top: number; w: number }[];
  card: number | null;
  /** The 40-word fact: lines its words took, its meta line's height and line height, its chevron inside the meta. */
  forty: {
    chevronInside: boolean;
    clippedAt: string | null;
    /** The line has briefs, so its chevron stands. */
    used: boolean;
    lineHeight: number;
    lines: number;
    metaHeight: number;
  } | null;
  grid: { gap: number; w: number } | null;
  /** Each block head whose tools stand past its edge. */
  heads: string[];
  narrow: string[];
  overlaps: string[];
  spills: string[];
  /** File names under 10rem on a ledger standing in columns. */
  squeezed: string[];
  width: number;
}

/** Read inside `root` (a frame's body, or the page): layout sizes, so the canvas's zoom never skews them. */
function readDrawn(root: Element, fortyWords: string): Drawn {
  const box = (el: Element) => el.getBoundingClientRect();
  const rootBox = box(root);
  const scale = rootBox.width / ((root as HTMLElement).offsetWidth || 1);
  const meets = (a: DOMRect, b: DOMRect) =>
    a.width > 0 &&
    b.width > 0 &&
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5;
  const slot = (el: Element) => el.getAttribute("data-slot");
  /** An element as a reader finds it: its tag and class, its slot, and the slots it stands in. */
  const name = (el: Element) => {
    const within: string[] = [];
    for (
      let at = el.parentElement;
      at && at !== root && within.length < 3;
      at = at.parentElement
    ) {
      const named =
        slot(at) ??
        (at.getAttribute("data-block")
          ? `block ${at.getAttribute("data-block")}`
          : null);
      if (named) {
        within.push(named);
      }
    }
    return `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}${slot(el) ? `[${slot(el)}]` : ""}${within.length ? ` in ${within.join(" < ")}` : ""}`;
  };
  const linesOf = (node: Node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set(
      [...range.getClientRects()].map((rect) => Math.round(rect.top))
    ).size;
  };

  /** A box of words that wraps is never squeezed under 120px. */
  const narrowOf = (): string[] => {
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const words = node.textContent?.trim() ?? "";
      const el = node.parentElement;
      const wraps =
        el !== null &&
        words.includes(" ") &&
        !el.closest(".sr-only") &&
        linesOf(node) > 1;
      if (wraps && el.offsetWidth < 120) {
        found.push(`${name(el)} ${el.offsetWidth}px "${words.slice(0, 30)}"`);
      }
    }
    return found;
  };

  /** A row's title, meta and ⋯ never overlap. */
  const overlapsOf = (): string[] =>
    [...root.querySelectorAll(".row")].flatMap((row) => {
      const parts = [
        row.querySelector(".note-text, .name"),
        row.querySelector(".row-main > .meta, .cells"),
        row.querySelector(".row-menu"),
      ].filter((el): el is Element => el !== null);
      return parts.flatMap((a, i) =>
        parts
          .slice(i + 1)
          .filter((b) => meets(box(a), box(b)))
          .map((b) => `${name(row)}: ${name(a)} × ${name(b)}`)
      );
    });

  /** Whether a box between `el` and the root clips it: what is clipped is not drawn there. */
  const clipped = (el: Element): boolean => {
    for (let at = el.parentElement; at && at !== root; at = at.parentElement) {
      if (getComputedStyle(at).overflowX !== "visible") {
        return true;
      }
    }
    return false;
  };

  /** How far `el`'s drawn boxes or words run past its own edge; a control's invisible hit area (a pseudo box) is none. */
  const pastOf = (el: HTMLElement, right: number): number => {
    const children = [...el.children].filter(
      (child) =>
        !child.closest(".sr-only") &&
        getComputedStyle(child).visibility !== "hidden"
    );
    if (children.length > 0) {
      return Math.max(...children.map((child) => box(child).right)) - right;
    }
    return el.scrollWidth > el.clientWidth + 1
      ? (el.scrollWidth - el.clientWidth) * scale
      : 0;
  };

  /** The child that runs furthest past, as a spill names it. */
  const widestOf = (el: Element): string => {
    const widest = [...el.children].reduce<Element | null>(
      (most, child) =>
        !most || box(child).right > box(most).right ? child : most,
      null
    );
    return widest ? ` (its ${name(widest)})` : "";
  };

  /** Nothing spills: no box past the root's edges, none running past its own; each named at its innermost box. */
  const spillsOf = (): string[] => {
    const found: { el: HTMLElement; said: string }[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("*")) {
      const rect = box(el);
      // A box drawn unseen (a field's measuring copy, set far off) is no spill.
      if (
        rect.width === 0 ||
        el.closest(".sr-only") ||
        clipped(el) ||
        getComputedStyle(el).visibility === "hidden"
      ) {
        continue;
      }
      const style = getComputedStyle(el);
      if (
        rect.right > rootBox.right + scale ||
        rect.left < rootBox.left - scale
      ) {
        found.push({
          el,
          said: `${name(el)} past the edge by ${Math.round((rect.right - rootBox.right) / scale)}px`,
        });
        continue;
      }
      const past =
        style.overflowX === "visible" && style.display !== "inline"
          ? pastOf(el, rect.right)
          : 0;
      if (past > scale) {
        found.push({
          el,
          said: `${name(el)} spills ${Math.round(past / scale)}px${widestOf(el)}`,
        });
      }
    }
    return found
      .filter(
        (one) =>
          !found.some((other) => other !== one && one.el.contains(other.el))
      )
      .map((one) => one.said);
  };

  /** The 40-word fact: the lines its words took, its meta line, its chevron. */
  const fortyOf = (): Drawn["forty"] => {
    const fact = [...root.querySelectorAll(".fact")].find((el) =>
      el.querySelector(".fact-text")?.textContent?.includes(fortyWords)
    );
    const text = fact?.querySelector(".fact-text > span");
    const meta = fact?.querySelector<HTMLElement>(".fact-meta");
    if (!(fact && text && meta)) {
      return null;
    }
    const chevron = fact.querySelector(".uses-chevron");
    const words = fact.querySelector<HTMLElement>(".meta-words");
    const metaBox = box(meta);
    const chevronBox = chevron ? box(chevron) : null;
    return {
      lines: linesOf(text),
      metaHeight: meta.offsetHeight,
      lineHeight: Number.parseFloat(getComputedStyle(meta).lineHeight) || 0,
      used: fact.querySelector(".uses .num") !== null,
      chevronInside:
        chevronBox !== null &&
        chevronBox.width > 0 &&
        chevronBox.right <= metaBox.right + 0.5 &&
        chevronBox.left >= metaBox.left - 0.5,
      clippedAt:
        words && words.scrollWidth > words.clientWidth + 1
          ? "meta-words"
          : null,
    };
  };

  const gridEl = root.querySelector<HTMLElement>('[data-slot="blocks"]');
  const cardEl = root.querySelector<HTMLElement>(".memory-file, .file-page");
  return {
    width: (root as HTMLElement).offsetWidth,
    blocks: [...root.querySelectorAll<HTMLElement>('[data-slot="block"]')].map(
      (el) => ({
        block: el.dataset.block ?? "",
        w: el.offsetWidth,
        h: el.offsetHeight,
        top: Math.round((box(el).top - rootBox.top) / scale),
      })
    ),
    grid: gridEl
      ? {
          w: gridEl.clientWidth,
          gap: Number.parseFloat(getComputedStyle(gridEl).columnGap) || 0,
        }
      : null,
    card: cardEl ? cardEl.offsetWidth : null,
    heads: [
      ...root.querySelectorAll<HTMLElement>('[data-slot="block-head"]'),
    ].flatMap((head) => {
      const tools = head.querySelector('[data-slot="tools"]');
      if (!tools) {
        return [];
      }
      const h = box(head);
      const t = box(tools);
      return t.right > h.right + 0.5 || t.left < h.left - 0.5
        ? [
            `${head.closest("[data-block]")?.getAttribute("data-block")}: tools ${Math.round(t.left)}–${Math.round(t.right)} in head ${Math.round(h.left)}–${Math.round(h.right)}`,
          ]
        : [];
    }),
    squeezed: [...root.querySelectorAll<HTMLElement>(".row.file")].flatMap(
      (row) => {
        const main = row.querySelector<HTMLElement>(".row-main");
        const opener = row.querySelector<HTMLElement>(".opener");
        if (!(main && opener) || getComputedStyle(main).display !== "grid") {
          return [];
        }
        const rem = Number.parseFloat(
          getComputedStyle(document.documentElement).fontSize
        );
        return opener.offsetWidth < 10 * rem
          ? [`${row.dataset.file} ${opener.offsetWidth}px`]
          : [];
      }
    ),
    narrow: narrowOf(),
    overlaps: overlapsOf(),
    spills: spillsOf(),
    forty: fortyOf(),
  };
}

/** The blocks' boxes at a desk's four columns or a phone's one, against the grid's width. */
function blocksHold(kit: Kit, where: string, drawn: Drawn): void {
  const { grid, blocks } = drawn;
  if (!grid || blocks.length === 0) {
    return;
  }
  const by = Object.fromEntries(blocks.map((one) => [one.block, one]));
  const [inbox, facts, briefs] = [by.inbox, by.facts, by.briefs];
  if (!(inbox && facts && briefs)) {
    kit.check(
      `${where}: Inbox, Facts and In briefs stand`,
      false,
      JSON.stringify(blocks)
    );
    return;
  }
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  if (grid.w >= 60 * 16) {
    const column = (grid.w - 3 * grid.gap) / 4;
    kit.check(
      `${where}: Inbox, Facts and In briefs stand on one row at one, two and one of four columns`,
      near(inbox.w, column) &&
        near(facts.w, 2 * column + grid.gap) &&
        near(briefs.w, column) &&
        inbox.top === facts.top &&
        facts.top === briefs.top,
      `grid ${grid.w}px, column ${column.toFixed(1)}: ${JSON.stringify(blocks)}`
    );
  } else if (grid.w < 46 * 16) {
    kit.check(
      `${where}: the blocks stack at the page's width`,
      blocks.every((one) => near(one.w, grid.w)) &&
        inbox.top < facts.top &&
        facts.top < briefs.top,
      `grid ${grid.w}px: ${JSON.stringify(blocks)}`
    );
  }
}

/** Leg 2: what the canvas's render report says of the states file. */
function reportChecks(
  kit: Kit,
  report: RenderReport,
  rest: FrameRender[],
  errors: string[]
): void {
  const stories = new Set(rest.map((one) => one.story));
  const undrawn = rest
    .filter((one) => one.state !== "drawn")
    .map(
      (one) =>
        `${one.story}/${one.scheme} ${one.state} ${one.error?.message ?? ""}`
    );
  kit.check(
    "every story is drawn, light and dark",
    rest.length >= stories.size * 2 &&
      undrawn.length === 0 &&
      stories.size >= 24,
    `${stories.size} stories; not drawn: ${undrawn.join("; ") || "none"}`
  );
  const pageErrors = [
    ...report.page.errors.map((one) => one.message),
    ...errors,
  ];
  kit.check(
    "the canvas's render report holds zero page errors",
    pageErrors.length === 0,
    pageErrors.join("; ") || undefined
  );
  kit.check(
    "every story is named",
    report.unnamed.length === 0,
    report.unnamed.join(", ")
  );
  const narrower = rest.filter((one) => one.box.w < one.width);
  kit.check(
    "no frame the canvas reports is narrower than its viewport",
    narrower.length === 0,
    narrower
      .map((one) => `${one.story}/${one.scheme} ${one.box.w} < ${one.width}`)
      .join("; ") || undefined
  );
}

/** Legs 3 and 4 on one frame's body. */
function frameChecks(kit: Kit, frame: FrameRender, drawn: Drawn): void {
  const where = `${frame.story} ${frame.scheme}`;
  blocksHold(kit, where, drawn);
  if (frame.story.startsWith("File") && drawn.card !== null) {
    const want = frame.story.endsWith("Phone") ? frame.width : 485;
    kit.check(
      `${where}: the file card stands at its place's width`,
      Math.abs(drawn.card - want) <= 1,
      `${drawn.card}px, its place ${want}px`
    );
  }
  kit.check(
    `${where}: no wrapping box of words is narrower than 120px`,
    drawn.narrow.length === 0,
    drawn.narrow.slice(0, 4).join("; ") || undefined
  );
  kit.check(
    `${where}: every block's tools stand inside its head`,
    drawn.heads.length === 0,
    drawn.heads.join("; ") || undefined
  );
  kit.check(
    `${where}: a file's name keeps 10rem wherever the ledger stands in columns`,
    drawn.squeezed.length === 0,
    drawn.squeezed.slice(0, 4).join("; ") || undefined
  );
  kit.check(
    `${where}: no row's title, meta and ⋯ overlap`,
    drawn.overlaps.length === 0,
    drawn.overlaps.slice(0, 4).join("; ") || undefined
  );
  kit.check(
    `${where}: the overflow sweep totals zero`,
    drawn.spills.length === 0,
    drawn.spills.slice(0, 4).join("; ") || undefined
  );
  const { forty } = drawn;
  if (forty) {
    kit.check(
      `${where}: the 40-word fact wraps, and its meta line stays one line, cut at the sources chip and never at its chevron`,
      forty.lines > 1 &&
        forty.metaHeight <= forty.lineHeight * 1.6 + 8 &&
        forty.used &&
        forty.chevronInside &&
        (forty.clippedAt === null || forty.clippedAt === "meta-words"),
      JSON.stringify(forty)
    );
  }
}

/** A frame's body on the canvas, at rest. */
const bodyOf = (page: Page, frame: FrameRender) =>
  page.locator(
    `section.cawco-frame[data-cawco-story="${frame.story}"][data-cawco-scheme="${frame.scheme}"][data-cawco-interaction="rest"] > .cawco-frame-body`
  );

/** Leg 5: one frame captured alone, the canvas bringing it into view its own way in a window its size; why not, or null. */
async function captureFrame(
  page: Page,
  frame: FrameRender
): Promise<string | null> {
  const size = await bodyOf(page, frame).evaluate((el: HTMLElement) => ({
    w: el.offsetWidth,
    h: el.offsetHeight,
    key: (el.parentElement as HTMLElement).dataset.cawcoKey ?? "",
  }));
  // A desk's window, wide enough that the canvas never takes it for a phone
  // (its phone view zooms a frame to fit the screen: canvas runtime.ts `show`),
  // and tall enough to hold the whole frame, so the canvas only pans and the
  // frame is pictured at its own size.
  await page.setViewportSize({
    width: Math.max(1600, size.w + 160),
    height: Math.min(size.h + 260, 8000),
  });
  await page.evaluate(
    (key) =>
      (
        window as unknown as { __cawcoCanvas: { go: (key: string) => void } }
      ).__cawcoCanvas.go(key),
    size.key
  );
  await page.waitForTimeout(700);
  // The frame's own picture: animations stopped, so a breathing glyph or the
  // canvas settling never holds its box from standing still.
  return bodyOf(page, frame)
    .screenshot({
      path: join(CAPS, `${frame.story}-${frame.width}-${frame.scheme}.png`),
      animations: "disabled",
      timeout: 30_000,
    })
    .then(
      () => null,
      (error: Error) => error.message.split("\n")[0] ?? error.message
    );
}

/** Leg 4a: the empty page's one act puts the note's words in Caw's composer, unsent. */
async function emptyActLeg(
  kit: Kit,
  page: Page,
  rest: FrameRender[]
): Promise<void> {
  const frame = rest.find(
    (one) => one.story === "Empty" && one.scheme === "light"
  );
  if (!frame) {
    kit.check("the Empty story stands to press Make a note in", false);
    return;
  }
  const body = bodyOf(page, frame);
  await body.locator('[data-slot="make-note"]').click();
  await page.waitForTimeout(300);
  const field = await body.evaluate((el) => {
    const input = el.querySelector<HTMLElement>(
      '[data-slot="ask-caw"] [contenteditable="true"], [data-slot="ask-caw"] textarea'
    );
    if (!input) {
      return null;
    }
    const value =
      input instanceof HTMLTextAreaElement
        ? input.value
        : (input.innerText ?? "").replaceAll("\u00a0", " ");
    // The caret: what stands from the field's start to the selection.
    const selection = getSelection();
    let caret = -1;
    if (input instanceof HTMLTextAreaElement) {
      caret = input.selectionStart;
    } else if (selection && selection.rangeCount > 0) {
      const range = document.createRange();
      range.selectNodeContents(input);
      range.setEnd(
        selection.getRangeAt(0).endContainer,
        selection.getRangeAt(0).endOffset
      );
      caret = range.toString().length;
    }
    return { value, caret, focused: input.contains(document.activeElement) };
  });
  // Unsent: the words still stand in the field (a send empties it).
  kit.check(
    'Make a note puts "Make a note: " in Caw\'s composer, the caret after it, and sends nothing',
    field !== null &&
      field.value.trimEnd() === memoryViewWords.notePrefix.trimEnd() &&
      field.caret >= memoryViewWords.notePrefix.trimEnd().length,
    JSON.stringify(field)
  );
}

/** Legs 2 to 5, on the dashboard's stage. */
async function stageLegs(kit: Kit): Promise<void> {
  const stage = await stageOf();
  try {
    const page = await kit.page("desk");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const spec = { name: "Memory", about: "The Memory view's states" };
    await page.goto(
      `${stage.base}/@cawco/canvas?file=${encodeURIComponent(STATES)}&spec=${encodeURIComponent(JSON.stringify(spec))}&scheme=both`
    );
    const report = await reportOn(page);
    const rest = report.sections
      .flatMap((one) => one.frames)
      .filter((one) => one.interaction === "rest");
    reportChecks(kit, report, rest, errors);
    // Each frame's body read first, the world where the canvas left it; then each captured, chrome hidden.
    for (const frame of rest) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
      const drawn = await bodyOf(page, frame).evaluate(readDrawn, FORTY);
      frameChecks(kit, frame, drawn);
    }
    await emptyActLeg(kit, page, rest);
    mkdirSync(CAPS, { recursive: true });
    await page.addStyleTag({
      content:
        ".cawco-ui, .cawco-frame-label, .cawco-frame-status { visibility: hidden !important; }",
    });
    const missed: string[] = [];
    for (const frame of rest) {
      // biome-ignore lint/performance/noAwaitInLoops: one frame at a time, the canvas moved to each
      const why = await captureFrame(page, frame);
      if (why) {
        missed.push(`${frame.story} ${frame.scheme}: ${why}`);
      }
    }
    kit.check(
      "one capture per story, light and dark, the frame alone",
      missed.length === 0,
      `${rest.length - missed.length} of ${rest.length}${missed.length ? `; ${missed.slice(0, 3).join("; ")}` : ""}`
    );
    kit.note(
      `captures: ${relative(ROOT, CAPS)}/ (${readdirSync(CAPS).length} files)`
    );
  } finally {
    stage.stop();
  }
}

// --- the fleet ----------------------------------------------------------------------

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const respond = (request: Seen): Reply =>
  text(request.tools ? "ok" : "Memory view probe");

/** Jev's mock: the port note is lasting and corroborates the conflict's first side; every other note is scaffolding. */
const choose = (call: JevCall, id: string, asked: JevAsked) => {
  if (id.startsWith("pair")) {
    const { question } = asked.instructions as { question: string };
    const noteId = NOTE_REF.exec(question)?.[1] ?? "";
    const factId = FACT_REF.exec(question)?.[1] ?? "";
    const fact =
      (call.state.facts as Record<string, { fact: string }>)[factId]?.fact ??
      "";
    return noteId === NOTE.ports &&
      fact.startsWith("Previews bind on the hub's address only")
      ? { choice: "corroborates", p: 0.9 }
      : { choice: "unrelated", p: 0.9 };
  }
  if (asked.criteria && "lasting" in (asked.criteria as object)) {
    return id === NOTE.ports
      ? { choice: "lasting", p: 0.9 }
      : { choice: "scaffolding", p: 0.9 };
  }
};

/** Every file of a folder, by its path from it. */
const filesOf = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((name) => {
    const at = join(dir, name);
    return statSync(at).isDirectory()
      ? filesOf(at, base)
      : [relative(base, at)];
  });

interface Probe {
  base: string;
  fleet: KitFleet;
  get: <T>(path: string) => Promise<{ body: T; status: number }>;
  post: <T>(
    path: string,
    body: unknown
  ) => Promise<{ body: T; status: number }>;
  projectId: string;
  read: (path: string) => Promise<string>;
}

async function standUp(kit: Kit, jevUrl: string): Promise<Probe> {
  const fleet = await kit.fleet(respond);
  fleet.standIns.typesafeUrl = jevUrl;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await jevOn(fleet.base);
  const { id: projectId } = await fleet.api<{ id: string }>("/api/projects", {
    name: "cockpit",
    machineId: MACHINE,
    cwd: fleet.workdir,
  });
  const project = `${fleet.base}/api/projects/${projectId}`;
  const call = async <T>(path: string, init?: RequestInit) => {
    const answer = await fetch(`${project}${path}`, init);
    const raw = await answer.text();
    let body: T;
    try {
      body = JSON.parse(raw) as T;
    } catch {
      body = raw as T;
    }
    return { status: answer.status, body };
  };
  const post = <T>(path: string, body: unknown) =>
    call<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  // The desk fixture's folder, seeded as the person's files; its open proposal aside (Jev's sort makes its own).
  for (const path of filesOf(DESK).filter(
    (one) => one !== "hub.json" && !one.startsWith("memory/proposals/")
  )) {
    // biome-ignore lint/performance/noAwaitInLoops: one commit at a time
    const put = await fetch(`${project}/folder/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        content: readFileSync(join(DESK, path), "utf8"),
      }),
    });
    if (!put.ok) {
      throw new Error(`${path}: ${put.status} ${await put.text()}`);
    }
  }
  const read = async (path: string) =>
    (
      await call<{ content?: string }>(
        `/folder/file?path=${encodeURIComponent(path)}`
      )
    ).body.content ?? "";
  return {
    fleet,
    base: fleet.base,
    projectId,
    get: (path) => call(path),
    post,
    read,
  };
}

/** Leg 6: the routes answer the folder's own numbers. */
async function routeLegs(kit: Kit, probe: Probe): Promise<void> {
  const { status, body: page } = await probe.get<MemoryPage>("/memory");
  if (
    !kit.check(
      "GET …/memory answers the page",
      status === 200,
      `${status} ${JSON.stringify(page).slice(0, 200)}`
    )
  ) {
    return;
  }
  const fixture = JSON.parse(
    readFileSync(join(FIXTURES, "desk.json"), "utf8")
  ) as {
    page: MemoryPage;
  };
  const shape = (one: MemoryPage) => ({
    files: one.files
      .map((each) =>
        [
          each.path,
          each.current,
          each.formerly,
          each.conflicts,
          each.unreadable,
          each.chars,
          each.marks.join(""),
        ].join("|")
      )
      .sort(),
    yours: one.yours.count,
    archive: one.archive.map((each) => `${each.path}:${each.lines}`),
  });
  kit.check(
    "every fact file's lines, sections, marks and size are the parsers' (the same folder through memoryPage)",
    JSON.stringify(shape(page)) === JSON.stringify(shape(fixture.page)),
    `${JSON.stringify(shape(page)).slice(0, 300)} vs ${JSON.stringify(shape(fixture.page)).slice(0, 300)}`
  );
  kit.check(
    "the inbox holds the folder's notes, newest first",
    page.inbox.map((one) => one.id).join() ===
      [NOTE.ports, NOTE.maestro, NOTE.jevoff].join(),
    page.inbox.map((one) => one.id).join()
  );
  kit.check(
    "the thresholds are the hub's own",
    JSON.stringify(page.thresholds) === JSON.stringify(THRESHOLDS) && page.jev,
    JSON.stringify(page.thresholds)
  );
  const file = await probe.get<MemoryFactFile>(
    `/memory/file?path=${encodeURIComponent("knowledge/deploy.md")}`
  );
  const fixtureFile = (
    JSON.parse(readFileSync(join(FIXTURES, "desk.json"), "utf8")) as {
      files: Record<string, MemoryFactFile | undefined>;
    }
  ).files["knowledge/deploy.md"];
  kit.check(
    "GET …/memory/file answers each line: its section, dates, ruling, Why, sources and the line not read",
    file.status === 200 &&
      JSON.stringify(
        file.body.facts.map((one) => [
          one.line,
          one.section,
          one.since,
          one.until,
          one.ruling,
          one.why,
          one.from.map((each) => each.id),
        ])
      ) ===
        JSON.stringify(
          fixtureFile?.facts.map((one) => [
            one.line,
            one.section,
            one.since,
            one.until,
            one.ruling,
            one.why,
            one.from.map((each) => each.id),
          ])
        ) &&
      file.body.unreadable[0]?.line === 8,
    `${file.status} ${JSON.stringify(file.body.unreadable)}`
  );
  const note = await probe.get<MemoryNoteView>(`/memory/notes/${NOTE.maestro}`);
  kit.check(
    "GET …/memory/notes/:note answers the note whole",
    note.status === 200 &&
      note.body.text.startsWith("Maestro runs need a Mac") &&
      note.body.where === "inbox",
    `${note.status} ${JSON.stringify(note.body).slice(0, 160)}`
  );
}

/** Leg 7: a task's brief carries fact lines, and the view says so; answers the brief's row. */
async function briefLeg(
  kit: Kit,
  probe: Probe
): Promise<MemoryPage["briefs"][number] | undefined> {
  const { fleet, projectId } = probe;
  const parent = await fleet.spawn(
    "claude",
    "Memory view brief",
    fleet.workdir,
    { projectId }
  );
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${projectId}/tasks`,
    {
      title: "Deploy the preview ports fix",
      description:
        "Preview ports and the scratch hub's address, and whether a start republishes every runtime file whose bytes changed: what deploy says of them.",
      lands: "none",
    }
  );
  const started = await fleet
    .api(`/api/projects/${projectId}/tasks/${task.id}/attempts`, {
      parentInstanceId: parent,
    })
    .then(
      () => "started",
      (error: Error) => error.message
    );
  const page = await until(
    "In briefs to carry the task's brief",
    async () => (await probe.get<MemoryPage>("/memory")).body,
    (one) => one.briefs.some((each) => each.taskId === task.id),
    30_000
  ).catch(() => undefined);
  const brief = page?.briefs.find((one) => one.taskId === task.id);
  const deploy = page?.files.find((one) => one.path === "knowledge/deploy.md");
  const file = await probe.get<MemoryFactFile>(
    `/memory/file?path=${encodeURIComponent("knowledge/deploy.md")}`
  );
  // The room the brief had for fact lines: the budget less the seeded AGENTS.md, as the brief's own code reckons it (the task names no brand file).
  const { room } = briefWhole(
    readFileSync(join(DESK, "AGENTS.md"), "utf8"),
    [],
    new Set()
  );
  kit.check(
    "a brief's share is its lines' characters over the room it had for fact lines, the budget less AGENTS.md",
    !!brief &&
      brief.room === room &&
      room < THRESHOLDS.budgetChars &&
      Math.abs(brief.share - Math.min(1, brief.chars / room)) < 1e-9,
    `room ${room} of ${THRESHOLDS.budgetChars}; ${JSON.stringify(brief)}`
  );
  kit.check(
    "a brief's carried lines are In briefs with their share, deploy's 14 days end on its use, and each line names the brief",
    !!brief &&
      brief.lines > 0 &&
      brief.share > 0 &&
      brief.share <= 1 &&
      brief.title === "Deploy the preview ports fix" &&
      (deploy?.uses14.at(-1) ?? 0) >= 1 &&
      file.body.facts.some((one) =>
        one.uses.some((use) => use.taskId === task.id)
      ),
    `attempt ${started}; ${JSON.stringify(brief)} uses14 ${JSON.stringify(deploy?.uses14)}; briefs ${JSON.stringify(page?.briefs ?? null)}`
  );
  return brief;
}

/** Leg 7, drawn: the brief's meter on the live page is its characters against the busiest brief listed, and its label says them. */
async function meterLeg(
  kit: Kit,
  probe: Probe,
  page: Page,
  brief: MemoryPage["briefs"][number] | undefined
): Promise<void> {
  const busiest = Math.max(
    1,
    ...(await probe.get<MemoryPage>("/memory")).body.briefs.map(
      (one) => one.chars
    )
  );
  const drawn = brief
    ? await page.evaluate((title) => {
        const row = [
          ...document.querySelectorAll('[data-block="briefs"] .row.brief'),
        ].find((one) => one.querySelector(".name")?.textContent === title);
        const track = row?.querySelector<HTMLElement>('[data-slot="share"]');
        const fill = track?.querySelector<HTMLElement>(".share-fill");
        return track && fill
          ? {
              track: track.getBoundingClientRect().width,
              fill: fill.getBoundingClientRect().width,
              label: track.getAttribute("aria-label") ?? "",
            }
          : null;
      }, brief.title)
    : null;
  kit.check(
    "In briefs' meter fills the brief's characters against the busiest brief listed, and its label says them",
    !!brief &&
      drawn !== null &&
      drawn.track > 0 &&
      Math.abs(drawn.fill - (drawn.track * brief.chars) / busiest) <= 0.5 &&
      drawn.label.includes(`${brief.chars.toLocaleString("en-US")} characters`),
    `busiest ${busiest}; ${JSON.stringify(brief)}; drawn ${JSON.stringify(drawn)}`
  );
}

/** Leg 8: Archive unused makes the hub's proposal, its card linked, landed on its row. */
async function archiveLeg(kit: Kit, probe: Probe, page: Page): Promise<void> {
  const put = await fetch(
    `${probe.base}/api/projects/${probe.projectId}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: LEGACY_PATH, content: LEGACY }),
    }
  );
  kit.check("legacy's file is seeded", put.ok, String(put.status));
  const refused = await probe.post<string>("/memory/propose/archive", {
    path: "knowledge/memory.md",
  });
  kit.check(
    "Archive unused on a file with no line past 90 days is refused in the hub's words",
    refused.status === 409 &&
      String(refused.body).includes("unused for 90 days"),
    `${refused.status} ${String(refused.body)}`
  );
  const made = await probe.post<{ proposals: string[] }>(
    "/memory/propose/archive",
    { path: LEGACY_PATH }
  );
  const id = made.body.proposals?.[0] ?? "";
  kit.check(
    "Archive unused answers the proposal it made",
    made.status === 200 && id !== "",
    `${made.status} ${JSON.stringify(made.body)}`
  );
  const asks =
    await probe.fleet.api<
      { requestId: string; payload: { presentation?: { open?: string } } }[]
    >("/api/pending");
  const ask = asks.find((one) => one.requestId === id);
  kit.check(
    "the proposal is parked as a card whose link opens the Memory view on its file",
    ask?.payload.presentation?.open ===
      `/project/${probe.projectId}?view=memory&file=knowledge%2Flegacy.md&proposal=${id}`,
    ask?.payload.presentation?.open ?? "no card"
  );
  const landed = await until(
    "the archive's card on legacy's row",
    () =>
      page.evaluate((proposal) => {
        const card = document.querySelector(`[data-proposal="${proposal}"]`);
        const row = document.querySelector('[data-file="knowledge/legacy.md"]');
        return card && row
          ? {
              kind: card.getAttribute("data-kind"),
              before:
                card.compareDocumentPosition(row) ===
                Node.DOCUMENT_POSITION_FOLLOWING,
              block: card
                .closest('[data-slot="block"]')
                ?.getAttribute("data-block"),
            }
          : null;
      }, id),
    Boolean,
    20_000
  ).catch(() => null);
  kit.check(
    "the archive's card lands in Facts over legacy's row",
    landed?.kind === "archive" && landed.before && landed.block === "facts",
    JSON.stringify(landed)
  );
}

/** Leg 9: a note added from the field reaches AGENTS.md's `## Notes`. */
async function noteLeg(kit: Kit, probe: Probe, page: Page): Promise<void> {
  const field = page.locator(
    '[data-block="facts"] [data-slot="add-note"] input'
  );
  await field.fill(FIELD_NOTE);
  await field.press("Enter");
  const agents = await until(
    "AGENTS.md to hold the field's note",
    () => probe.read("AGENTS.md"),
    (words) => words.includes(`- ${FIELD_NOTE}`),
    20_000
  ).catch(() => "");
  const notes = agents.slice(agents.indexOf("## Notes"));
  kit.check(
    "a note added from the field reaches AGENTS.md's ## Notes",
    notes.includes(`- ${FIELD_NOTE}`),
    notes.slice(0, 300)
  );
  const cleared = await until(
    "the field cleared on the hub's word",
    () => field.inputValue(),
    (value) => value === "",
    10_000
  ).catch(() => "unchanged");
  kit.check(
    "the field clears once the hub has the note",
    cleared === "",
    cleared
  );
}

/** Leg 8a: a question asked of a row takes its own clicks; the row's opener covers none of its buttons. */
async function askLeg(kit: Kit, page: Page): Promise<void> {
  const row = page.locator('[data-file="knowledge/boundary.md"]');
  await row.locator(".row-menu button").click();
  await page.getByRole("menuitem", { name: memoryViewWords.fold }).click();
  const ask = page.locator(
    '[data-file="knowledge/boundary.md"] + [data-slot="ask-row"]'
  );
  await ask.locator("button").first().waitFor({ timeout: 10_000 });
  await ask.scrollIntoViewIfNeeded();
  // Its arrival opens its place over --dur-reveal; the buttons are read once it stands.
  await page.waitForTimeout(800);
  const hits = await ask.evaluate((el) =>
    [...el.querySelectorAll("button")].map((button) => {
      const r = button.getBoundingClientRect();
      const at = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2
      );
      return {
        button: button.textContent?.trim() ?? "",
        hit: at !== null && button.contains(at),
        at: at
          ? `${at.tagName.toLowerCase()}.${String(at.className).split(" ")[0]}`
          : "none",
      };
    })
  );
  kit.check(
    "a row's question takes its own clicks: the point under each button's centre is that button",
    hits.length >= 2 && hits.every((one) => one.hit),
    JSON.stringify(hits)
  );
  // Answered no: the question goes and nothing is asked of the curator.
  const cancel = hits.find((one) => one.button !== memoryViewWords.fold);
  if (cancel) {
    await ask.getByRole("button", { name: cancel.button }).click();
  }
}

/** Leg 8b: the Needs-you chip counts per tab; on Board it never counts a proposal. */
async function needsLeg(
  kit: Kit,
  probe: Probe,
  dashboard: string
): Promise<void> {
  const proposals = (await probe.get<MemoryPage>("/memory")).body.proposals
    .length;
  const chipOf = async (view: string) => {
    const page = await kit.page("desk");
    await page.goto(`${dashboard}/project/${probe.projectId}${view}`);
    await page
      .locator('[data-slot="strip"], [data-view]')
      .first()
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const chip = page.locator('button[data-slot="needs"]');
    const count = (await chip.count())
      ? Number(await chip.locator('[data-slot="num"]').textContent())
      : 0;
    return { page, chip, count };
  };
  const memory = await chipOf("?view=memory");
  await memory.page.close();
  const board = await chipOf("");
  let cards = -1;
  if (board.count > 0) {
    await board.chip.click();
    await board.page.waitForTimeout(800);
    cards = await board.page.locator('[data-slot="task-card"]').count();
  }
  await board.page.close();
  kit.check(
    "the Needs-you chip counts per tab: Memory's proposals on Memory, and on Board its tasks alone, never emptied by a press",
    proposals > 0 &&
      memory.count === proposals &&
      (board.count === 0 || cards > 0),
    `proposals ${proposals}; Memory chip ${memory.count}; Board chip ${board.count}, cards after its press ${cards}`
  );
}

/** Leg 10a: the hub restarted under the page; the page keeps what it drew while it reads again. */
async function reconnectLeg(kit: Kit, probe: Probe, page: Page): Promise<void> {
  await page.evaluate(() => {
    const rows = document.querySelector<HTMLElement>(
      '[data-block="facts"] [data-slot="block-body"]'
    );
    const first = document.querySelector('[data-block="facts"] [data-file]');
    (window as unknown as { __kept: Element | null }).__kept = first;
    if (rows) {
      rows.scrollTop = 40;
    }
    const seen = { skeleton: false };
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    new MutationObserver(() => {
      if (document.querySelector('[data-slot="memory-skeletons"]')) {
        seen.skeleton = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const scrollBefore = await page.evaluate(
    () =>
      document.querySelector<HTMLElement>(
        '[data-block="facts"] [data-slot="block-body"]'
      )?.scrollTop ?? -1
  );
  await probe.fleet.stop("hub");
  await page.waitForTimeout(2500);
  probe.fleet.launch("hub");
  await probe.fleet.hubUp();
  await until(
    "the page read again after the hub came back",
    () => probe.get<MemoryPage>("/memory").then((one) => one.status),
    (code) => code === 200,
    30_000
  );
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => {
    const w = window as unknown as {
      __kept: Element | null;
      __seen: { skeleton: boolean };
    };
    return {
      same: w.__kept !== null && document.contains(w.__kept),
      skeleton: w.__seen.skeleton,
      scroll:
        document.querySelector<HTMLElement>(
          '[data-block="facts"] [data-slot="block-body"]'
        )?.scrollTop ?? -1,
    };
  });
  kit.check(
    "a reconnect keeps the page: the same Knowledge rows at the same scroll, no skeleton",
    after.same && !after.skeleton && after.scroll === scrollBefore,
    `before scroll ${scrollBefore}; after ${JSON.stringify(after)}`
  );
}

/** Leg 10: Curate inbox runs the curator; rows leave on the hub's word, on DESIGN.md's clocks. */
async function curateLeg(kit: Kit, probe: Probe, page: Page): Promise<void> {
  // Every animation the view starts from here, read as it starts.
  await page.evaluate(() => {
    const seen = new Map<
      Animation,
      { duration: number; easing: string; keyframes: string; where: string }
    >();
    const w = window as unknown as { __anims: typeof seen; __stop: () => void };
    w.__anims = seen;
    let on = true;
    const tick = () => {
      for (const run of document.getAnimations()) {
        const target = (run.effect as KeyframeEffect | null)?.target;
        if (!seen.has(run) && target?.closest("[data-view-memory]")) {
          // A control's own CSS transition (the kit's press, a hover) is the kit's clock, shortened by the browser when it reverses; the view's moves are its animations.
          if (run instanceof CSSTransition) {
            continue;
          }
          const timing = run.effect?.getTiming();
          const frames = (run.effect as KeyframeEffect).getKeyframes();
          seen.set(run, {
            duration: Number(timing?.duration ?? 0),
            easing: String(timing?.easing ?? ""),
            keyframes: JSON.stringify(
              frames.map((frame) => frame.easing ?? "")
            ),
            where: `${target.tagName.toLowerCase()}.${String(target.className).split(" ")[0]}`,
          });
        }
      }
      if (on) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
    w.__stop = () => {
      on = false;
    };
  });
  const before = await page.locator(`[data-note="${NOTE.maestro}"]`).count();
  // Curate inbox: Inbox's head's one button, at every width.
  await page.locator('[data-block="inbox"] button[data-slot="curate"]').click();
  const settled = await until(
    "the curator's run to sort the inbox",
    async () => (await probe.get<MemoryPage>("/memory")).body,
    (one) =>
      !one.inbox.some((note) => note.id === NOTE.maestro) &&
      one.proposals.some((each) => each.kind === "sort"),
    60_000
  ).catch(() => undefined);
  kit.check(
    "Curate inbox runs the curator routine: the hub archives the scaffolding notes and Jev's sort proposes the lasting one",
    before === 1 && !!settled && settled.curator?.last !== null,
    `${JSON.stringify(settled?.inbox.map((one) => one.id))}; run ${JSON.stringify((await probe.get<MemoryPage>("/memory")).body.curator?.last)}`
  );
  const gone = await until(
    "the rows to leave and the sort to land",
    () =>
      page.evaluate(
        (notes) => ({
          maestro: document.querySelectorAll(`[data-note="${notes.maestro}"]`)
            .length,
          jevoff: document.querySelectorAll(`[data-note="${notes.jevoff}"]`)
            .length,
          landed: !!document.querySelector(
            `[data-note="${notes.ports}"] + [data-slot="ask-row"] + [data-slot="landed"] [data-slot="memory-proposal"][data-kind="sort"]`
          ),
        }),
        NOTE
      ),
    (one) => one.maestro === 0 && one.jevoff === 0 && one.landed,
    20_000
  ).catch(() => null);
  kit.check(
    "the sorted notes' rows leave on the hub's word, and Jev's sort lands under its note",
    gone !== null,
    JSON.stringify(gone)
  );
  await page.waitForTimeout(600);
  const runs = await page.evaluate((names) => {
    const w = window as unknown as {
      __anims: Map<
        Animation,
        { duration: number; easing: string; keyframes: string; where: string }
      >;
      __stop: () => void;
    };
    w.__stop();
    const host =
      document.querySelector("[data-view-memory]") ?? document.documentElement;
    const style = getComputedStyle(host);
    const value = (name: string) => style.getPropertyValue(name).trim();
    /** A curve as its numbers, so `cubic-bezier(.23,1,.32,1)` and `cubic-bezier(0.23, 1, 0.32, 1)` are one. */
    const curveOf = (one: string) =>
      one.startsWith("cubic-bezier(")
        ? `cb:${one
            .slice(13, -1)
            .split(",")
            .map((n) => Number.parseFloat(n).toFixed(4))
            .join(",")}`
        : one;
    // Each clock as the engine resolves it (a calc() token too): through a probe's animation-duration.
    const meter = document.createElement("div");
    host.append(meter);
    const durations = new Set(
      names.durations.map((name) => {
        meter.style.animationDuration = `var(${name})`;
        const one = getComputedStyle(meter).animationDuration;
        return Math.round(
          one.endsWith("ms")
            ? Number.parseFloat(one)
            : Number.parseFloat(one) * 1000
        );
      })
    );
    meter.remove();
    const curves = new Set([
      "linear",
      ...names.curves.map((name) => curveOf(value(name))),
    ]);
    return [...w.__anims.values()].map((one) => ({
      ...one,
      clock: durations.has(Math.round(one.duration)) || one.duration === 0,
      // A CSS animation's curve is its keyframes' (its own timing reads linear).
      curve:
        curves.has(curveOf(one.easing)) &&
        (JSON.parse(one.keyframes) as string[]).every(
          (each) => each === "" || curves.has(curveOf(each))
        ),
    }));
  }, TOKENS);
  kit.check(
    "every animation the view ran through it is on a DESIGN.md clock and curve (storyboard C)",
    runs.length > 0 && runs.every((one) => one.clock && one.curve),
    `${runs.length} runs; off the tokens: ${
      runs
        .filter((one) => !(one.clock && one.curve))
        .map((one) => `${one.where} ${one.duration}ms ${one.easing}`)
        .join("; ") || "none"
    }`
  );
}

/** Leg 11: the live page's boxes at 390, 680 and 1440, light and dark, with a file open. */
async function liveLegs(
  kit: Kit,
  probe: Probe,
  dashboard: string
): Promise<void> {
  const views: View[] = ["phone", "narrowDesk", "desk"];
  for (const view of views) {
    for (const theme of THEMES) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const page = listen(await kit.page(view, { theme }));
      await page.goto(`${dashboard}/project/${probe.projectId}?view=memory`);
      await memoryDrawn(page);
      await page.waitForTimeout(800);
      const drawn = await page
        .locator("[data-view-memory]")
        .evaluate(readDrawn, FORTY);
      const where = `live ${view} ${theme}`;
      blocksHold(kit, where, drawn);
      kit.check(
        `${where}: no row's title, meta and ⋯ overlap`,
        drawn.overlaps.length === 0,
        drawn.overlaps.slice(0, 4).join("; ") || undefined
      );
      kit.check(
        `${where}: the overflow sweep totals zero`,
        drawn.spills.length === 0,
        drawn.spills.slice(0, 4).join("; ") || undefined
      );
      kit.check(
        `${where}: no wrapping box of words is narrower than 120px`,
        drawn.narrow.length === 0,
        drawn.narrow.slice(0, 4).join("; ") || undefined
      );
      await headChecks(kit, page, where, drawn, view === "phone");
      await page.locator('[data-file="knowledge/deploy.md"] .opener').click();
      const card = await until(
        "deploy's card",
        () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLElement>(
              ".memory-file, .file-page"
            );
            if (!el?.querySelector(".fact")) {
              return null;
            }
            const box = el.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              width: box.width,
              view: window.innerWidth,
              page: el.classList.contains("file-page"),
            };
          }),
        Boolean,
        20_000
      ).catch(() => null);
      kit.check(
        `${where}: deploy's card opens ${view === "desk" ? "beside the view" : "as its own page"}, inside the window`,
        card !== null &&
          card.page === (view !== "desk") &&
          card.left >= -0.5 &&
          card.right <= card.view + 0.5 &&
          (view !== "desk" ||
            (card.width > 0.3 * card.view && card.width < 0.5 * card.view)),
        JSON.stringify(card)
      );
      const inCard = await page
        .locator(".memory-file, .file-page")
        .first()
        .evaluate(readDrawn, FORTY);
      kit.check(
        `${where}: the card's overflow sweep totals zero`,
        inCard.spills.length === 0,
        inCard.spills.slice(0, 4).join("; ") || undefined
      );
      await touchCheck(
        kit,
        page,
        `${where}: the card's small controls' touch areas are 44px or more on a coarse pointer`,
        view === "phone"
      );
      if (inCard.forty) {
        kit.check(
          `${where}: the 40-word fact wraps, its meta line one line with its chevron whole`,
          inCard.forty.lines > 1 &&
            inCard.forty.used &&
            inCard.forty.chevronInside &&
            inCard.forty.metaHeight <= inCard.forty.lineHeight * 1.6 + 8,
          JSON.stringify(inCard.forty)
        );
      }
      await page.close();
    }
  }
}

/** Leg 11's heads: Curate inbox one button, one ⋯ per head, tools inside the head; on a phone, 44px touch areas. */
async function headChecks(
  kit: Kit,
  page: Page,
  where: string,
  drawn: Drawn,
  phone: boolean
): Promise<void> {
  const heads = await page.evaluate(() => ({
    curate: [
      ...document.querySelectorAll<HTMLElement>(
        '[data-block="inbox"] [data-slot="curate"]'
      ),
    ].filter((el) => el.checkVisibility()).length,
    menus: [
      ...document.querySelectorAll(
        '[data-view-memory] [data-slot="block-head"]'
      ),
    ].map(
      (head) => head.querySelectorAll('button[aria-haspopup="menu"]').length
    ),
  }));
  kit.check(
    `${where}: Curate inbox stands as one button in Inbox's head, and every head has one ⋯`,
    heads.curate === 1 &&
      heads.menus.length >= 3 &&
      heads.menus.every((n) => n === 1),
    JSON.stringify(heads)
  );
  kit.check(
    `${where}: every block's tools stand inside its head`,
    drawn.heads.length === 0,
    drawn.heads.join("; ") || undefined
  );
  await touchCheck(
    kit,
    page,
    `${where}: every small control's touch area is 44px or more on a coarse pointer`,
    phone
  );
}

/** On a coarse pointer (the phone), every small control's touch area is 44px or more. */
async function touchCheck(
  kit: Kit,
  page: Page,
  claim: string,
  phone: boolean
): Promise<void> {
  if (!phone) {
    return;
  }
  const small = await page.evaluate(touchShort);
  kit.check(
    claim,
    small.length === 0,
    small.slice(0, 6).join("; ") || undefined
  );
}

/** The small controls on the page whose touch area (their box, or their `touch-hit` area) is under 44px either way. */
function touchShort(): string[] {
  const selectors = [
    ".to-file",
    ".archive-file",
    '[data-slot="running"] a.link',
    ".link-row",
    '[data-slot="curate"]',
    ".uses-chevron",
    '[data-slot="sources"]',
  ];
  return [...document.querySelectorAll<HTMLElement>(selectors.join(","))]
    .filter((el) => el.checkVisibility())
    .flatMap((el) => {
      const own = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      const w = Math.max(own.width, Number.parseFloat(after.width) || 0);
      const h = Math.max(own.height, Number.parseFloat(after.height) || 0);
      return w >= 43.5 && h >= 43.5
        ? []
        : [
            `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(w)}×${Math.round(h)}`,
          ];
    });
}

/** Each live page's errors, heard from its first load. */
const heard = new WeakMap<Page, string[]>();
const listen = (page: Page): Page => {
  const said: string[] = [];
  heard.set(page, said);
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(message.text().split("\n")[0] ?? "");
    }
  });
  page.on("pageerror", (error) =>
    said.push(
      `${error.message} ${error.stack?.split("\n").slice(1, 3).join(" ") ?? ""}`
    )
  );
  return page;
};

/** The Memory view drawn on a live page, or a failure saying what the page holds instead. */
async function memoryDrawn(page: Page): Promise<void> {
  const said = heard.get(page) ?? [];
  try {
    await page.waitForSelector('[data-block="facts"] [data-file]', {
      timeout: 60_000,
    });
  } catch (error) {
    const words = await page
      .evaluate(() =>
        document.body.innerText.replace(/\s+/g, " ").slice(0, 900)
      )
      .catch(() => "(unread)");
    throw new Error(
      `the Memory view never drew a Facts row at ${page.url()}: the page says "${words}"; errors: ${said.slice(0, 5).join(" | ") || "none"}`,
      { cause: error }
    );
  }
}

async function fleetLegs(kit: Kit): Promise<void> {
  // A brief's lines bear on its task; the starters' and the inbox's questions are the defaults.
  const jev = jevMock(
    undefined,
    (call) => ("task" in call.state ? 0.9 : 0.05),
    choose
  );
  try {
    const probe = await standUp(kit, jev.url);
    await routeLegs(kit, probe);
    const brief = await briefLeg(kit, probe);
    const dashboard = await probe.fleet.dashboard();
    const page = listen(await kit.page("desk"));
    await page.goto(`${dashboard}/project/${probe.projectId}?view=memory`);
    await memoryDrawn(page);
    await meterLeg(kit, probe, page, brief);
    await archiveLeg(kit, probe, page);
    await askLeg(kit, page);
    await noteLeg(kit, probe, page);
    await curateLeg(kit, probe, page);
    await reconnectLeg(kit, probe, page);
    await page.close();
    await needsLeg(kit, probe, dashboard);
    await liveLegs(kit, probe, dashboard);
  } finally {
    jev.stop();
  }
}

export default {
  name: "memory-view",
  async run(kit: Kit) {
    const fixtures = Bun.spawnSync(
      ["bun", "scripts/memory-fixtures.ts", "--check"],
      { cwd: ROOT }
    );
    kit.check(
      "the states' fixtures are the hub's answers for their folders",
      fixtures.exitCode === 0,
      `${fixtures.stdout.toString().trim()} ${fixtures.stderr.toString().trim()}`.trim()
    );
    if (!existsSync(join(FIXTURES, "desk.json"))) {
      return;
    }
    if (process.env.MEMORY_VIEW_LEGS !== "stage") {
      await fleetLegs(kit);
    }
    if (process.env.MEMORY_VIEW_LEGS !== "fleet") {
      await stageLegs(kit);
    }
  },
} satisfies Spec;
