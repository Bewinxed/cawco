/**
 * Where a piece's words stand: its runs of words, and each run's lines at
 * their ink. One walk for both halves of a skeleton: the capture bones each
 * run where its ink stands (routes/dev/bones/ink-bones.ts), and the browser
 * counts each run's lines once the real piece has landed, so the next
 * skeleton of that slot is drawn with as many lines (SkeletonOf, shape.ts).
 *
 * A run is an element that holds words and nothing laid out as a box of its
 * own: a name, a meta line, a paragraph, a badge's word. Runs are found in
 * document order, which is the order the capture records them in.
 */

import { FORM_CONTROLS } from "@cawco/core/pin-name";

/** Elements boned as one box: their box is their ink. */
const BOXES: ReadonlySet<string> = new Set([
  "img",
  "svg",
  "video",
  "canvas",
  ...FORM_CONTROLS,
]);

/** What the walk leaves out, as boneyard's own snapshot is told. */
export interface WalkConfig {
  excludeSelectors?: string[];
  excludeTags?: string[];
}

/** One line a run sets: its words' extent, capitals' top to baseline. */
export interface InkLine {
  base: number;
  left: number;
  right: number;
  top: number;
}

/** Every run of words under `root`, in document order. */
export function findRuns(root: Element, config?: WalkConfig): Element[] {
  const runs: Element[] = [];
  for (const child of root.children) {
    walk(child, config, runs);
  }
  return runs;
}

function walk(node: Element, config: WalkConfig | undefined, runs: Element[]) {
  if (!shown(node)) {
    return;
  }
  const tag = node.tagName.toLowerCase();
  if (
    BOXES.has(tag) ||
    config?.excludeTags?.includes(tag) ||
    config?.excludeSelectors?.some((selector) => node.matches(selector))
  ) {
    return;
  }
  if (isRun(node)) {
    runs.push(node);
    return;
  }
  for (const child of node.children) {
    walk(child, config, runs);
  }
}

/** It holds words, and nothing in it is laid out as a box of its own. */
function isRun(node: Element): boolean {
  if (!node.textContent?.trim()) {
    return false;
  }
  for (const inner of node.querySelectorAll("*")) {
    if (!shown(inner)) {
      continue;
    }
    const { display } = getComputedStyle(inner);
    if (
      BOXES.has(inner.tagName.toLowerCase()) ||
      (display !== "inline" && display !== "contents")
    ) {
      return false;
    }
  }
  return true;
}

function shown(node: Element): boolean {
  const style = getComputedStyle(node);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

/** A face's capital H: where its ink starts above the baseline, and its box's ascent. */
interface Capital {
  ascent: number;
  ink: number;
}

/** One canvas measures every face, each face once (browser only). */
let measure: CanvasRenderingContext2D | null = null;
const capitals = new Map<string, Capital>();

function capitalOf(holder: Element): Capital | null {
  const { fontStyle, fontWeight, fontSize, fontFamily } =
    getComputedStyle(holder);
  const font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
  const held = capitals.get(font);
  if (held) {
    return held;
  }
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) {
    return null;
  }
  measure.font = font;
  // A line fragment's rect is its content area, which starts the font's
  // ascent above its baseline; the capital H's ink is the cap height.
  const h = measure.measureText("H");
  const capital = {
    ascent: h.fontBoundingBoxAscent,
    ink: h.actualBoundingBoxAscent,
  };
  capitals.set(font, capital);
  return capital;
}

/** The run's ink, line by line, top to bottom. */
export function inkLines(run: Element): InkLine[] {
  const lines = new Map<number, InkLine>();
  const texts = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
  for (let text = texts.nextNode(); text; text = texts.nextNode()) {
    const holder = text.parentElement;
    const capital = holder && text.textContent?.trim() ? capitalOf(holder) : null;
    if (!capital) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const fragment of range.getClientRects()) {
      if (fragment.width >= 1) {
        const base = fragment.top + capital.ascent;
        const top = base - capital.ink;
        const key = Math.round(base);
        const line = lines.get(key);
        lines.set(key, {
          left: Math.min(line?.left ?? fragment.left, fragment.left),
          right: Math.max(line?.right ?? fragment.right, fragment.right),
          top: Math.min(line?.top ?? top, top),
          base: Math.max(line?.base ?? base, base),
        });
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.base - b.base);
}

/** How many lines each run of words under `root` sets, in document order. */
export function lineCounts(root: Element): number[] {
  return findRuns(root).map((run) => inkLines(run).length);
}

/** A surface boned as a container: a fill, an image, a rounded edge. */
export function surfaced(style: CSSStyleDeclaration): boolean {
  const fill = style.backgroundColor;
  const edged =
    (Number.parseFloat(style.borderTopWidth) || 0) > 0 &&
    style.borderTopColor !== "rgba(0, 0, 0, 0)" &&
    (Number.parseFloat(style.borderTopLeftRadius) || 0) > 0;
  return (
    (fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") ||
    style.backgroundImage !== "none" ||
    edged
  );
}
