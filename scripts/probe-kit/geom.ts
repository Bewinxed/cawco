/**
 * Layout read from the engine: boxes from getBoundingClientRect, styles from
 * getComputedStyle, and the plain arithmetic of gaps, alignment and overlap
 * over them. No pixel is read here.
 */
import type { Page } from "playwright-core";

export interface Box {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

/** The first element `selector` names: its box, or null when none is drawn. */
export function box(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, selector);
}

/** Every element `selector` names, drawn ones only: their boxes. */
export function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 || r.height > 0)
        .map((r) => ({
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        })),
    selector
  );
}

/** Computed style properties of the first element `selector` names (`pseudo` e.g. "::after"). */
export function styles(
  page: Page,
  selector: string,
  props: string[],
  pseudo?: string
): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ sel, list, ps }) => {
      const el = document.querySelector(sel);
      if (!el) {
        return null;
      }
      const s = getComputedStyle(el, ps ?? null);
      return Object.fromEntries(list.map((p) => [p, s.getPropertyValue(p)]));
    },
    { sel: selector, list: props, ps: pseudo }
  );
}

/** A computed colour as rgb, through a token: what `var(--token)` resolves to under `selector`. */
export function tokenColour(
  page: Page,
  token: string,
  under = "body"
): Promise<string> {
  return page.evaluate(
    ({ t, sel }) => {
      const swatch = document.createElement("span");
      swatch.style.color = `var(${t})`;
      (document.querySelector(sel) ?? document.body).append(swatch);
      const ink = getComputedStyle(swatch).color;
      swatch.remove();
      return ink;
    },
    { t: token, sel: under }
  );
}

/** How far b starts after a ends, along an axis (negative where they overlap). */
export const gap = (a: Box, b: Box, axis: "x" | "y" = "y"): number =>
  axis === "y" ? b.top - a.bottom : b.left - a.right;

/** Whether every value lies within `tolerance` of the others. */
export const aligned = (values: number[], tolerance = 1): boolean =>
  values.length === 0 || Math.max(...values) - Math.min(...values) <= tolerance;

/** The spread of a set of values: how far apart the extremes land. */
export const spread = (values: number[]): number =>
  values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);

/** The area two boxes share, px². */
export const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Whether `inner` lies inside `outer`, within `tolerance`. */
export const inside = (inner: Box, outer: Box, tolerance = 0.5): boolean =>
  inner.left >= outer.left - tolerance &&
  inner.right <= outer.right + tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.bottom <= outer.bottom + tolerance;

export const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * How an inline chip sits in its line of text, read from the engine: each
 * text's baseline is its range's top plus its font's ascent (a text range's
 * box is the font's ascent over descent, `fontBoundingBox*`), so the chip's
 * label (its last words) and the words around it are read alike.
 *
 * - `delta`: the label's baseline less the text's on the chip's line.
 * - `pitches`: the distance from each line's baseline to the next, over the
 *   block's own words (outside every chip), against its `line-height`.
 * - `before`/`after`: the chip's edge less the character beside it: 0 when
 *   only the text's own space (or none) stands between them.
 */
export interface InlineFit {
  after: number | null;
  before: number | null;
  blockHeight: number;
  chipLine: number;
  delta: number;
  label: string;
  lineHeight: number;
  lines: number[];
  pitches: number[];
}

export function inlineFit(chip: Element): InlineFit {
  const canvas = document.createElement("canvas").getContext("2d");
  const ascentOf = (el: Element): number => {
    if (!canvas) {
      return 0;
    }
    const style = getComputedStyle(el);
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return canvas.measureText("Hg").fontBoundingBoxAscent;
  };
  const rangeOf = (node: Text, from = 0, to = node.data.length): Range => {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    return range;
  };
  const texts = (root: Node): Text[] => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out: Text[] = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if ((n as Text).data.trim()) {
        out.push(n as Text);
      }
    }
    return out;
  };
  const block =
    chip.parentElement?.closest("p, li, [data-editor]") ?? chip.parentElement;
  const chipBox = chip.getBoundingClientRect();
  const labelNode = texts(chip).at(-1);
  const labelBaseline = labelNode
    ? (rangeOf(labelNode).getClientRects()[0]?.top ?? 0) +
      ascentOf(labelNode.parentElement as Element)
    : 0;
  // Every line's baseline, over the block's words outside any chip.
  const isChip = (n: Node) =>
    n.parentElement?.closest(
      "[data-session-chip], [data-skill-chip], [data-mention-chip]"
    );
  const baselines = new Set<number>();
  let chipLine = Number.NaN;
  for (const node of texts(block as Node)) {
    if (isChip(node)) {
      continue;
    }
    const ascent = ascentOf(node.parentElement as Element);
    for (const rect of rangeOf(node).getClientRects()) {
      const baseline = Math.round((rect.top + ascent) * 2) / 2;
      baselines.add(baseline);
      if (rect.bottom > chipBox.top && rect.top < chipBox.bottom) {
        chipLine = baseline;
      }
    }
  }
  const lines = [...baselines].sort((a, b) => a - b);
  // The character beside the chip on either side, skipping what draws none.
  const beside = (dir: "previousSibling" | "nextSibling"): number | null => {
    let n: Node | null = chip[dir];
    while (n && !(n.nodeType === Node.TEXT_NODE && (n as Text).data)) {
      if (
        n.nodeType === Node.ELEMENT_NODE &&
        (n as Element).getClientRects().length
      ) {
        return null;
      }
      n = n[dir];
    }
    if (!n) {
      return null;
    }
    const text = n as Text;
    const at = dir === "previousSibling" ? text.data.length - 1 : 0;
    const rect = rangeOf(text, at, at + 1).getBoundingClientRect();
    // A chip that opens or ends a line has nothing beside it on that side.
    if (rect.bottom <= chipBox.top || rect.top >= chipBox.bottom) {
      return null;
    }
    return dir === "previousSibling"
      ? chipBox.left - rect.right
      : rect.left - chipBox.right;
  };
  return {
    label: labelNode?.data.trim() ?? "",
    delta: Math.round((labelBaseline - chipLine) * 100) / 100,
    chipLine,
    lines,
    pitches: lines.slice(1).map((b, i) => b - (lines[i] as number)),
    lineHeight: Number.parseFloat(
      getComputedStyle(block as Element).lineHeight
    ),
    blockHeight: (block as Element).getBoundingClientRect().height,
    before: beside("previousSibling"),
    after: beside("nextSibling"),
  };
}

/**
 * Whether a chip sits in its line as a word does: its label within 1px of
 * the text's baseline, every line pitch the block's line-height, and no
 * space of its own on either side.
 */
export const fitsLine = (fit: InlineFit): boolean =>
  Number.isFinite(fit.chipLine) &&
  Math.abs(fit.delta) <= 1 &&
  fit.pitches.every((p) => Math.abs(p - fit.lineHeight) <= 0.5) &&
  [fit.before, fit.after].every(
    (space) => space === null || Math.abs(space) < 1
  );
