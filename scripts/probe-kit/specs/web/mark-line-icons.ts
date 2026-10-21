/**
 * The Mark Line Rule's other half (DESIGN.md): on every mark line in the
 * dashboard, a control whose only content is a glyph (a button, link or
 * toggle holding an svg and no words) stands on the row's line, its glyph's
 * vertical centre within 0.5px of the row's. The recipe trims and pads each
 * run of words on the line (`mark-text`); a control with no words of its
 * own that took that padding sat low (the attachment chip's ✕, 4.17px under
 * the pill's centre). And every run of words on a mark line is still
 * trimmed: a child holding words of its own computes
 * `text-box: trim-both ex alphabetic`.
 *
 * Read from the engine, at desk 1440, light and dark, in two places:
 *  - every surface and open state the style snapshot walks
 *    (surfaces/catalogue.ts), on the hub tape (walk.ts `walkTapes`), and
 *    Jump once more with "chip today" typed (Finder's narrowing chip);
 *  - the delegate tray's bench (`/motion/delegate-tray?case=7r13f`): a
 *    chip's hover panel, the failures' shelf and the "+N" shelf;
 *  - every states file in apps/dashboard (`*.stories.ts`), each frame at
 *    rest on the dashboard's stage (stage-host/host.ts, as held-post-row
 *    starts it), each frame in the scheme it names.
 * A mark line is found from the stylesheets, not a class list: each rule
 * that sets `text-box-trim: trim-both` on `:where(<row>) > …` names a row
 * (`.mark-line`, and `.rail-line`, which applies it).
 *
 *   bun scripts/probe-kit/run.ts web mark-line-icons [--surfaces=a,b]
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one read at a time.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { buildStageHost } from "../../../../packages/agent/src/stage-host/build";
import { until } from "../../../scratch-fleet";
import {
  type Kit,
  open,
  ROOT,
  type Spec,
  settle,
  THEMES,
  type Theme,
} from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

const APP = join(ROOT, "apps/dashboard");
const surfacesArg = process.argv
  .find((arg) => arg.startsWith("--surfaces="))
  ?.slice("--surfaces=".length);

/** A frame's story, from its selector. */
const STORY = /data-cawco-story="([^"]*)"/;

/** The farthest a glyph's centre may stand from its row's, css px. */
const TOLERANCE = 0.5;

/** One icon-only control on a mark line, as the engine laid it out. */
interface Icon {
  /** Its glyph's centre less its row's content box's centre, css px (positive: low). */
  offset: number;
  /** The control's own trim and block padding, as computed. */
  own: string;
  scheme: string;
  /** Where it stands: the control and its row, by tag, slot and label. */
  site: string;
}

/** One run of words on a mark line whose trim is not the recipe's. */
interface Untrimmed {
  scheme: string;
  site: string;
  trim: string;
}

interface Read {
  icons: Icon[];
  rows: number;
  texts: number;
  untrimmed: Untrimmed[];
}

/**
 * Every mark line under `scope` (a selector; `:root` for the page) read in
 * the page: its icon-only controls' offsets and its words' trim. A frame's
 * canvas may scale it; every offset is divided back to the row's own css px.
 */
function readLines(scope: string): Read[] {
  const rows = new Set<string>();
  const visit = (list: CSSRuleList) => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) {
        if (rule.style.getPropertyValue("text-box-trim") === "trim-both") {
          for (const m of rule.selectorText.matchAll(
            /:where\((\.[\w-]+)\)\s*>/g
          )) {
            rows.add(m[1] as string);
          }
        }
        visit(rule.cssRules);
      } else if ("cssRules" in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A sheet of another origin: none of the recipe's.
    }
  }
  const rowSelector = [...rows].join(",");
  const name = (el: Element): string => {
    const slot = el.getAttribute("data-slot");
    const label =
      el.getAttribute("aria-label") ??
      el.getAttribute("title") ??
      (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
    const cls = [...el.classList]
      .filter((c) => !(c.includes(":") || c.includes("[")))
      .slice(0, 3)
      .join(".");
    return `${el.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}${cls ? `.${cls}` : ""}${label ? ` "${label}"` : ""}`;
  };
  const hidden = (el: Element): boolean => {
    for (let at: Element | null = el; at; at = at.parentElement) {
      const s = getComputedStyle(at);
      if (s.display === "none" || s.visibility === "hidden") {
        return true;
      }
      const r = at.getBoundingClientRect();
      // Words a screen reader alone hears (sr-only): a 1px clipped box.
      if (r.width <= 1 && r.height <= 1 && s.position === "absolute") {
        return true;
      }
    }
    return false;
  };
  /** Whether `el` shows words: a text node with letters that draws. */
  const showsWords = (el: Element): boolean => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (
        n.textContent?.trim() &&
        n.parentElement &&
        !hidden(n.parentElement)
      ) {
        return true;
      }
    }
    return false;
  };
  const ownWords = (el: Element): boolean =>
    [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.trim())
    );
  const CONTROL =
    'button, a, label, summary, [role="button"], [role="link"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"]';
  const LEFT_ALONE = "svg, img, .rail-cell, .icon-swap, .mark-cell, [data-box]";
  const scopes =
    scope === ":root"
      ? [document.documentElement]
      : [...document.querySelectorAll(scope)];
  /** A child's glyph: the largest svg it draws. */
  const glyphOf = (child: Element): DOMRect | undefined => {
    const boxes = [...child.querySelectorAll("svg")]
      .filter((svg) => !hidden(svg))
      .map((svg) => svg.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const [largest] = boxes;
    return largest;
  };
  /** One child of a row: its words' trim, and its glyph's offset when it is an icon-only control. */
  const readChild = (
    child: Element,
    row: Element,
    at: { line: boolean; middle: number; scale: number; scheme: string },
    out: Read
  ) => {
    const cs = getComputedStyle(child);
    const own = `${cs.textBoxTrim} ${cs.textBoxEdge} padding-block ${cs.paddingTop}/${cs.paddingBottom}`;
    const site = `${name(child)} in ${name(row)}`;
    if (!child.matches(LEFT_ALONE) && ownWords(child)) {
      out.texts += 1;
      if (!(
        cs.textBoxTrim === "trim-both" && cs.textBoxEdge === "ex alphabetic"
      )) {
        out.untrimmed.push({ scheme: at.scheme, site, trim: own });
      }
    }
    if (!(at.line && child.matches(CONTROL)) || showsWords(child)) {
      return;
    }
    const glyph = glyphOf(child);
    if (glyph) {
      out.icons.push({
        offset: (glyph.top + glyph.height / 2 - at.middle) / at.scale,
        own,
        scheme: at.scheme,
        site,
      });
    }
  };
  /** One row: the middle of its content box, and each child it shows. */
  const readRow = (row: Element, scheme: string, out: Read) => {
    const rs = getComputedStyle(row);
    // A line is a flex row centred on its cross axis; a column or a grid is a stack, not a line.
    const line =
      rs.display.endsWith("flex") &&
      rs.flexDirection.startsWith("row") &&
      rs.alignItems === "center";
    out.rows += 1;
    const rr = row.getBoundingClientRect();
    const tall = (row as HTMLElement).offsetHeight;
    const scale = tall > 0 ? rr.height / tall : 1;
    const px = (value: string) => Number.parseFloat(value) * scale;
    const top = rr.top + px(rs.borderTopWidth) + px(rs.paddingTop);
    const bottom = rr.bottom - px(rs.borderBottomWidth) - px(rs.paddingBottom);
    const at = { line, middle: (top + bottom) / 2, scale, scheme };
    for (const child of row.children) {
      if (!hidden(child)) {
        readChild(child, row, at, out);
      }
    }
  };
  return scopes.map((root) => {
    const scheme =
      (root as HTMLElement).dataset?.cawcoScheme ??
      (document.documentElement.classList.contains("dark") ? "dark" : "light");
    const out: Read = { icons: [], rows: 0, texts: 0, untrimmed: [] };
    if (!rowSelector) {
      return out;
    }
    for (const row of root.querySelectorAll(rowSelector)) {
      if (!hidden(row)) {
        readRow(row, scheme, out);
      }
    }
    return out;
  });
}

/** Every icon and run read, by where it was read. */
interface Tally {
  icons: (Icon & { where: string })[];
  rows: number;
  texts: number;
  untrimmed: (Untrimmed & { where: string })[];
}

const add = (tally: Tally, where: string, reads: Read[]): void => {
  for (const read of reads) {
    tally.rows += read.rows;
    tally.texts += read.texts;
    tally.icons.push(...read.icons.map((icon) => ({ ...icon, where })));
    tally.untrimmed.push(...read.untrimmed.map((u) => ({ ...u, where })));
  }
};

/** The icons and runs read, held to the invariant: one PASS or FAIL each. */
function judge(kit: Kit, label: string, tally: Tally): void {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const low = tally.icons.filter((icon) => Math.abs(icon.offset) > TOLERANCE);
  // Each site once per scheme, by its control's and row's shape (their
  // words left out): the same control on many states or items reads alike.
  const sites = new Map<string, Icon & { where: string; seen: number }>();
  for (const icon of tally.icons) {
    const key = `${icon.scheme} ${icon.site.replace(/ "[^"]*"/g, "")}`;
    const had = sites.get(key);
    if (!had || Math.abs(icon.offset) > Math.abs(had.offset)) {
      sites.set(key, { ...icon, seen: (had?.seen ?? 0) + 1 });
    } else {
      had.seen += 1;
    }
  }
  const listed = [...sites.values()]
    .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset))
    .map(
      (s) =>
        `    ${Math.abs(s.offset) > TOLERANCE ? "LOW " : "ok  "}${r2(s.offset)}px  ${s.scheme}  ${s.site}  (${s.where}${s.seen > 1 ? `, ${s.seen} reads` : ""}; ${s.own})`
    )
    .join("\n");
  kit.check(
    `${label}: every icon-only control on a mark line has its glyph's centre within ${TOLERANCE}px of its row's (${tally.icons.length} reads of ${sites.size} sites on ${tally.rows} rows, light and dark)`,
    tally.icons.length > 0 && low.length === 0,
    `\n${listed}`
  );
  const untrimmed = new Map(
    tally.untrimmed.map((u) => [`${u.scheme} ${u.site}`, u] as const)
  );
  kit.check(
    `${label}: every run of words on a mark line computes text-box: trim-both ex alphabetic (${tally.texts} reads)`,
    tally.texts > 0 && untrimmed.size === 0,
    [...untrimmed.values()]
      .map((u) => `\n    ${u.scheme}  ${u.site}  (${u.where}; ${u.trim})`)
      .join("")
  );
}

/** A port nothing holds now. */
const freePort = async (): Promise<number> => {
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/** Every states file in the dashboard, as the stage names it (from apps/dashboard). */
const storiesFiles = (): string[] =>
  [...new Bun.Glob("src/**/*.stories.ts").scanSync({ cwd: APP })].sort();

/** Every states file's frames at rest on the dashboard's stage, read. */
async function readStories(kit: Kit, tally: Tally): Promise<void> {
  const host = join(APP, ".cawco/stage/host.mjs");
  mkdirSync(join(APP, ".cawco/stage"), { recursive: true });
  writeFileSync(host, await buildStageHost());
  const port = await freePort();
  const stage = spawn("bun", [host], {
    cwd: APP,
    env: {
      ...process.env,
      CAWCO_STAGE: "1",
      CAWCO_STAGE_PORT: String(port),
      CAWCO_STAGE_FRAMEWORK: "svelte",
      CAWCO_STAGE_KIT: "1",
      CAWCO_STAGE_TOOLCHAIN: "vite",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let words = "";
  const hear = (chunk: Buffer) => {
    words += chunk.toString("utf8");
  };
  stage.stdout.on("data", hear);
  stage.stderr.on("data", hear);
  try {
    await until(
      "the stage's ready",
      () => words,
      (text) => text.includes('"cawco":"ready"'),
      60_000
    );
    for (const theme of THEMES) {
      const page = await kit.page("desk", { theme });
      for (const file of storiesFiles()) {
        await readFile(
          kit,
          page,
          `http://127.0.0.1:${port}`,
          file,
          theme,
          tally
        );
      }
    }
  } finally {
    stage.kill("SIGTERM");
  }
}

/** One states file's frames at rest, read in `theme` (a frame drawn in the page's own scheme is in it). */
async function readFile(
  kit: Kit,
  page: Page,
  stage: string,
  file: string,
  theme: Theme,
  tally: Tally
): Promise<void> {
  await page.goto(`${stage}/@cawco/canvas?file=${encodeURIComponent(file)}`, {
    waitUntil: "load",
  });
  const drawn = await page
    .waitForFunction(
      () => {
        const frames = [
          ...document.querySelectorAll(
            '.cawco-frame[data-cawco-interaction="rest"]'
          ),
        ];
        return (
          frames.length > 0 &&
          frames.every(
            (f) =>
              (f.querySelector(".cawco-frame-body")?.childElementCount ?? 0) > 0
          )
        );
      },
      undefined,
      { timeout: 60_000 }
    )
    .then(() => true)
    .catch(() => false);
  if (!drawn) {
    kit.note(`${file} · ${theme}: its frames did not draw at rest in 60s`);
    return;
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const frames = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.cawco-frame[data-cawco-interaction="rest"]'
      ),
    ].map(
      (f) =>
        `.cawco-frame[data-cawco-interaction="rest"][data-cawco-story="${f.dataset.cawcoStory}"][data-cawco-width="${f.dataset.cawcoWidth}"][data-cawco-scheme="${f.dataset.cawcoScheme}"]`
    )
  );
  for (const frame of new Set(frames)) {
    const story = STORY.exec(frame)?.[1] ?? "";
    const reads = await page.evaluate(readLines, frame);
    for (const read of reads) {
      for (const one of [...read.icons, ...read.untrimmed]) {
        one.scheme = one.scheme === "page" ? theme : one.scheme;
      }
    }
    add(tally, `${file} ${story}`, reads);
  }
}

/** The page's mark lines read, each in `theme` (the walk's pages say it by their pass). */
const readIn = async (page: Page, theme: Theme): Promise<Read[]> => {
  const reads = await page.evaluate(readLines, ":root");
  for (const read of reads) {
    for (const icon of read.icons) {
      icon.scheme = theme;
    }
    for (const u of read.untrimmed) {
      u.scheme = theme;
    }
  }
  return reads;
};

/** A remove on one of Finder's narrowing chips: "today" typed in Jump. */
const TIME_CHIP = 'button[aria-label="Stop narrowing to today"]';
/** A delegate's way out to its own view, in the tray's panel or shelf. */
const OPEN_LINK = 'a[aria-label^="Open "][aria-label$=" in its own view"]';

/**
 * The delegate tray's links, on its bench seeded with 7 running and 13
 * failed delegates: a running chip's hover panel, the failures' shelf and
 * the "+N" shelf, each read where it stands.
 */
async function readTray(kit: Kit, tally: Tally): Promise<void> {
  const bench = await kit.bench();
  for (const theme of THEMES) {
    const page = await kit.page("desk", { theme });
    await open(
      page,
      `${bench}/motion/delegate-tray?case=7r13f`,
      "[data-slot=tray] [data-tray-chip]"
    );
    await settle(page);
    const chips = page.locator("[data-slot=tray] [data-tray-chip]");
    const legs: [string, () => Promise<void>][] = [
      ["hover panel", () => chips.first().hover()],
      [
        "failures' shelf",
        async () => {
          await page.mouse.move(0, 0);
          await chips.last().click();
        },
      ],
      [
        "+N shelf",
        async () => {
          await page.keyboard.press("Escape");
          await page.locator("[data-slot=tray] [data-slot=more]").click();
        },
      ],
    ];
    for (const [leg, act] of legs) {
      const shown = await act()
        .then(() =>
          page
            .locator(OPEN_LINK)
            .filter({ visible: true })
            .first()
            .waitFor({ timeout: 5000 })
        )
        .then(() => true)
        .catch(() => false);
      if (!shown) {
        kit.note(`delegate-tray ${leg} · ${theme}: no link to read`);
        continue;
      }
      await settle(page, 400);
      add(tally, `delegate-tray ${leg}`, await readIn(page, theme));
    }
  }
}

const spec: Spec = {
  name: "mark-line-icons",
  async run(kit) {
    const surfaces: Tally = { icons: [], rows: 0, texts: 0, untrimmed: [] };
    await walkTapes(
      kit,
      chosen(surfacesArg),
      PASSES.filter((pass) => pass.width === "desk" && !pass.reduced),
      async ({ page, pass, state, surface }) => {
        add(
          surfaces,
          `${surface.name}/${state.name}`,
          await readIn(page, pass.theme)
        );
        // Jump open: a time word typed narrows by a chip with its remove.
        if (surface.name === "jump" && state.name === "open") {
          await page.keyboard.type("chip today");
          await page.locator(TIME_CHIP).first().waitFor({ timeout: 10_000 });
          await settle(page, 400);
          add(
            surfaces,
            "jump/open, today typed",
            await readIn(page, pass.theme)
          );
        }
      }
    );
    await readTray(kit, surfaces);
    kit.note(
      `surfaces: ${surfaces.icons.length} icon reads, ${surfaces.texts} runs of words, ${surfaces.rows} rows`
    );
    const stories: Tally = { icons: [], rows: 0, texts: 0, untrimmed: [] };
    await readStories(kit, stories);
    kit.note(
      `states files: ${stories.icons.length} icon reads, ${stories.texts} runs of words, ${stories.rows} rows`
    );
    judge(
      kit,
      "the dashboard at desk 1440 (its surfaces and its states files)",
      {
        icons: [...surfaces.icons, ...stories.icons],
        rows: surfaces.rows + stories.rows,
        texts: surfaces.texts + stories.texts,
        untrimmed: [...surfaces.untrimmed, ...stories.untrimmed],
      }
    );
  },
};
export default spec;
