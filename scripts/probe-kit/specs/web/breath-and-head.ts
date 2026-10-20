/**
 * Three shared dashboard rules, read from the engine.
 *
 * 1. Live work's breath holds 3:1 at its floor (DESIGN.md Live work
 *    breathes; WCAG 2.2 SC 1.4.11, unrounded). On the /motion/breath-floor
 *    bench every kind of breather stands on each surface; each one's
 *    `breath` animations are paused and seeked to each tenth of the loop,
 *    and the lowest computed opacity found is its floor. Its ink (a glyph's
 *    colour, a dot's fill) at that opacity over the nearest opaque ground
 *    under it (both rasterised through a canvas to the sRGB the page draws)
 *    must stand 3:1 or more from that ground, in both schemes. Then, under
 *    reduced motion, every breather's computed animation-name is `none`
 *    (`breath` at full motion).
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
 *    width; only trailing text cuts). The to-dos card's task id is set as
 *    code (PlanPane's `subtitleCode`): the mono family at the meta size.
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
import { open, settle, THEMES } from "../../kit";

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

interface Breather {
  floor: number;
  /** Its ground: the nearest opaque background under it. */
  ground: number[];
  groundColor: string;
  /** Its ink: a glyph's colour, or a dot's fill. */
  ink: number[];
  name: string;
  /** Its breath's animations (CSS `breath`). */
  runs: number;
}

/** Every breather on one surface, its breath paused and seeked through a loop. */
function readBreathers(surface: string): Breather[] | null {
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
  const opaque = (value: string) => rgb(value)[3] === 255;
  const box = document.querySelector<HTMLElement>(
    `[data-surface="${surface}"]`
  );
  if (!box) {
    return null;
  }
  return [...box.querySelectorAll<HTMLElement>("[data-breather]")].map(
    (holder) => {
      const runs = holder
        .getAnimations({ subtree: true })
        .filter(
          (run): run is CSSAnimation =>
            run instanceof CSSAnimation && run.animationName === "breath"
        );
      const target = runs[0]?.effect
        ? ((runs[0].effect as KeyframeEffect).target as HTMLElement | null)
        : null;
      const el = target ?? holder;
      // Marked for the reduced-motion leg, which finds it by this.
      el.dataset.breathTarget = holder.dataset.breather;
      let floor = 1;
      for (const run of runs) {
        run.pause();
        const end = Number(run.effect?.getComputedTiming().duration ?? 0);
        for (let at = 0; at <= 10; at += 1) {
          run.currentTime = (end * at) / 10;
          floor = Math.min(floor, Number(getComputedStyle(el).opacity));
        }
      }
      const style = getComputedStyle(el);
      const ink = opaque(style.backgroundColor)
        ? style.backgroundColor
        : style.color;
      let under: Element | null = el.parentElement;
      while (
        under &&
        under !== box &&
        !opaque(getComputedStyle(under).backgroundColor)
      ) {
        under = under.parentElement;
      }
      const groundColor = getComputedStyle(under ?? box).backgroundColor;
      return {
        floor,
        ground: rgb(groundColor),
        groundColor,
        ink: rgb(ink),
        name: holder.dataset.breather ?? "",
        runs: runs.length,
      };
    }
  );
}

async function breathFloor(kit: Kit, bench: string): Promise<void> {
  for (const theme of THEMES) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme at a time, each on its own page
    const page = await kit.page("desk", { theme });
    await open(page, `${bench}/motion/breath-floor`, "[data-breather] svg");
    await settle(page);
    const rows: string[] = [];
    let pass = true;
    let lowest = Number.POSITIVE_INFINITY;
    for (const surface of SURFACES) {
      // biome-ignore lint/performance/noAwaitInLoops: one surface at a time on one page
      const read = await page.evaluate(readBreathers, surface);
      if (!read || read.length === 0) {
        pass = false;
        rows.push(`${surface}: no breathers`);
        continue;
      }
      for (const one of read) {
        const drawn = one.ink.map(
          (c, i) => one.floor * c + (1 - one.floor) * (one.ground[i] ?? 0)
        );
        const contrast = ratio(drawn, one.ground);
        lowest = Math.min(lowest, contrast);
        const ok = one.runs > 0 && contrast >= 3;
        pass &&= ok;
        rows.push(
          `${ok ? "ok  " : "LOW "}${surface} ${one.name}: floor ${r2(one.floor)}, ${r2(contrast)}:1 at the floor (${r2(ratio(one.ink, one.ground))}:1 full) on ${one.groundColor}`
        );
      }
    }
    kit.check(
      `${theme}: every breather breathes, and at its breath's floor holds 3:1 or more on what stands under it, on every surface (lowest ${r2(lowest)}:1)`,
      pass,
      `\n${rows.map((row) => `    ${row}`).join("\n")}`
    );
    // Reduced motion: every breather's loop stops (DESIGN.md: loops stop).
    const names = async () =>
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-breath-target]")].map(
          (el) =>
            `${el.dataset.breathTarget}=${getComputedStyle(el).animationName}`
        )
      );
    const full = await names();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await names();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    kit.check(
      `${theme}: every breather's animation-name is breath at full motion and none under reduced motion (${full.length} breathers)`,
      full.length > 0 &&
        full.every((one) => one.endsWith("=breath")) &&
        reduced.length === full.length &&
        reduced.every((one) => one.endsWith("=none")),
      `\n    full: ${[...new Set(full)].join(", ")}\n    reduced: ${[...new Set(reduced)].join(", ")}`
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
              '[data-slot="side-head"] > [data-slot="identity"]'
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
  // A task attempt's id under its to-dos is code: its face and size are a
  // probe's set as the line's own declaration was before the subtitle took
  // the meta role (`font: var(--text-meta) var(--font-mono)`).
  const face = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(
      '[data-card="todos"] [data-slot="subtitle"]'
    );
    const probe = document.createElement("span");
    probe.style.font = "var(--text-meta) var(--font-mono)";
    document.body.append(probe);
    const want = getComputedStyle(probe);
    const own = line ? getComputedStyle(line) : null;
    const read = {
      text: line?.textContent ?? null,
      family: own?.fontFamily ?? null,
      size: own?.fontSize ?? null,
      wantFamily: want.fontFamily,
      wantSize: want.fontSize,
    };
    probe.remove();
    return read;
  });
  kit.check(
    "the to-dos card's task id is set as code: the mono family at the meta size",
    face.text === "tsk-2026-10-19-plan" &&
      face.family === face.wantFamily &&
      face.size === face.wantSize,
    JSON.stringify(face)
  );
  // A head control is the kit's sm ghost (DESIGN.md: each the `sm` ghost;
  // Ghost: transparent until hovered): 30px, no fill at rest, the hover
  // fill under the pointer, the strong ink. Its transition is run to its
  // end before each read.
  const CLOSE = '[data-card="file"] [data-slot="close"]';
  const ghost = async () =>
    await page.evaluate((at) => {
      for (const run of document.getAnimations()) {
        if (run instanceof CSSTransition) {
          run.finish();
        }
      }
      const el = document.querySelector<HTMLElement>(at);
      const probe = document.createElement("span");
      probe.style.cssText =
        "display:block;background-color:var(--surface-hover);color:var(--ink-strong);block-size:var(--c-btn-h-sm)";
      document.body.append(probe);
      const want = getComputedStyle(probe);
      const own = el ? getComputedStyle(el) : null;
      const read = {
        height: el?.getBoundingClientRect().height ?? null,
        wantHeight: want.blockSize,
        background: own?.backgroundColor ?? null,
        hoverFill: want.backgroundColor,
        ink: own?.color ?? null,
        wantInk: want.color,
      };
      probe.remove();
      return read;
    }, CLOSE);
  await page.mouse.move(0, 0);
  const rest = await ghost();
  await page.hover(CLOSE);
  const over = await ghost();
  kit.check(
    "a head control is the kit's sm ghost: 30px, no fill at rest, the hover fill under the pointer, the strong ink",
    rest.height === Number.parseFloat(rest.wantHeight) &&
      rest.background === "rgba(0, 0, 0, 0)" &&
      over.background === over.hoverFill &&
      rest.ink === rest.wantInk,
    JSON.stringify({ rest, over })
  );
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
    '[data-slot="hitl"] h2 [data-num]'
  );
  const head = await page.evaluate((): PromptHead | null => {
    const h2 = document.querySelector('[data-slot="hitl"] h2');
    const place = h2?.querySelector<HTMLElement>("[data-num]");
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
