/**
 * What a surface looks like to the engine, element by element: the computed
 * style of every element under the surface's root, its box, the ways it
 * spills or stands outside what holds it, its `::before`/`::after`, and for
 * what takes a pointer or the focus, the same again under `:hover` and
 * `:focus-visible` (forced through the DevTools protocol, `CSS.forcePseudoState`).
 *
 * Each element is keyed by its DOM path from the root, `tag:n` per step
 * (n its place among its siblings of that tag, from 1), never by a class
 * or a `data-slot`: the key is the same before and after a restyle. A
 * `data-slot` is shown beside the key, as a label.
 *
 * Read with time held: every running animation and transition finished (a
 * finite one) or paused at its start (an infinite one) before any value is
 * read, and again after every forced state.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the page's reader is one init script (it runs in the page and can import nothing), read in the order the page is walked.
import type { CDPSession, Page } from "playwright-core";

/**
 * The properties read. The proof's set (colour, background, border, font,
 * padding, margin, gap, radius, shadow, transition, animation, transform,
 * opacity, will-change, contain, clip-path) and the box's (display,
 * position, inset, size, flex and grid, overflow, z-index, cursor,
 * pointer-events, outline, text decoration, white-space, letter-spacing),
 * as longhands: a shorthand reads empty when its longhands differ.
 */
export const PROPS = [
  "color",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "background-clip",
  "background-origin",
  "background-attachment",
  "background-blend-mode",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-image-source",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant-numeric",
  "font-variant-ligatures",
  "font-variant-caps",
  "font-feature-settings",
  "font-variation-settings",
  "font-optical-sizing",
  "font-kerning",
  "font-synthesis",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-align",
  "text-indent",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
  "text-underline-offset",
  "text-shadow",
  "text-overflow",
  "text-wrap-mode",
  "text-wrap-style",
  "white-space-collapse",
  "overflow-wrap",
  "word-break",
  "hyphens",
  "text-box-trim",
  "text-box-edge",
  "-webkit-line-clamp",
  "-webkit-box-orient",
  "-webkit-text-fill-color",
  "vertical-align",
  "list-style-type",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "row-gap",
  "column-gap",
  "box-shadow",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "transition-behavior",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
  "animation-timeline",
  "animation-range-start",
  "animation-range-end",
  "transform",
  "transform-origin",
  "translate",
  "rotate",
  "scale",
  "opacity",
  "visibility",
  "will-change",
  "contain",
  "content-visibility",
  "clip-path",
  "mask-image",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "isolation",
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "box-sizing",
  "aspect-ratio",
  "float",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "align-items",
  "align-self",
  "align-content",
  "justify-content",
  "justify-items",
  "justify-self",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "overflow-x",
  "overflow-y",
  "overflow-clip-margin",
  "z-index",
  "cursor",
  "pointer-events",
  "user-select",
  "touch-action",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "container-type",
  "container-name",
  "scrollbar-width",
  "scrollbar-gutter",
  "scrollbar-color",
  "overscroll-behavior-x",
  "overscroll-behavior-y",
  "scroll-snap-type",
  "scroll-snap-align",
  "scroll-padding-top",
  "scroll-padding-bottom",
  "caret-color",
  "accent-color",
  "color-scheme",
  "anchor-name",
  "position-anchor",
  "view-transition-name",
  "content",
] as const;

/** One element as read: its place, its look (`sig`, an index into the read's signatures) and its box. */
export interface Node {
  /** Its `::after`'s look, when it draws one. */
  after?: number;
  /** Its `::before`'s look, when it draws one. */
  before?: number;
  /** Where it spills, or stands outside what holds it (`spill-x`, `clip-y`, `viewport-x`, …), comma-joined. */
  flags?: string;
  /** Under `:focus-visible`: what changes on it and inside it, by node index, prop index → value. */
  focus?: Record<number, Record<number, string>>;
  /** Under `:hover`, the same. */
  hover?: Record<number, Record<number, string>>;
  /** Its `data-slot`, a label only. */
  label?: string;
  parent: number;
  /** x, y, width, height to 0.5px. */
  rect: [number, number, number, number];
  sig: number;
  /** `tag:n`, n its place among its siblings of that tag, from 1. */
  step: string;
}

export interface Read {
  /** Interactive elements read under forced states. */
  forced: number;
  nodes: Node[];
  /** Each distinct look: its values in `PROPS` order, joined by `\u0001`. */
  sigs: string[];
}

/** The page's half of the reader, installed in the page by `installReader`. */
interface PageReader {
  delta: (i: number) => {
    nodes: Record<number, Record<number, string>>;
  };
  done: () => void;
  read: (root: string) => {
    count: number;
    /** Each interactive element's index in `nodes`. */
    interactive: number[];
    nodes: Node[];
    sigs: string[];
  } | null;
  /** The root's box, css px: a capture's clip. */
  root: (
    selector: string
  ) => { height: number; width: number; x: number; y: number } | null;
  still: () => number;
}

declare global {
  interface Window {
    __ssInteractive?: Element[];
    __ssReader?: PageReader;
  }
}

/** Installs `window.__ssReader` (an init script; it runs in the page, so it is self-contained). */
export function installReader(props: readonly string[]): void {
  const ROUND = (v: number) => Math.round(v * 2) / 2;
  const SKIP = new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "TEMPLATE",
    "NOSCRIPT",
    "TITLE",
    "BASE",
  ]);
  const INTERACTIVE =
    "button, a, input, textarea, select, [role=button], [role=tab], [role=menuitem], [role=option], [tabindex]";
  const SCROLLS = new Set(["auto", "scroll"]);
  const CLIPS = new Set(["hidden", "clip"]);
  let elements: Element[] = [];
  let base: string[][] = [];
  let basePseudo: { after?: string[]; before?: string[] }[] = [];
  /** Each node's box at rest, as `x y w h`: a forced state that moves the element says so. */
  let rects: string[] = [];

  /** What a selector names as a surface's root: its largest visible match (an open layer over its own trigger), else its first. */
  const rootOf = (selector: string): Element | null => {
    const all = [...document.querySelectorAll(selector)];
    const shown = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const pool = shown.length > 0 ? shown : all;
    let best: Element | null = null;
    let most = -1;
    for (const el of pool) {
      const n = el.getElementsByTagName("*").length;
      if (n > most) {
        best = el;
        most = n;
      }
    }
    return best;
  };

  /** Every animation of the document and its open shadow roots: finished, or an infinite one held at its start. */
  const still = (): number => {
    const walk = (root: Document | ShadowRoot): Animation[] => {
      const out = [...root.getAnimations()];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const shadow = (n as Element).shadowRoot;
        if (shadow) {
          out.push(...walk(shadow));
        }
      }
      return out;
    };
    let held = 0;
    for (const run of walk(document)) {
      try {
        const end = run.effect?.getComputedTiming().endTime;
        if (!(run.timeline instanceof DocumentTimeline)) {
          continue;
        }
        if (typeof end === "number" && Number.isFinite(end)) {
          if (run.playState !== "finished") {
            run.finish();
            held += 1;
          }
        } else if (run.playState !== "paused" || run.currentTime !== 0) {
          run.pause();
          run.currentTime = 0;
          held += 1;
        }
      } catch {
        // a run that cannot be held (no effect, a timeline gone) is left as it is
      }
    }
    return held;
  };

  // A value that names this page's own origin (its port is the run's) or a
  // blob the page made (its id is fresh on every load) reads without them.
  const ORIGIN = location.origin;
  const BLOB = /blob:[^)"'\s]+/g;
  const plain = (v: string) =>
    v.includes("blob:") || v.includes(ORIGIN)
      ? v.replace(BLOB, "blob:").replaceAll(ORIGIN, "")
      : v;
  const values = (el: Element, pseudo?: string): string[] => {
    const s = getComputedStyle(el, pseudo);
    return props.map((p) => plain(s.getPropertyValue(p)));
  };
  const drawsPseudo = (el: Element, pseudo: string): boolean => {
    const c = getComputedStyle(el, pseudo).content;
    return c !== "none" && c !== "normal" && c !== "";
  };

  /** Where `el` spills, or stands outside what holds it on each axis. */
  const flagsOf = (el: Element, r: DOMRect): string => {
    const out: string[] = [];
    const s = getComputedStyle(el);
    if (
      s.overflowX === "visible" &&
      el.scrollWidth > el.clientWidth + 1 &&
      el.clientWidth > 0
    ) {
      out.push("spill-x");
    }
    if (
      s.overflowY === "visible" &&
      el.scrollHeight > el.clientHeight + 1 &&
      el.clientHeight > 0
    ) {
      out.push("spill-y");
    }
    if (r.width === 0 && r.height === 0) {
      return out.join(",");
    }
    const fixed = s.position === "fixed";
    const doc = document.scrollingElement ?? document.documentElement;
    for (const axis of ["x", "y"] as const) {
      const lo = axis === "x" ? r.left : r.top;
      const hi = axis === "x" ? r.right : r.bottom;
      let holder: Element | null = null;
      let how = "";
      for (
        let up = fixed ? null : el.parentElement;
        up && up !== doc && up !== document.body;
        up = up.parentElement
      ) {
        const o =
          axis === "x"
            ? getComputedStyle(up).overflowX
            : getComputedStyle(up).overflowY;
        if (o !== "visible") {
          holder = up;
          how = o;
          break;
        }
      }
      if (holder) {
        // Content a scroller scrolls may stand outside its box; content clipped may not.
        if (CLIPS.has(how)) {
          const h = holder.getBoundingClientRect();
          const hlo = axis === "x" ? h.left : h.top;
          const hhi = axis === "x" ? h.right : h.bottom;
          if (lo < hlo - 0.5 || hi > hhi + 0.5) {
            out.push(`clip-${axis}`);
          }
        } else if (!SCROLLS.has(how)) {
          out.push(`holder-${axis}`);
        }
        continue;
      }
      // Held by the viewport: outside it only where the document scrolls that way.
      const extent = axis === "x" ? innerWidth : innerHeight;
      const scrolls =
        axis === "x"
          ? doc.scrollWidth > doc.clientWidth
          : doc.scrollHeight > doc.clientHeight;
      if ((lo < -0.5 || hi > extent + 0.5) && (fixed || !scrolls)) {
        out.push(`viewport-${axis}`);
      }
    }
    return out.join(",");
  };

  const reader: PageReader = {
    root: (selector) => {
      const el = rootOf(selector);
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    still,
    done: () => {
      elements = [];
      base = [];
      basePseudo = [];
      window.__ssInteractive = undefined;
    },
    read: (rootSelector) => {
      const root = rootOf(rootSelector);
      if (!root) {
        return null;
      }
      elements = [];
      base = [];
      basePseudo = [];
      const sigIndex = new Map<string, number>();
      const sigs: string[] = [];
      const sigOf = (vals: string[]) => {
        const key = vals.join("\u0001");
        let i = sigIndex.get(key);
        if (i === undefined) {
          i = sigs.length;
          sigs.push(key);
          sigIndex.set(key, i);
        }
        return i;
      };
      const nodes: Node[] = [];
      const interactive: Element[] = [];
      const interactiveAt: number[] = [];
      const visit = (el: Element, parent: number, step: string) => {
        const index = nodes.length;
        const vals = values(el);
        const r = el.getBoundingClientRect();
        const node: Node = {
          parent,
          step,
          sig: sigOf(vals),
          rect: [ROUND(r.x), ROUND(r.y), ROUND(r.width), ROUND(r.height)],
        };
        const slot = el.getAttribute("data-slot");
        if (slot) {
          node.label = slot;
        }
        const flags = flagsOf(el, r);
        if (flags) {
          node.flags = flags;
        }
        const pseudo: { after?: string[]; before?: string[] } = {};
        for (const which of ["before", "after"] as const) {
          if (drawsPseudo(el, `::${which}`)) {
            const pv = values(el, `::${which}`);
            pseudo[which] = pv;
            node[which] = sigOf(pv);
          }
        }
        nodes.push(node);
        elements.push(el);
        base.push(vals);
        basePseudo.push(pseudo);
        if (el.matches(INTERACTIVE)) {
          interactive.push(el);
          interactiveAt.push(index);
        }
        const counts = new Map<string, number>();
        const kids = [
          ...el.children,
          ...(el.shadowRoot ? [...el.shadowRoot.children] : []),
        ];
        for (const kid of kids) {
          if (SKIP.has(kid.tagName)) {
            continue;
          }
          const tag = kid.tagName.toLowerCase();
          const n = (counts.get(tag) ?? 0) + 1;
          counts.set(tag, n);
          const inShadow = kid.parentNode instanceof ShadowRoot;
          visit(kid, index, `${inShadow ? "#shadow>" : ""}${tag}:${n}`);
        }
      };
      visit(root, -1, root.tagName.toLowerCase());
      window.__ssInteractive = interactive;
      rects = nodes.map((n) => n.rect.join(" "));
      return { count: nodes.length, interactive: interactiveAt, nodes, sigs };
    },
    delta: (i) => {
      const el = window.__ssInteractive?.[i];
      const out: Record<number, Record<number, string>> = {};
      if (!el) {
        return { nodes: out };
      }
      // The forced state's own transitions start at this flush: finished before reading.
      el.getBoundingClientRect();
      still();
      const start = elements.indexOf(el);
      for (let k = start; k >= 0 && k < elements.length; k += 1) {
        const at = elements[k] as Element;
        if (
          k > start &&
          !el.contains(at) &&
          !(el.shadowRoot?.contains(at) ?? false)
        ) {
          break;
        }
        const now = values(at);
        const was = base[k] as string[];
        const changed: Record<number, string> = {};
        now.forEach((v, p) => {
          if (v !== was[p]) {
            changed[p] = v;
          }
        });
        for (const which of ["before", "after"] as const) {
          const wasP = basePseudo[k]?.[which];
          const draws = drawsPseudo(at, `::${which}`);
          if (!(wasP || draws)) {
            continue;
          }
          const nowP = draws ? values(at, `::${which}`) : null;
          if (!nowP) {
            changed[-1] = `${which}:none`;
            continue;
          }
          nowP.forEach((v, p) => {
            if (!wasP || v !== wasP[p]) {
              changed[(which === "before" ? 1000 : 2000) + p] = v;
            }
          });
        }
        if (k === start) {
          const r = at.getBoundingClientRect();
          const rect = [
            ROUND(r.x),
            ROUND(r.y),
            ROUND(r.width),
            ROUND(r.height),
          ].join(" ");
          if (rects[k] !== undefined && rects[k] !== rect) {
            changed[-2] = rect;
          }
        }
        if (Object.keys(changed).length > 0) {
          out[k] = changed;
        }
      }
      return { nodes: out };
    },
  };
  window.__ssReader = reader;
}

/** Two frames at 60 Hz, in real time. */
const TWO_FRAMES_MS = 34;

/** Holds every animation still until two frames pass with nothing left to hold (at most 8 rounds). */
export async function holdStill(page: Page): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each round reads what the last one left
    const held = await page.evaluate(() => window.__ssReader?.still() ?? 0);
    // Two of the browser's own frames, in real time: the page's
    // requestAnimationFrame is the walk's paused clock's (walk.ts passPage),
    // and fires only when the walk runs it on.
    await page.waitForTimeout(TWO_FRAMES_MS);
    if (held === 0) {
      return;
    }
  }
}

/**
 * Reads the surface under `root` on `page`: every element, then every
 * interactive one again under `:hover` and under `:focus-visible`.
 */
export async function readSurface(
  page: Page,
  cdp: CDPSession,
  root: string
): Promise<Read | null> {
  await holdStill(page);
  const read = await page.evaluate(
    (r) => window.__ssReader?.read(r) ?? null,
    root
  );
  if (!read) {
    return null;
  }
  // The interactive elements' DOM node ids, for forcing their states.
  await cdp.send("DOM.getDocument", { depth: 0 });
  const list = await cdp.send("Runtime.evaluate", {
    expression: "window.__ssInteractive",
    returnByValue: false,
  });
  const { objectId } = list.result;
  const ids: number[] = [];
  if (objectId) {
    const props = await cdp.send("Runtime.getProperties", {
      objectId,
      ownProperties: true,
    });
    const items = props.result
      .filter((p) => INDEX.test(p.name) && p.value?.objectId)
      .sort((a, b) => Number(a.name) - Number(b.name));
    const nodes = await Promise.all(
      items.map((p) =>
        cdp.send("DOM.requestNode", { objectId: p.value?.objectId as string })
      )
    );
    ids.push(...nodes.map((n) => n.nodeId));
  }
  for (const [i, nodeId] of ids.entries()) {
    const owner = read.nodes[read.interactive[i] as number];
    for (const [state, pseudo] of FORCED) {
      // biome-ignore lint/performance/noAwaitInLoops: one element and one state at a time: a forced state is the page's one state
      await cdp
        .send("CSS.forcePseudoState", {
          nodeId,
          forcedPseudoClasses: [...pseudo],
        })
        .catch(() => undefined);
      const delta = await page.evaluate((k) => window.__ssReader?.delta(k), i);
      await cdp
        .send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
        .catch(() => undefined);
      if (owner && delta && Object.keys(delta.nodes).length > 0) {
        owner[state] = delta.nodes;
      }
    }
  }
  await holdStill(page);
  await page.evaluate(() => window.__ssReader?.done());
  return { nodes: read.nodes, sigs: read.sigs, forced: ids.length };
}

/** An array's own index, among `Runtime.getProperties`' names. */
const INDEX = /^\d+$/;

/** The states read again on every interactive element, as CDP forces them. */
const FORCED = [
  ["hover", ["hover"]],
  ["focus", ["focus", "focus-visible"]],
] as const;
