/**
 * The alignment guides (core layout-guides.ts): the stage's drawing
 * measured from the live DOM, and the measure drawn over it in a layer of
 * the stage's own, taking no press. The person turns them on from the
 * design graph's head (core `STAGE_GUIDES`); an agent's `artifact_read`
 * with `layout` turns them on for its picture and reads the same numbers
 * (stage.ts `layout`, agent stage-render.ts).
 *
 * What it reads, all in the drawing's own px:
 * - every text line's box from a Range over its text, never its element's
 *   box, so a button's padding stands outside its words; runs that touch on
 *   one line (a bold word and the sentence after it) are one line;
 * - each surface: an element with a background, a border or a shadow (a
 *   bordered control among them). A surface's content is a group, and its
 *   start and end stand among the text edges of the group it stands in: a
 *   control drawn with no edge of its own is seen by its words alone;
 * - per group, the distinct start x of its text lines (the end or centre
 *   for text set that way) and their baselines;
 * - near-misses: two edges of one kind within core `NEAR_MISS_PX`, in a
 *   group or across the surfaces that stand in it; and two surfaces side by
 *   side in a row whose tops, middles and bottoms all miss each other, the
 *   nearest within it;
 * - every padding, and every gap between two children that stand one after
 *   another, matched against the page's spacing tokens: the custom
 *   properties its own sheets declare that name a space step
 *   (`--space-*`, `--spacing-space-*`), else every `--spacing*`, each
 *   resolved to px on the page.
 *
 * The browser's own grid and flex overlays (the DevTools protocol's Overlay
 * domain) are not used: the person's panel has no DevTools protocol, and
 * one drawing serves him and the agent alike.
 */

import {
  type EdgeKind,
  type GuideLine,
  type LayoutBox,
  type LayoutGroup,
  type LayoutPlace,
  type LayoutRead,
  NEAR_MISS_PX,
  type NearMiss,
  SAME_EDGE,
  type SpacingRead,
} from "@cawco/core/layout-guides";
import { describe, sourceOf } from "./measure";

const SVG = "http://www.w3.org/2000/svg";

/** A space step's name, its leading `--` off: `space-3`, `spacing-space-3`, `space-md`. */
const SPACE_STEP = /(?:^|-)space(?:-|$)/u;
const SPACING = /^spacing/u;

/** How far up an element's ancestors its source is looked for: its own, else its nearest written one. */
const SOURCE_DEPTH = 6;

/** Two text runs on one line this close (a share of their font size) are one run: a word space and a little more. Ours. */
const RUN_JOIN_EM = 0.6;

/** A legacy comma colour's alpha: `rgba(0, 0, 0, 0)`. */
const LEGACY_ALPHA = /^(?:rgba|hsla)\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/u;

/** A number rounded to a hundredth of a px, as the read says it. */
const px = (value: number): number => Math.round(value * 100) / 100;

/** Whether a computed colour is see-through. */
function clear(color: string): boolean {
  if (color === "transparent") {
    return true;
  }
  const slash = color.lastIndexOf("/");
  if (slash >= 0) {
    return Number.parseFloat(color.slice(slash + 1)) === 0;
  }
  const comma = color.match(LEGACY_ALPHA);
  return comma ? Number.parseFloat(comma[1] ?? "1") === 0 : false;
}

/** A box's four sides, as computed style names its borders. */
const SIDES = ["top", "right", "bottom", "left"] as const;

/** Whether an element draws a surface: a background, a visible border or a shadow. */
function isSurface(style: CSSStyleDeclaration): boolean {
  if (!clear(style.backgroundColor) || style.backgroundImage !== "none") {
    return true;
  }
  if (style.boxShadow !== "none") {
    return true;
  }
  return SIDES.some((side) => {
    const width = Number.parseFloat(
      style.getPropertyValue(`border-${side}-width`)
    );
    const line = style.getPropertyValue(`border-${side}-style`);
    return (
      width > 0 &&
      line !== "none" &&
      line !== "hidden" &&
      !clear(style.getPropertyValue(`border-${side}-color`))
    );
  });
}

/** Every custom property name the page's own sheets declare, CawCo's own sheet (`skip`) aside; and how many sheets kept their rules (another origin's). */
function declaredNames(skip: Node | null): {
  names: Set<string>;
  unread: number;
} {
  const names = new Set<string>();
  let unread = 0;
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const name of rule.style) {
          if (name.startsWith("--")) {
            names.add(name);
          }
        }
      }
      if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
        walk(rule.cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    if (skip && sheet.ownerNode === skip) {
      continue;
    }
    try {
      walk(sheet.cssRules);
    } catch (error) {
      // A sheet of another origin keeps its rules (a SecurityError): its tokens are not read, and the read says so.
      if (!(error instanceof DOMException)) {
        throw error;
      }
      unread += 1;
    }
  }
  return { names, unread };
}

/** The page's spacing tokens, by name, each resolved to px in `host` (a probe stands there for the read). */
function spacingTokens(
  host: Element,
  skip: Node | null
): { tokens: Record<string, number>; unread: number } {
  const declared = declaredNames(skip);
  const names = [...declared.names];
  const steps = names.filter((name) => SPACE_STEP.test(name.slice(2)));
  const chosen =
    steps.length > 0
      ? steps
      : names.filter((name) => SPACING.test(name.slice(2)));
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  host.append(probe);
  const tokens: Record<string, number> = {};
  for (const name of chosen.sort()) {
    probe.style.paddingLeft = `var(${name})`;
    const value = Number.parseFloat(getComputedStyle(probe).paddingLeft);
    if (Number.isFinite(value) && value > 0) {
      tokens[name] = px(value);
    }
  }
  probe.remove();
  return { tokens, unread: declared.unread };
}

/** The token a length equals, within {@link SAME_EDGE}; null for none. */
const tokenFor = (
  tokens: Record<string, number>,
  value: number
): string | null =>
  Object.entries(tokens).find(
    ([, one]) => Math.abs(one - value) < SAME_EDGE
  )?.[0] ?? null;

/** Distinct values: sorted, each within {@link SAME_EDGE} of another kept once. */
function distinct(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const kept: number[] = [];
  for (const one of sorted) {
    const last = kept.at(-1);
    if (last === undefined || one - last >= SAME_EDGE) {
      kept.push(px(one));
    }
  }
  return kept;
}

/** One edge as a near-miss is found among: where it stands, the surface it belongs to (the group's own, or one standing in it), and its element. */
interface Edge {
  at: number;
  /** The box the edge bounds: a text line's, a surface's. */
  box: LayoutBox;
  owner: number;
  place: LayoutPlace;
}

/** An edge's kind for the near-miss scan: a surface's own edges are read pair by pair ({@link rowMisses}). */
type ScanKind = Exclude<EdgeKind, "surface">;

/** One text line's run: its box, its baseline, and how its text is set. */
interface Run {
  align: Extract<EdgeKind, "start" | "end" | "centre">;
  baseline: number;
  bottom: number;
  el: Element;
  em: number;
  left: number;
  right: number;
  rtl: boolean;
  top: number;
}

/** A group as it is read, before it is said. */
interface Reading {
  box: LayoutBox;
  el: Element;
  lines: GuideLine[];
  parent: number | null;
  runs: Run[];
  scan: Map<ScanKind, Edge[]>;
  text: LayoutGroup["text"];
}

const alignOf = (style: CSSStyleDeclaration): Run["align"] => {
  const rtl = style.direction === "rtl";
  switch (style.textAlign) {
    case "center":
    case "-webkit-center":
      return "centre";
    case "end":
      return "end";
    case "right":
      return rtl ? "start" : "end";
    case "left":
      return rtl ? "end" : "start";
    default:
      return "start";
  }
};

/** A run's content area and baseline: the font's ascent and descent, by its font. */
interface FontMetrics {
  ascent: number;
  descent: number;
}

/** The runs of `runs` that share a line: each overlaps another of its line by more than half the shorter's height. */
function linesOf(runs: readonly Run[]): Run[][] {
  const sorted = [...runs].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Run[][] = [];
  const shares = (one: Run, other: Run) =>
    Math.min(other.bottom, one.bottom) - Math.max(other.top, one.top) >
    0.5 * Math.min(other.bottom - other.top, one.bottom - one.top);
  for (const run of sorted) {
    const line = lines.find((one) => one.some((other) => shares(run, other)));
    if (line) {
      line.push(run);
    } else {
      lines.push([run]);
    }
  }
  return lines;
}

/** A line's runs joined where they touch: a bold word and the sentence after it are one. */
function chainsOf(runs: readonly Run[]): Run[][] {
  const chains: Run[][] = [];
  for (const run of [...runs].sort((a, b) => a.left - b.left)) {
    const chain = chains.at(-1);
    const last = chain?.at(-1);
    if (chain && last && run.left - last.right <= RUN_JOIN_EM * run.em) {
      chain.push(run);
    } else {
      chains.push([run]);
    }
  }
  return chains;
}

/** The box round `runs`. */
function boxOfRuns(runs: readonly Run[]): LayoutBox {
  const left = Math.min(...runs.map((run) => run.left));
  const top = Math.min(...runs.map((run) => run.top));
  return {
    x: px(left),
    y: px(top),
    w: px(Math.max(...runs.map((run) => run.right)) - left),
    h: px(Math.max(...runs.map((run) => run.bottom)) - top),
  };
}

/** A group's guide lines as its text is read: each edge once by its kind and place, running over every line that stands on it. */
class Guides {
  readonly #by = new Map<string, GuideLine>();

  add(kind: GuideLine["kind"], at: number, from: number, to: number): void {
    const known = [...this.#by.values()].find(
      (one) => one.kind === kind && Math.abs(one.at - at) < SAME_EDGE
    );
    if (known) {
      known.from = Math.min(known.from, px(from));
      known.to = Math.max(known.to, px(to));
      return;
    }
    this.#by.set(`${kind}|${px(at)}`, {
      kind,
      at: px(at),
      from: px(from),
      to: px(to),
    });
  }

  lines(): GuideLine[] {
    return [...this.#by.values()];
  }

  /** The distinct places of `kind`'s edges. */
  ats(kind: GuideLine["kind"]): number[] {
    return distinct(
      [...this.#by.values()]
        .filter((one) => one.kind === kind)
        .map((one) => one.at)
    );
  }
}

/** A text line's span and its start, by the line it stands on. */
interface Span {
  left: number;
  line: number;
  right: number;
  start: number;
}

/** The distinct starts of the lines that stand under one another, sharing some of their width: a row of labels side by side has none. */
function stackedStarts(spans: readonly Span[]): number[] {
  return distinct(
    spans
      .filter((one) =>
        spans.some(
          (other) =>
            other.line !== one.line &&
            Math.min(one.right, other.right) - Math.max(one.left, other.left) >
              0
        )
      )
      .map((one) => one.start)
  );
}

/** A chain's edge as its text is set: its centre, its end, or its start (the left, or the right in a right-to-left run). */
function chainEdge(chain: readonly Run[]): { at: number; first: Run } | null {
  const [first] = chain;
  const last = chain.at(-1);
  if (!(first && last)) {
    return null;
  }
  const { left } = first;
  const { right } = last;
  const [start, end] = first.rtl ? [right, left] : [left, right];
  if (first.align === "centre") {
    return { at: (left + right) / 2, first };
  }
  return { at: first.align === "end" ? end : start, first };
}

/**
 * One read of a drawing's layout (core layout-guides.ts): its groups, their
 * text, their near-misses and its spacing, every position in the drawing's
 * px from the frame's corner, at the frame's zoom.
 */
class LayoutReader {
  readonly #boxes = new Map<Element, LayoutBox>();
  readonly #drawing: HTMLElement;
  readonly #groupOf = new Map<Element, number>();
  readonly #metrics = new Map<string, FontMetrics>();
  readonly #origin: DOMRect;
  readonly #pen = document.createElement("canvas").getContext("2d");
  readonly #readings: Reading[] = [];
  readonly #root: string;
  readonly #styles = new Map<Element, CSSStyleDeclaration>();
  readonly #zoomed: number;

  constructor(frame: HTMLElement, drawing: HTMLElement, root: string) {
    this.#drawing = drawing;
    this.#root = root;
    this.#zoomed = Number(frame.style.zoom) || 1;
    this.#origin = frame.getBoundingClientRect();
    this.#groupOf.set(drawing, this.#newReading(drawing, null));
  }

  readonly boxIn = (box: DOMRect | DOMRectReadOnly): LayoutBox => ({
    x: px((box.left - this.#origin.left) / this.#zoomed),
    y: px((box.top - this.#origin.top) / this.#zoomed),
    w: px(box.width / this.#zoomed),
    h: px(box.height / this.#zoomed),
  });

  /** An element as the read names it: its selector, and its own source or its nearest written ancestor's. */
  readonly placeOf = (el: Element): LayoutPlace => {
    let source: string | null = null;
    let at: Element | null = el;
    for (let depth = 0; at && depth < SOURCE_DEPTH && !source; depth += 1) {
      source = sourceOf(at, this.#root);
      at = at === this.#drawing ? null : at.parentElement;
    }
    return { el: describe(el), source };
  };

  readonly styleOf = (el: Element): CSSStyleDeclaration => {
    let style = this.#styles.get(el);
    if (!style) {
      style = getComputedStyle(el);
      this.#styles.set(el, style);
    }
    return style;
  };

  get boxes(): Map<Element, LayoutBox> {
    return this.#boxes;
  }

  get readings(): readonly Reading[] {
    return this.#readings;
  }

  #newReading(el: Element, parent: number | null): number {
    this.#readings.push({
      box: this.boxIn(el.getBoundingClientRect()),
      el,
      lines: [],
      parent,
      runs: [],
      scan: new Map(),
      text: { starts: [], stacked: [], ends: [], centres: [], baselines: [] },
    });
    return this.#readings.length - 1;
  }

  /** Group `group`'s edges of `kind`, as the near-miss scan reads them. */
  readonly scanOf = (group: number, kind: ScanKind): Edge[] => {
    const reading = this.#readings[group];
    if (!reading) {
      return [];
    }
    let edges = reading.scan.get(kind);
    if (!edges) {
      edges = [];
      reading.scan.set(kind, edges);
    }
    return edges;
  };

  /** The group whose content `el` is: its nearest surface, itself included. */
  #contentGroup(el: Element): number {
    const known = this.#groupOf.get(el);
    if (known !== undefined) {
      return known;
    }
    const parent = el.parentElement;
    return parent && this.#drawing.contains(parent)
      ? this.#contentGroup(parent)
      : 0;
  }

  /** `el`'s box, when it is drawn and larger than a hairline. */
  #shown(el: Element): LayoutBox | null {
    const style = this.styleOf(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return null;
    }
    const box = this.boxIn(el.getBoundingClientRect());
    return box.w > 1 && box.h > 1 ? box : null;
  }

  /**
   * Each element's box, and each surface a group of its own: its start and
   * end among the edges of the group it stands in, so a card's edge and a
   * bordered control's are scanned with the words beside them.
   */
  readSurfaces(elements: readonly Element[]): void {
    for (const el of elements) {
      const box = this.#shown(el);
      if (!box) {
        continue;
      }
      this.#boxes.set(el, box);
      const style = this.styleOf(el);
      if (!isSurface(style)) {
        continue;
      }
      const outer = el.parentElement ? this.#contentGroup(el.parentElement) : 0;
      const id = this.#newReading(el, outer);
      this.#groupOf.set(el, id);
      const place = this.placeOf(el);
      const rtl = style.direction === "rtl";
      this.scanOf(outer, "start").push({
        at: rtl ? box.x + box.w : box.x,
        box,
        owner: id,
        place,
      });
      this.scanOf(outer, "end").push({
        at: rtl ? box.x : box.x + box.w,
        box,
        owner: id,
        place,
      });
    }
  }

  /** A font's ascent and descent, measured once by a canvas; a share of its size where none can be. */
  #fontOf(style: CSSStyleDeclaration): FontMetrics {
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const known = this.#metrics.get(font);
    if (known) {
      return known;
    }
    const size = Number.parseFloat(style.fontSize) || 16;
    let read: FontMetrics = { ascent: size * 0.8, descent: size * 0.2 };
    if (this.#pen) {
      this.#pen.font = font;
      const measured = this.#pen.measureText("Hg");
      if (measured.fontBoundingBoxAscent > 0) {
        read = {
          ascent: measured.fontBoundingBoxAscent,
          descent: measured.fontBoundingBoxDescent,
        };
      }
    }
    this.#metrics.set(font, read);
    return read;
  }

  /** Every text line's runs, by a Range over each text node, each in its group. */
  readText(): void {
    const range = document.createRange();
    const texts = document.createTreeWalker(
      this.#drawing,
      NodeFilter.SHOW_TEXT
    );
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      const parent = node.parentElement;
      if (parent && node.textContent?.trim() && this.#boxes.has(parent)) {
        range.selectNodeContents(node);
        this.#runsOf(parent, range.getClientRects());
      }
    }
  }

  /** The runs of one text node under `parent`, a rect a line. */
  #runsOf(parent: Element, rects: DOMRectList): void {
    const style = this.styleOf(parent);
    const font = this.#fontOf(style);
    const em = Number.parseFloat(style.fontSize) || 16;
    const runs = this.#readings[this.#contentGroup(parent)]?.runs;
    // The run's content area centred in its box: its baseline the font's ascent down from the area's top.
    const area = (font.ascent + font.descent) / this.#zoomed;
    for (const rect of rects) {
      const box = this.boxIn(rect);
      if (box.w > 1 && box.h > 1) {
        runs?.push({
          align: alignOf(style),
          baseline: px(box.y + (box.h - area) / 2 + font.ascent / this.#zoomed),
          bottom: box.y + box.h,
          el: parent,
          em,
          left: box.x,
          right: box.x + box.w,
          rtl: style.direction === "rtl",
          top: box.y,
        });
      }
    }
  }

  /**
   * Group `id`'s runs joined into lines, each line's start, end or centre
   * and baselines kept as its text is set. Its text edges are said to the
   * group it stands in too, and its first baseline, so the surfaces standing
   * there are scanned against each other.
   */
  lineEdges(id: number): void {
    const reading = this.#readings[id];
    if (!reading) {
      return;
    }
    const outer = reading.parent;
    const guides = new Guides();
    const lines = linesOf(reading.runs);
    const spans: Span[] = [];
    for (const [index, line] of lines.entries()) {
      for (const chain of chainsOf(line)) {
        const span = this.#chainSaid(id, outer, chain, guides);
        if (span) {
          spans.push({ ...span, line: index });
        }
      }
      this.#baselinesSaid(id, line, guides);
    }
    reading.lines = guides.lines();
    reading.text = {
      starts: guides.ats("start"),
      stacked: stackedStarts(spans),
      ends: guides.ats("end"),
      centres: guides.ats("centre"),
      baselines: guides.ats("baseline"),
    };
    const [firstLine] = lines;
    const first = firstLine?.[0];
    if (firstLine && first && outer !== null) {
      this.scanOf(outer, "baseline").push({
        at: first.baseline,
        box: boxOfRuns(firstLine),
        owner: id,
        place: this.placeOf(first.el),
      });
    }
  }

  /** A chain's edge kept in `edges` and said to its group and the one it stands in; its span when it starts a line. */
  #chainSaid(
    id: number,
    outer: number | null,
    chain: readonly Run[],
    guides: Guides
  ): Omit<Span, "line"> | null {
    const edge = chainEdge(chain);
    if (!edge) {
      return null;
    }
    const kind = edge.first.align;
    const box = boxOfRuns(chain);
    const said = {
      at: edge.at,
      box,
      owner: id,
      place: this.placeOf(edge.first.el),
    };
    guides.add(kind, edge.at, box.y, box.y + box.h);
    this.scanOf(id, kind).push(said);
    if (outer !== null) {
      this.scanOf(outer, kind).push(said);
    }
    return kind === "start"
      ? {
          left: edge.first.left,
          right: chain.at(-1)?.right ?? edge.first.right,
          start: edge.at,
        }
      : null;
  }

  /** A line's distinct baselines kept in `edges` and said to its group: two a near-miss apart are runs that should sit on one. */
  #baselinesSaid(id: number, line: readonly Run[], guides: Guides): void {
    for (const at of distinct(line.map((run) => run.baseline))) {
      const on = line.filter((one) => Math.abs(one.baseline - at) < SAME_EDGE);
      const [run] = on;
      if (run) {
        const box = boxOfRuns(on);
        guides.add("baseline", at, box.x, box.x + box.w);
        this.scanOf(id, "baseline").push({
          at,
          box,
          owner: id,
          place: this.placeOf(run.el),
        });
      }
    }
  }

  /** Every near-miss: each group's edges scanned, and the surfaces standing in it read pair by pair. */
  nearMisses(): NearMiss[] {
    const misses: NearMiss[] = [];
    const seen = new Set<string>();
    for (const [id, reading] of this.#readings.entries()) {
      for (const [kind, edges] of reading.scan) {
        nearMisses(kind, edges, id, misses, seen);
      }
      rowMisses(
        id,
        this.#readings.flatMap((one, at) => (one.parent === id ? [at] : [])),
        this.#readings,
        this.placeOf,
        misses
      );
    }
    return misses;
  }

  /** The drawing's own box. */
  drawn(): LayoutBox {
    return this.boxIn(this.#drawing.getBoundingClientRect());
  }
}

/**
 * Reads the layout of `drawing`, standing in `frame` (the box every
 * position is read from, at the frame's zoom): `host` holds the token
 * probe, `own` is CawCo's own sheet (its tokens are not the page's), `root`
 * the toolchain root sources are said from.
 */
export function readLayout(
  frame: HTMLElement,
  drawing: HTMLElement,
  host: Element,
  own: Node | null,
  root: string
): LayoutRead {
  const reader = new LayoutReader(frame, drawing, root);
  const { tokens, unread: sheetsUnread } = spacingTokens(host, own);
  const elements = [...drawing.querySelectorAll("*")];
  reader.readSurfaces(elements);
  reader.readText();
  for (const id of reader.readings.keys()) {
    reader.lineEdges(id);
  }
  const misses = reader.nearMisses();
  const spacing = spacingOf(
    elements,
    reader.boxes,
    reader.styleOf,
    tokens,
    reader.placeOf
  );
  const groups: LayoutGroup[] = reader.readings.map((reading, id) => ({
    id,
    ...reader.placeOf(reading.el),
    box: reading.box,
    lines: reading.lines,
    parent: reading.parent,
    text: reading.text,
  }));
  const drawn = reader.drawn();
  const leftOut = sheetsUnread > 0 ? { sheets: sheetsUnread } : undefined;
  return {
    width: drawn.w,
    height: drawn.h,
    tokens,
    groups,
    nearMisses: misses,
    // Off-token first: what a reader acts on.
    spacing: [...spacing].sort(
      (a, b) => Number(a.token !== null) - Number(b.token !== null)
    ),
    ...(leftOut ? { leftOut } : {}),
  };
}

/** The near-misses among `edges` of `kind` in group `group`: neighbours apart by more than one edge and no more than {@link NEAR_MISS_PX}. */
function nearMisses(
  kind: ScanKind,
  edges: Edge[],
  group: number,
  misses: NearMiss[],
  seen: Set<string>
): void {
  const sorted = [...edges].sort((a, b) => a.at - b.at);
  for (let at = 1; at < sorted.length; at += 1) {
    const a = sorted[at - 1];
    const b = sorted[at];
    if (!(a && b)) {
      continue;
    }
    const apart = b.at - a.at;
    // Two edges of one surface standing in this group are scanned in its own.
    const oneOther = a.owner === b.owner && a.owner !== group;
    if (apart < SAME_EDGE || apart > NEAR_MISS_PX || oneOther) {
      continue;
    }
    const key = `${kind}|${px(a.at)}|${px(b.at)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    misses.push({
      kind,
      apart: px(apart),
      within: a.owner === b.owner ? "group" : "siblings",
      group,
      a: { at: px(a.at), box: a.box, ...a.place },
      b: { at: px(b.at), box: b.box, ...b.place },
    });
  }
}

/** The most surfaces standing in one group whose rows are read pair by pair. Ours: a screen's tiles, a list's first rows. */
const ROW_PAIRS_MAX = 60;

/**
 * The near-misses among the surfaces standing side by side in group
 * `group`: two whose boxes share some of a row stand aligned when their
 * tops, middles or bottoms meet; when none meets and the nearest pair of
 * one kind is within {@link NEAR_MISS_PX}, that pair is a near-miss.
 */
function rowMisses(
  group: number,
  ids: number[],
  readings: readonly Reading[],
  placeOf: (el: Element) => LayoutPlace,
  misses: NearMiss[]
): void {
  const ends = (box: LayoutBox) => [box.y, box.y + box.h / 2, box.y + box.h];
  const kept = ids.slice(0, ROW_PAIRS_MAX);
  for (const [at, one] of kept.entries()) {
    for (const other of kept.slice(at + 1)) {
      const a = readings[one];
      const b = readings[other];
      if (!(a && b)) {
        continue;
      }
      const shared =
        Math.min(a.box.y + a.box.h, b.box.y + b.box.h) -
        Math.max(a.box.y, b.box.y);
      if (shared <= 0) {
        continue;
      }
      const mine = ends(a.box);
      const theirs = ends(b.box);
      const apart = mine.map((y, kind) => Math.abs(y - (theirs[kind] ?? y)));
      if (apart.some((each) => each < SAME_EDGE)) {
        continue;
      }
      const nearest = apart.indexOf(Math.min(...apart));
      const gap = apart[nearest] ?? Number.POSITIVE_INFINITY;
      if (gap > NEAR_MISS_PX) {
        continue;
      }
      misses.push({
        kind: "surface",
        apart: px(gap),
        within: "siblings",
        group,
        a: { at: px(mine[nearest] ?? 0), box: a.box, ...placeOf(a.el) },
        b: { at: px(theirs[nearest] ?? 0), box: b.box, ...placeOf(b.el) },
      });
    }
  }
}

/** Children of `el` that lay out as boxes: `display: contents` opened to its own, plain inline runs and placed layers left out. */
function laidChildren(
  el: Element,
  styleOf: (el: Element) => CSSStyleDeclaration
): Element[] {
  const out: Element[] = [];
  for (const child of el.children) {
    const style = styleOf(child);
    if (style.display === "contents") {
      out.push(...laidChildren(child, styleOf));
    } else if (
      style.display !== "none" &&
      style.display !== "inline" &&
      style.position !== "absolute" &&
      style.position !== "fixed"
    ) {
      out.push(child);
    }
  }
  return out;
}

/** Writes a spacing once, counting each time the same written spacing stands again. */
type Keep = (
  el: Element,
  kind: SpacingRead["kind"],
  side: SpacingRead["side"],
  value: number,
  box: LayoutBox,
  free?: boolean
) => void;

const lengthOf = (value: string): number => Number.parseFloat(value) || 0;

/** `el`'s four paddings, each a strip inside its border. */
function paddingsOf(
  el: Element,
  box: LayoutBox,
  style: CSSStyleDeclaration,
  keep: Keep
): void {
  const top = lengthOf(style.paddingTop);
  const right = lengthOf(style.paddingRight);
  const bottom = lengthOf(style.paddingBottom);
  const left = lengthOf(style.paddingLeft);
  const inner = {
    x: box.x + lengthOf(style.borderLeftWidth),
    y: box.y + lengthOf(style.borderTopWidth),
    w:
      box.w -
      lengthOf(style.borderLeftWidth) -
      lengthOf(style.borderRightWidth),
    h:
      box.h -
      lengthOf(style.borderTopWidth) -
      lengthOf(style.borderBottomWidth),
  };
  keep(el, "padding", "top", top, { ...inner, h: top });
  keep(el, "padding", "bottom", bottom, {
    ...inner,
    y: inner.y + inner.h - bottom,
    h: bottom,
  });
  keep(el, "padding", "left", left, { ...inner, w: left });
  keep(el, "padding", "right", right, {
    ...inner,
    x: inner.x + inner.w - right,
    w: right,
  });
}

/** How much of two boxes' spans along one axis they share; 0 or less where none. */
const sharedAcross = (a: LayoutBox, b: LayoutBox): number =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
const sharedDown = (a: LayoutBox, b: LayoutBox): number =>
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

/** A child as its container's gaps are read: its element and its box. */
interface Child {
  box: LayoutBox;
  el: Element;
}

/** Of the children `before` one at `box`, the nearest above it sharing some of its width, and the nearest beside it sharing some of its height (to its left, or its right in a right-to-left row). */
function neighboursOf(
  box: LayoutBox,
  before: readonly Child[]
): { above: Child | null; beside: Child | null } {
  let above: Child | null = null;
  let beside: Child | null = null;
  const nearer = (b: LayoutBox, now: Child | null) =>
    !now || Math.abs(b.x - box.x) < Math.abs(now.box.x - box.x);
  for (const one of before) {
    const b = one.box;
    if (sharedAcross(b, box) > 0 && b.y + b.h <= box.y + SAME_EDGE) {
      above = !above || b.y + b.h > above.box.y + above.box.h ? one : above;
    } else if (
      sharedDown(b, box) > 0 &&
      sharedAcross(b, box) <= SAME_EDGE &&
      nearer(b, beside)
    ) {
      beside = one;
    }
  }
  return { above, beside };
}

/** Distributed room: `space-between`, `space-around`, `space-evenly`. */
const SPREAD = /^space-/u;

/** Whether `el`'s margin on `side` is `auto`, as its computed value says (a used value hides it); never where the browser has no typed style. */
const autoMargin = (el: Element, side: string): boolean =>
  "computedStyleMap" in el &&
  el.computedStyleMap().get(side)?.toString() === "auto";

/**
 * Whether the room between two children along `axis` is handed out of
 * their container's free room rather than written as a length: the
 * container spreads its items along it, or either child's margin on that
 * axis is `auto`.
 */
function freeRoom(
  container: CSSStyleDeclaration,
  axis: "x" | "y",
  pair: readonly Element[]
): boolean {
  const flex = container.display.includes("flex");
  const main = container.flexDirection.startsWith("row") ? "x" : "y";
  const spread =
    (flex && axis === main) || container.display.includes("grid")
      ? SPREAD.test(
          axis === "x" || flex
            ? container.justifyContent
            : container.alignContent
        )
      : false;
  const sides =
    axis === "x"
      ? ["margin-left", "margin-right"]
      : ["margin-top", "margin-bottom"];
  return (
    spread || pair.some((el) => sides.some((side) => autoMargin(el, side)))
  );
}

/** The gaps between `el`'s children: each child to the nearest one before it above and beside it. */
function gapsOf(
  el: Element,
  style: CSSStyleDeclaration,
  children: readonly Child[],
  keep: Keep
): void {
  for (const [at, { box, el: child }] of children.entries()) {
    const { above, beside } = neighboursOf(box, children.slice(0, at));
    if (above) {
      const from = above.box.y + above.box.h;
      const x = Math.max(above.box.x, box.x);
      keep(
        el,
        "gap",
        "y",
        box.y - from,
        {
          x: px(x),
          y: px(from),
          w: px(Math.min(above.box.x + above.box.w, box.x + box.w) - x),
          h: px(box.y - from),
        },
        freeRoom(style, "y", [above.el, child])
      );
    }
    if (beside) {
      const b = beside.box;
      const leftOf = b.x + b.w <= box.x + SAME_EDGE;
      const from = leftOf ? b.x + b.w : box.x + box.w;
      const to = leftOf ? box.x : b.x;
      const y = Math.max(b.y, box.y);
      keep(
        el,
        "gap",
        "x",
        to - from,
        {
          x: px(from),
          y: px(y),
          w: px(to - from),
          h: px(Math.min(b.y + b.h, box.y + box.h) - y),
        },
        freeRoom(style, "x", [beside.el, child])
      );
    }
  }
}

/** The most children of one element whose gaps are read. Ours: a long list's first screenfuls. */
const CHILDREN_READ = 200;

/**
 * Every padding side and every gap in the drawing: a gap the room between
 * a child and the nearest one before it that stands above it (down) or
 * beside it (across), sharing some of its span. Each written spacing once,
 * counted.
 */
function spacingOf(
  walked: Element[],
  boxes: Map<Element, LayoutBox>,
  styleOf: (el: Element) => CSSStyleDeclaration,
  tokens: Record<string, number>,
  placeOf: (el: Element) => LayoutPlace
): SpacingRead[] {
  const kept = new Map<string, SpacingRead>();
  const keep: Keep = (el, kind, side, value, box, free) => {
    if (value < SAME_EDGE) {
      return;
    }
    const place = placeOf(el);
    const key = `${place.source ?? place.el}|${kind}|${side}|${px(value)}`;
    const known = kept.get(key);
    if (known) {
      known.count += 1;
      return;
    }
    kept.set(key, {
      ...place,
      kind,
      side,
      px: px(value),
      token: tokenFor(tokens, value),
      box,
      count: 1,
      ...(free ? { free: true as const } : {}),
    });
  };
  for (const el of walked) {
    const box = boxes.get(el);
    if (box) {
      paddingsOf(el, box, styleOf(el), keep);
      const children = laidChildren(el, styleOf).flatMap((child) => {
        const one = boxes.get(child);
        return one ? [{ el: child, box: one }] : [];
      });
      gapsOf(el, styleOf(el), children.slice(0, CHILDREN_READ), keep);
    }
  }
  return [...kept.values()];
}

/* --- The drawing of it ---------------------------------------------------- */

const svgLine = (
  kind: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): SVGLineElement => {
  const one = document.createElementNS(SVG, "line");
  one.setAttribute("x1", String(x1));
  one.setAttribute("y1", String(y1));
  one.setAttribute("x2", String(x2));
  one.setAttribute("y2", String(y2));
  one.dataset.kind = kind;
  return one;
};

const svgRect = (kind: string, box: LayoutBox): SVGRectElement => {
  const one = document.createElementNS(SVG, "rect");
  one.setAttribute("x", String(box.x));
  one.setAttribute("y", String(box.y));
  one.setAttribute("width", String(Math.max(0, box.w)));
  one.setAttribute("height", String(Math.max(0, box.h)));
  one.dataset.kind = kind;
  return one;
};

const svgLabel = (words: string, x: number, y: number): SVGTextElement => {
  const one = document.createElementNS(SVG, "text");
  one.setAttribute("x", String(x));
  one.setAttribute("y", String(y));
  one.textContent = words;
  return one;
};

/** A group's guides: its surface's edge, and each text edge over the lines that stand on it (a baseline across its line). */
function groupGuides(group: LayoutGroup): SVGElement[] {
  return [
    ...(group.parent === null ? [] : [svgRect("surface", group.box)]),
    ...group.lines.map((one) =>
      one.kind === "baseline"
        ? svgLine(one.kind, one.from, one.at, one.to, one.at)
        : svgLine(one.kind, one.at, one.from, one.at, one.to)
    ),
  ];
}

/** A near-miss's two edges in red over both boxes they bound, and its px by the second. */
function missGuides(miss: NearMiss): {
  label: SVGTextElement;
  lines: SVGLineElement[];
} {
  const { a, b } = miss;
  // A baseline's and a row's are y; every other kind's is x.
  const across = miss.kind === "baseline" || miss.kind === "surface";
  const from = across ? Math.min(a.box.x, b.box.x) : Math.min(a.box.y, b.box.y);
  const to = across
    ? Math.max(a.box.x + a.box.w, b.box.x + b.box.w)
    : Math.max(a.box.y + a.box.h, b.box.y + b.box.h);
  return {
    lines: [a.at, b.at].map((at) =>
      across
        ? svgLine("miss", from, at, to, at)
        : svgLine("miss", at, from, at, to)
    ),
    label: across
      ? svgLabel(`${miss.apart}`, to, b.at)
      : svgLabel(`${miss.apart}`, b.at, from),
  };
}

/** A spacing's shade: on a token, off every one, or handed out of free room. */
const spacingKind = (one: SpacingRead): string => {
  if (one.token) {
    return "on-token";
  }
  return one.free ? "free" : "off-token";
};

/**
 * The guides drawn for `read` in `svg`, sized to the frame: spacing shaded
 * first (on a token in one wash, off every one in the near-miss red with
 * its px), each group's surface edge and text edges, then each near-miss
 * in red over both its edges, the px labels over all.
 */
export function drawGuides(svg: SVGSVGElement, read: LayoutRead): void {
  const misses = read.nearMisses.map(missGuides);
  const labels = document.createElementNS(SVG, "g");
  labels.dataset.kind = "labels";
  labels.append(
    ...read.spacing.flatMap((one) =>
      one.token
        ? []
        : [
            svgLabel(
              `${one.px}`,
              one.box.x + one.box.w / 2,
              one.box.y + one.box.h / 2
            ),
          ]
    ),
    ...misses.map((one) => one.label)
  );
  svg.replaceChildren(
    ...read.spacing.map((one) => svgRect(spacingKind(one), one.box)),
    ...read.groups.flatMap(groupGuides),
    ...misses.flatMap((one) => one.lines),
    labels
  );
}
