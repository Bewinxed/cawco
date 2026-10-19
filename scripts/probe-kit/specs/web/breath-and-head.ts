/**
 * Three shared dashboard rules, read from the engine.
 *
 * 1. Live work's breath holds 3:1 at its floor (DESIGN.md Live work
 *    breathes; WCAG 2.2 SC 1.4.11, unrounded). On the /motion/breath-floor
 *    bench, Find's real working row stands on each surface; every animation
 *    on its glyph is paused and seeked to each tenth of its loop, and the
 *    lowest computed opacity found is the floor. The glyph's computed colour
 *    at that opacity over the surface's computed colour (both rasterised
 *    through a canvas to the sRGB the page draws) must stand 3:1 or more
 *    from the surface, in both schemes.
 *
 * 2. A side card's name never runs under its actions (SideSurface). On the
 *    /motion/side-head bench, the real SideSurface as wide as Split stands
 *    it, with each kind of name a side card carries (the plan's title, ring
 *    and figure; the to-dos and their task id; a file's path) beside a
 *    pane's own actions, at 320, 390, 680 and 1440: every word and the ring
 *    of the name, cut by every ancestor that clips it (what is drawn of it),
 *    is tested against every action's box; no action and not Close is
 *    drawn past the card's edge; and the name's first word is
 *    drawn whole, or to NAME_KEEPS when it is longer (its words keep their
 *    width; only trailing text cuts).
 *
 * 3. An ask's place keycap ("2 of 3") keeps its width (Prompt). On the
 *    /motion/prompt-head bench, the real approval card at 390, second of
 *    three, from a session with a long title: the keycap's text lays out as
 *    one line box, and the asker is cut with an ellipsis inside its own box
 *    (it runs past it, and its box ends before the keycap starts).
 *
 *   bun scripts/probe-kit/run.ts web breath-and-head
 */
import type { Kit, Spec } from "../../kit";
import { open, THEMES } from "../../kit";

const SURFACES = [
  "surface-page",
  "surface-raised",
  "surface-recess",
  "surface-recess-deep",
  "surface-well",
] as const;
const WIDTHS = [320, 390, 680, 1440] as const;
/** The name's own width a head keeps before any control stands (side/head.ts NAME_KEEPS). */
const NAME_KEEPS = 120;

/** The relative luminance's contrast ratio (WCAG 2) of two sRGB colours. */
function ratio(a: number[], b: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (p: number[]) =>
    0.2126 * lin(p[0] ?? 0) + 0.7152 * lin(p[1] ?? 0) + 0.0722 * lin(p[2] ?? 0);
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

interface Floor {
  animations: number;
  floor: number;
  glyph: number[];
  rowBackground: string;
  surface: number[];
  surfaceColor: string;
}

async function breathFloor(kit: Kit, bench: string): Promise<void> {
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
    const page = await kit.page("desk", { theme });
    await open(
      page,
      `${bench}/motion/breath-floor`,
      '[data-surface] [data-slot="glyph"] svg'
    );
    const rows: Record<string, unknown>[] = [];
    let pass = true;
    for (const surface of SURFACES) {
      // biome-ignore lint/performance/noAwaitInLoops: one surface at a time on one page
      const read = await page.evaluate((name): Floor | null => {
        const rgb = (value: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const pen = canvas.getContext("2d");
          if (!pen) {
            return [];
          }
          pen.fillStyle = value;
          pen.fillRect(0, 0, 1, 1);
          return [...pen.getImageData(0, 0, 1, 1).data];
        };
        const box = document.querySelector<HTMLElement>(
          `[data-surface="${name}"]`
        );
        const glyph = box?.querySelector<HTMLElement>('[data-slot="glyph"]');
        const row = box?.querySelector<HTMLElement>('[data-slot="row"]');
        if (!(box && glyph && row)) {
          return null;
        }
        const runs = glyph.getAnimations();
        let floor = 1;
        for (const run of runs) {
          run.pause();
          const end = Number(run.effect?.getComputedTiming().duration ?? 0);
          for (let at = 0; at <= 10; at += 1) {
            run.currentTime = (end * at) / 10;
            floor = Math.min(floor, Number(getComputedStyle(glyph).opacity));
          }
        }
        const surfaceColor = getComputedStyle(box).backgroundColor;
        return {
          animations: runs.length,
          floor,
          glyph: rgb(getComputedStyle(glyph).color),
          rowBackground: getComputedStyle(row).backgroundColor,
          surface: rgb(surfaceColor),
          surfaceColor,
        };
      }, surface);
      if (!read) {
        pass = false;
        rows.push({ surface, missing: "surface, row or glyph" });
        continue;
      }
      const drawn = read.glyph.map(
        (c, i) => read.floor * c + (1 - read.floor) * (read.surface[i] ?? 0)
      );
      const contrast = ratio(drawn, read.surface);
      const clear = read.rowBackground === "rgba(0, 0, 0, 0)";
      pass &&= read.animations > 0 && clear && contrast >= 3;
      rows.push({
        surface,
        color: read.surfaceColor,
        breathes: read.animations,
        floor: r2(read.floor),
        atFloor: r2(contrast),
        full: r2(ratio(read.glyph, read.surface)),
      });
    }
    kit.check(
      `${theme}: the working glyph breathes, and at its breath's floor holds 3:1 or more on every surface`,
      pass,
      `\n${rows.map((row) => `    ${JSON.stringify(row)}`).join("\n")}`
    );
  }
}

interface Head {
  card: string;
  first: string;
  firstKept: boolean;
  overlaps: string[];
  /** Controls drawn past the card's edge. */
  spills: string[];
  words: number;
}

async function sideHead(kit: Kit, bench: string): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  for (const width of WIDTHS) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time on one page
    await page.setViewportSize({ width, height: 900 });
    await open(page, `${bench}/motion/side-head`, "[data-card] [data-action]");
    // The head re-fits on its ResizeObserver: two frames for it to land.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    const heads = await page.evaluate(
      (keeps): Head[] =>
        [...document.querySelectorAll<HTMLElement>("[data-card]")].map(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one self-contained read in the page, its helpers inside it
          (card) => {
            const actions = [
              ...card.querySelectorAll<HTMLElement>("[data-action]"),
            ].map((one) => ({
              name: one.getAttribute("aria-label") ?? one.textContent ?? "",
              box: one.getBoundingClientRect(),
            }));
            const name = card.querySelector<HTMLElement>(
              '[data-slot="side-head"] > .identity'
            );
            /** What is drawn of a box: cut by every ancestor up to the card that clips. */
            const drawn = (box: DOMRect, from: Element) => {
              let { left, right, top, bottom } = box;
              for (
                let at: Element | null = from;
                at && at !== card;
                at = at.parentElement
              ) {
                if (getComputedStyle(at).overflowX === "visible") {
                  continue;
                }
                const clip = at.getBoundingClientRect();
                left = Math.max(left, clip.left);
                right = Math.min(right, clip.right);
                top = Math.max(top, clip.top);
                bottom = Math.min(bottom, clip.bottom);
              }
              return { left, right, top, bottom };
            };
            const edge = card
              .querySelector('[data-slot="side-card"]')
              ?.getBoundingClientRect();
            const spills = [
              ...card.querySelectorAll<HTMLElement>(
                '[data-action], [data-slot="close"]'
              ),
            ]
              .filter((one) => {
                const box = one.getBoundingClientRect();
                return !edge || box.right > edge.right + 0.5;
              })
              .map(
                (one) => one.getAttribute("aria-label") ?? one.textContent ?? ""
              );
            const overlaps: string[] = [];
            let words = 0;
            let firstKept = false;
            let first = "";
            const test = (label: string, box: DOMRect, from: Element) => {
              const cut = drawn(box, from);
              words += 1;
              if (words === 1) {
                // Drawn whole, or (a path longer than the head) to NAME_KEEPS.
                const shown = Math.max(0, cut.right - cut.left);
                firstKept = shown >= Math.min(box.width, keeps) - 1;
                first = `${Math.round(shown)}/${Math.round(box.width)}px`;
              }
              for (const action of actions) {
                const a = action.box;
                if (
                  Math.min(cut.right, a.right) - Math.max(cut.left, a.left) >
                    0.5 &&
                  Math.min(cut.bottom, a.bottom) - Math.max(cut.top, a.top) >
                    0.5
                ) {
                  overlaps.push(`"${label}" under ${action.name}`);
                }
              }
            };
            if (name) {
              // Every word of the name, and its ring, in reading order.
              const walk = document.createTreeWalker(name, NodeFilter.SHOW_ALL);
              for (let node = walk.nextNode(); node; node = walk.nextNode()) {
                if (node instanceof SVGSVGElement) {
                  test("ring", node.getBoundingClientRect(), node);
                  continue;
                }
                if (node.nodeType !== Node.TEXT_NODE || !node.parentElement) {
                  continue;
                }
                const value = node.textContent ?? "";
                for (const match of value.matchAll(/\S+/g)) {
                  const range = document.createRange();
                  range.setStart(node, match.index);
                  range.setEnd(node, match.index + match[0].length);
                  test(
                    match[0],
                    range.getBoundingClientRect(),
                    node.parentElement
                  );
                }
              }
            }
            return {
              card: card.dataset.card ?? "",
              spills,
              first,
              firstKept,
              overlaps,
              words,
            };
          }
        ),
      NAME_KEEPS
    );
    const pass =
      heads.length === 3 &&
      heads.every(
        (one) =>
          one.words > 0 &&
          one.overlaps.length === 0 &&
          one.spills.length === 0 &&
          one.firstKept
      );
    kit.check(
      `${width}px: no word of a side card's name runs under its actions, its first word is drawn whole (to 120px), and no control spills past the card`,
      pass,
      `\n${heads.map((one) => `    ${JSON.stringify(one)}`).join("\n")}`
    );
  }
}

interface PromptHead {
  askerClips: boolean;
  askerEnd: number;
  lines: number;
  placeStart: number;
  placeText: string;
}

async function promptHead(kit: Kit, bench: string): Promise<void> {
  const page = await kit.page("phone", { theme: "light" });
  await open(
    page,
    `${bench}/motion/prompt-head`,
    '[data-slot="hitl"] h2 .place'
  );
  const head = await page.evaluate((): PromptHead | null => {
    const h2 = document.querySelector('[data-slot="hitl"] h2');
    const place = h2?.querySelector<HTMLElement>(".place");
    const asker = h2?.querySelector<HTMLElement>('[data-slot="title"]');
    if (!(place && asker)) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(place);
    // One line box: every text rect of the keycap on one baseline.
    const tops = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 0)
        .map((rect) => Math.round(rect.top))
    );
    return {
      askerClips:
        asker.scrollWidth > asker.clientWidth &&
        getComputedStyle(asker).textOverflow === "ellipsis",
      askerEnd: asker.getBoundingClientRect().right,
      lines: tops.size,
      placeStart: place.getBoundingClientRect().left,
      placeText: place.textContent?.trim() ?? "",
    };
  });
  kit.check(
    "390px: an ask's place keycap stands on one line, and the long asker is cut inside its own box before it",
    !!head &&
      head.lines === 1 &&
      head.askerClips &&
      head.askerEnd <= head.placeStart + 0.5,
    `\n    ${JSON.stringify(head)}`
  );
}

const spec: Spec = {
  name: "breath-and-head",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    await breathFloor(kit, bench);
    await sideHead(kit, bench);
    await promptHead(kit, bench);
  },
};

export default spec;
