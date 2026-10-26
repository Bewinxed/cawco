/**
 * The house rules every preview and live UI spec holds a rendered state to,
 * read from the engine at the state the spec put the page in, the same way
 * in every spec. Screenshot review is left with what a person must judge.
 *
 *   const house = new HouseRules(kit, engine, { scope: ".frame" });
 *   await house.at(page, "state name");   // after the spec's own settle
 *   house.report();                       // one PASS/FAIL line per rule
 *
 * `houseRules(page, opts)` is the one read under the ledger: it runs the
 * overflow sweep (journeys/scan.ts), `impeccable detect --json --cdp` on the
 * page as it stands (Chromium: the kit's own browser, by its DevTools port),
 * and the house checks impeccable has no rule for. Each finding names the
 * element (selector and accessible name), the rule and what it measured.
 *
 * | rule        | read by                     | what it reads |
 * | ----------- | --------------------------- | ------------- |
 * | overflow    | scan.ts + impeccable `text-occlusion` | boxes past the screen, out of their control or box, a control out of its row, card or panel, text under a control or an opaque box |
 * | coral       | own code                    | each view's controls and grounded chips whose fill, border or (a control's) ink resolves to a coral token from tokens.css; at most one; a checked checkbox, switch or radio, and an identity tile on its mark hue, are allowed and named |
 * | glyph       | own code                    | a control whose only content is a glyph: no fill, border or shadow on it or on a wrapper that holds it alone; its svg holds no solid disc, tile or rounded shape spanning 70% of its viewBox |
 * | bar-ground  | own code                    | bars (`header`, toolbars, the bar data-slots, foot bars) paint no fill, border or shadow; a folder-tab shelf (DESIGN.md:665) and a group's capsule (DESIGN.md:666) are named, not failed |
 * | head        | own code                    | a bar's title and controls share one row (centres within 4px), no second line in the bar (a popover, menu or dialog it opens is no part of it), the title not repeated by the first heading under it |
 * | back-close  | own code                    | no control's words say Back or Close (DESIGN.md:668) |
 * | hidden-cue  | own code + ink              | a scroller cut at an edge carries a computed mask there that draws (the edge's pixels with and without it), or an item peeking 16px or more |
 * | contrast    | own code + impeccable `low-contrast` | every text run against the ground under it, 4.5:1 (3:1 at 24px); the lowest is reported |
 * | settled     | own code                    | no finite animation running, fonts loaded (`settle(page)` gets a page there) |
 * | made-up     | own code                    | no fixture or probe words (`PROBE-`, `/tmp/`, `Lorem` …), a lone "Body", text outside the spec's `allowedText` source |
 *
 * Every other impeccable finding in the scope is printed as a NOTE: its
 * rules are taste the house has not made a rule of.
 */
// biome-ignore-all lint/performance/useTopLevelRegex: the reads run serialized into the page (`page.evaluate`), so each regex lives inside its function
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { userLayerPath } from "../../packages/core/src/paths";
import { capture, type Raster } from "./ink";
import { scan } from "./journeys/scan";
import { devtoolsPort, type Kit, settle as kitSettle, ROOT } from "./kit";

export type HouseRule =
  | "overflow"
  | "coral"
  | "glyph"
  | "bar-ground"
  | "head"
  | "back-close"
  | "hidden-cue"
  | "contrast"
  | "settled"
  | "made-up";

/** Each rule, what it holds, and who reads it: the report's words. */
export const HOUSE_RULES: Record<HouseRule, { says: string; by: string }> = {
  overflow: {
    says: "nothing spills, clips or overlaps",
    by: "scan.ts + impeccable text-occlusion",
  },
  coral: { says: "one coral per view", by: "own code" },
  glyph: { says: "a lone glyph sits on nothing", by: "own code" },
  "bar-ground": { says: "bars have no ground", by: "own code" },
  head: {
    says: "a bar's title and controls share one row, one line, not repeated",
    by: "own code",
  },
  "back-close": { says: "Back and Close are glyphs", by: "own code" },
  "hidden-cue": {
    says: "hidden content has a fade that draws, or a peek of 16px",
    by: "own code + ink",
  },
  contrast: {
    says: "text holds 4.5:1 (3:1 at 24px)",
    by: "own code + impeccable low-contrast",
  },
  settled: { says: "no finite motion running, fonts ready", by: "own code" },
  "made-up": { says: "nothing made up", by: "own code" },
};

const RULES = Object.keys(HOUSE_RULES) as HouseRule[];

/** One element-level exemption: findings of `rule` on what `selector` matches, whose words hold `text`; either alone, or both together. */
export interface HouseExcept {
  reason: string;
  rule: HouseRule;
  selector?: string;
  text?: string;
}

export interface HouseOptions {
  /** Text slots that must hold one of `texts` (his starters, his records): `source` names where they come from. */
  allowedText?: {
    selector: string;
    source: string;
    texts: readonly string[];
  }[];
  /** Findings excused one by one, each with its reason. */
  except?: HouseExcept[];
  /** Whole rules not read here, each with its reason (printed). */
  exempt?: Partial<Record<HouseRule, string>>;
  /** Standalone marks (a status glyph outside any control) held to the glyph rule's svg test too. */
  marks?: string;
  /**
   * Why impeccable does not run on this spec's reads, when it must not
   * (printed): the kit's own reads still run.
   */
  noImpeccable?: string;
  /** The surface the rules read: the product, not a preview's own chrome. Default `body`. */
  scope?: string;
  /** Each match is one view for the coral count. Default: the scope. */
  views?: string;
}

export interface HouseFinding {
  element: string;
  measured: string;
  rule: HouseRule;
}

export interface HouseRead {
  /** Findings excused by `except`, each with its reason. */
  excused: (HouseFinding & { reason: string })[];
  findings: HouseFinding[];
  /** What impeccable said: its run, or why it did not run. */
  impeccable: { ran: boolean; said: string };
  /** The lowest text contrast read, with its element. */
  lowest: { element: string; ratio: number } | null;
  /** What the rules met and name without failing (a checked checkbox's coral, a shelf, a capsule). */
  named: string[];
  /** Impeccable findings outside the house rules, in the scope. */
  others: string[];
  /** What a rule could not read, by rule, with why. */
  unread: string[];
}

/** The coral tokens, by name: fills, edges and inks DESIGN.md spends only on the act. */
const CORAL_TOKENS = [
  "coral-3",
  "coral-5",
  "coral-9",
  "coral-10",
  "coral-11",
  "brand-solid",
  "brand-hover",
  "brand-ink",
  "brand-ink-strong",
  "brand-wash",
  "link-ink",
  "action-solid",
  "action-hover",
  "chip-chosen-bg",
  "selected-bg",
  "selected-ink",
  "selected-icon",
];

/** tokens.css's own values, each `var()` written out, for a page whose stylesheet names none of them. */
const TOKEN_VALUES = (() => {
  const css = readFileSync(
    join(ROOT, "apps", "dashboard", "src", "lib", "tokens", "tokens.css"),
    "utf8"
  );
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/--([\w-]+):\s*([^;]+);/gu)) {
    const [, name, value] = m;
    if (name && value && !raw.has(name)) {
      raw.set(name, value.replace(/\s+/gu, " ").trim());
    }
  }
  const out = (value: string, depth = 0): string =>
    depth > 8
      ? value
      : value.replace(/var\(--([\w-]+)\)/gu, (whole, name: string) => {
          const known = raw.get(name);
          return known ? out(known, depth + 1) : whole;
        });
  return (names: string[]) =>
    names.map((name) => ({ name, value: out(raw.get(name) ?? "transparent") }));
})();

/** The impeccable launcher: `$IMPECCABLE`, else the impeccable skill's in the user layer. */
function impeccableBin(): string | null {
  const bin =
    process.env.IMPECCABLE ??
    userLayerPath("skills", "impeccable", "scripts", "impeccable");
  return existsSync(bin) ? bin : null;
}

/**
 * A page ready for a reading: its fonts in, then the kit's still clock
 * (kit.ts `settle`: every one-shot run landed, every loop paused at its
 * start).
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await kitSettle(page);
}

interface InPageArgs {
  allowedText: { selector: string; source: string; texts: readonly string[] }[];
  /** Coral spends a spec excuses, each with its reason: dropped from the count, not from the report. */
  coralExcept: { reason: string; selector: string }[];
  corals: { name: string; value: string }[];
  exempt: string[];
  marks: string | null;
  scope: string;
  shelf: { name: string; value: string };
  views: string | null;
}

interface InPageRead {
  edges: {
    band: { height: number; width: number; x: number; y: number };
    element: string;
    holder: number;
    side: "top" | "bottom" | "left" | "right";
  }[];
  findings: (HouseFinding & { at: number })[];
  lowest: { element: string; ratio: number } | null;
  named: string[];
  unread: string[];
}

/**
 * The house checks impeccable has no rule for, read in the page. One
 * function serialized into the page, everything it uses inside it. Each
 * finding keeps the index of its element (`at`, in `window.__houseEls`) so
 * an exemption can be matched against the element itself.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
function houseRead(args: InPageArgs): InPageRead {
  const scope = document.querySelector(args.scope) ?? document.body;
  const skip = new Set(args.exempt);
  const findings: (HouseFinding & { at: number })[] = [];
  const named: string[] = [];
  const unread: string[] = [];
  const els: Element[] = [];
  (window as unknown as { __houseEls: Element[] }).__houseEls = els;
  const keep = (el: Element) => {
    els.push(el);
    return els.length - 1;
  };

  // ---- reading helpers ----
  const styleOf = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let s = styleOf.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styleOf.set(el, s);
    }
    return s;
  };
  const shown = (el: Element): boolean => {
    for (let up: Element | null = el; up; up = up.parentElement) {
      const s = style(up);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.visibility === "collapse" ||
        Number(s.opacity) === 0 ||
        s.contentVisibility === "hidden"
      ) {
        return false;
      }
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const words = (text: string) => {
    const one = text.replace(/\s+/gu, " ").trim();
    return one.length > 48 ? `${one.slice(0, 45)}…` : one;
  };
  const HASH = /^(svelte-|s-)[\w-]{5,}$/u;
  const selectorOf = (el: Element): string => {
    const part = (e: Element) => {
      const slot = e.getAttribute("data-slot");
      const cls = [...e.classList].filter((c) => !HASH.test(c)).slice(0, 2);
      return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${slot ? `[data-slot=${slot}]` : ""}${cls.length ? `.${cls.join(".")}` : ""}`;
    };
    const up = el.parentElement?.closest("[data-slot], [id]");
    return up && up !== document.body && scope.contains(up) && up !== scope
      ? `${part(up)} ${part(el)}`
      : part(el);
  };
  const nameOf = (el: Element): string => {
    const label = el.getAttribute("aria-label");
    if (label) {
      return words(label);
    }
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const text = by
        .split(/\s+/u)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      if (text.trim()) {
        return words(text);
      }
    }
    return words(
      el.textContent?.trim() ||
        el.getAttribute("title") ||
        el.getAttribute("alt") ||
        ""
    );
  };
  const describe = (el: Element) => {
    const n = nameOf(el);
    return `${selectorOf(el)}${n ? ` “${n}”` : ""}`;
  };
  const say = (rule: HouseRule, el: Element | null, measured: string) => {
    findings.push({
      rule,
      element: el ? describe(el) : "the page",
      measured,
      at: el ? keep(el) : -1,
    });
  };
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;

  // ---- colour ----
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  type Rgba = [number, number, number, number];
  const rgbaCache = new Map<string, Rgba>();
  const rgba = (color: string): Rgba => {
    const known = rgbaCache.get(color);
    if (known) {
      return known;
    }
    let out: Rgba = [0, 0, 0, 0];
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out = [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    }
    rgbaCache.set(color, out);
    return out;
  };
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.040_45 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: Rgba) =>
    0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a: Rgba, b: Rgba) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const over = (top: Rgba, under: Rgba): Rgba => {
    const [, , , a] = top;
    return [
      top[0] * a + under[0] * (1 - a),
      top[1] * a + under[1] * (1 - a),
      top[2] * a + under[2] * (1 - a),
      1,
    ];
  };
  const oklab = (c: Rgba): [number, number, number] => {
    const [r, g, b] = [lin(c[0]), lin(c[1]), lin(c[2])];
    const l = Math.cbrt(
      0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b
    );
    const m = Math.cbrt(
      0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b
    );
    const s = Math.cbrt(
      0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b
    );
    return [
      0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
      1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
      0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
    ];
  };
  const COLOR_FN =
    /(?:rgba?|oklch|oklab|lab|lch|color|hsla?)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b/giu;
  /** The background's layers, top first, split at its top-level commas. */
  const layersOf = (image: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < image.length; i += 1) {
      const c = image[i];
      if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
      } else if (c === "," && depth === 0) {
        out.push(image.slice(start, i));
        start = i + 1;
      }
    }
    out.push(image.slice(start));
    return out.map((one) => one.trim());
  };
  /**
   * The colours a gradient ground shows under text: the top layer's stops,
   * and the next layer's only while every stop above it lets it through (a
   * gradient border drawn as an opaque fill over a conic ring shows the
   * fill alone under the words).
   */
  const stopsOf = (image: string): Rgba[] => {
    if (!image.includes("gradient(")) {
      return [];
    }
    const out: Rgba[] = [];
    for (const layer of layersOf(image)) {
      const stops = [...layer.matchAll(COLOR_FN)].map((m) => rgba(m[0]));
      out.push(...stops);
      if (stops.length > 0 && stops.every((c) => c[3] >= 0.99)) {
        break;
      }
    }
    return out;
  };
  /**
   * Where layer `i` of `el`'s background paints, in the viewport, or null
   * where it fills the box: a layer that repeats on either axis, or a size
   * or place this cannot read as a length or a percentage (cover, contain,
   * auto, a calc()). The box is the padding box, the default origin.
   */
  const layerBox = (
    el: Element,
    s: CSSStyleDeclaration,
    i: number
  ): { left: number; top: number; right: number; bottom: number } | null => {
    const nth = (list: string) => {
      const all = layersOf(list);
      return all[i % all.length] ?? "";
    };
    if (nth(s.backgroundRepeat) !== "no-repeat") {
      return null;
    }
    const r = el.getBoundingClientRect();
    const bl = Number.parseFloat(s.borderLeftWidth) || 0;
    const bt = Number.parseFloat(s.borderTopWidth) || 0;
    const box = {
      left: r.left + bl,
      top: r.top + bt,
      width: r.width - bl - (Number.parseFloat(s.borderRightWidth) || 0),
      height: r.height - bt - (Number.parseFloat(s.borderBottomWidth) || 0),
    };
    const length = (value: string | undefined, whole: number) => {
      if (value === undefined) {
        return null;
      }
      const n = Number.parseFloat(value);
      if (/^-?[\d.]+px$/u.test(value)) {
        return n;
      }
      if (/^-?[\d.]+%$/u.test(value)) {
        return (n / 100) * whole;
      }
      return null;
    };
    const [sw, sh = "auto"] = nth(s.backgroundSize).split(/\s+/u);
    const w = length(sw, box.width);
    const h = sh === "auto" ? box.height : length(sh, box.height);
    if (w === null || h === null) {
      return null;
    }
    // A position's percentage places the layer's point at the box's point.
    const place = (value: string | undefined, whole: number, size: number) => {
      if (value === undefined) {
        return null;
      }
      if (/^-?[\d.]+%$/u.test(value)) {
        return (Number.parseFloat(value) / 100) * (whole - size);
      }
      return length(value, whole);
    };
    const [px0, py0] = nth(s.backgroundPosition).split(/\s+/u);
    const x = place(px0, box.width, w);
    const y = place(py0, box.height, h);
    if (x === null || y === null) {
      return null;
    }
    return {
      left: box.left + x,
      top: box.top + y,
      right: box.left + x + w,
      bottom: box.top + y + h,
    };
  };
  /**
   * The colours a gradient ground shows under these text rects: stopsOf,
   * less each layer sized and placed clear of every rect (the transcript's
   * rail, a 2px line drawn as a background layer down a row's edge, is not
   * the ground under the row's words).
   */
  const stopsUnder = (
    el: Element,
    s: CSSStyleDeclaration,
    rects: DOMRect[]
  ) => {
    const image = s.backgroundImage;
    if (!image.includes("gradient(")) {
      return [];
    }
    const under = layersOf(image).filter((_, i) => {
      const at = layerBox(el, s, i);
      return (
        at === null ||
        rects.some(
          (t) =>
            t.left < at.right &&
            t.right > at.left &&
            t.top < at.bottom &&
            t.bottom > at.top
        )
      );
    });
    return under.length > 0 ? stopsOf(under.join(", ")) : [];
  };
  /** A token's colour as this page resolves it: the page's own, else tokens.css's. */
  const tokenColour = (t: { name: string; value: string }): Rgba => {
    const probe = document.createElement("i");
    probe.style.cssText = `position:absolute;color:var(--${t.name}, ${t.value})`;
    scope.append(probe);
    const c = rgba(getComputedStyle(probe).color);
    probe.remove();
    return c;
  };
  const corals = args.corals
    .map((t) => ({ name: t.name, c: tokenColour(t) }))
    .filter((t) => t.c[3] > 0);
  const coralOf = (c: Rgba): string | null => {
    if (c[3] < 0.15) {
      return null;
    }
    const a = oklab(c);
    // A neutral is never coral, however near a pale wash it stands.
    if (Math.hypot(a[1], a[2]) < 0.02) {
      return null;
    }
    // The token's hue and chroma, its lightness within 0.04 (the action
    // surface's gradient stops stand ±0.03 off action-solid).
    for (const t of corals) {
      const b = oklab(t.c);
      if (
        Math.abs(a[0] - b[0]) <= 0.04 &&
        Math.hypot(a[1] - b[1], a[2] - b[2]) <= 0.015
      ) {
        return t.name;
      }
    }
    return null;
  };
  const shelf = tokenColour(args.shelf);
  const fill = (s: CSSStyleDeclaration) => rgba(s.backgroundColor);
  const edges = (s: CSSStyleDeclaration) =>
    (["top", "right", "bottom", "left"] as const)
      .filter(
        (side) =>
          Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
          s.getPropertyValue(`border-${side}-style`) !== "none" &&
          rgba(s.getPropertyValue(`border-${side}-color`))[3] > 0.02
      )
      .map(
        (side) =>
          `border-${side} ${s.getPropertyValue(`border-${side}-width`)} ${s.getPropertyValue(`border-${side}-color`)}`
      );
  /** What a box paints of its own at rest: its fill, edges, shadow; empty when nothing. */
  const paints = (el: Element): string[] => {
    const s = style(el);
    const out: string[] = [];
    if (fill(s)[3] > 0.02) {
      out.push(`background ${s.backgroundColor}`);
    }
    // A gradient whose every stop is clear (a kit button's hover sheen at
    // rest) draws nothing.
    const image = s.backgroundImage;
    if (
      image !== "none" &&
      (image.includes("url(") ||
        [...image.matchAll(COLOR_FN)].some((m) => rgba(m[0])[3] > 0.02))
    ) {
      out.push(`background-image ${image.slice(0, 60)}`);
    }
    out.push(...edges(s));
    if (s.boxShadow !== "none") {
      out.push(`box-shadow ${s.boxShadow.slice(0, 60)}`);
    }
    return out;
  };

  const CONTROL =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="slider"]';
  const inScope = (el: Element) => scope.contains(el);
  const controls = [...scope.querySelectorAll(CONTROL)].filter(
    (el) => shown(el) && !el.closest("svg")
  );
  /** The text runs drawn inside `root`, each with its parent element. */
  const textsIn = (root: Element) => {
    const out: { node: Text; parent: Element; rects: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const node = n as Text;
      const parent = node.parentElement;
      if (
        !(parent && node.data.trim()) ||
        parent.closest("script, style, noscript, template, svg") ||
        !shown(parent)
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter(
        (r) => r.width > 1 && r.height > 1
      );
      if (rects.length > 0) {
        out.push({ node, parent, rects });
      }
    }
    return out;
  };
  const texts = textsIn(scope);
  const visibleWords = (el: Element) =>
    texts
      .filter((t) => el.contains(t.node))
      .map((t) => t.node.data)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();

  // ---- 2. one coral per view ----
  if (!skip.has("coral")) {
    // Coral DESIGN.md:596 spends beside the act: checked controls, the
    // selected nav row and the chosen option, each said by its state.
    const sanctioned = (el: Element) =>
      Boolean(
        el.closest(
          '[role="checkbox"][aria-checked="true"], [role="switch"][aria-checked="true"], [role="radio"][aria-checked="true"], input:checked, [aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"]'
        ) ||
        el.closest("label")?.querySelector("input:checked") ||
        el.querySelector('input:checked, [aria-checked="true"]')
      );
    const views = args.views
      ? [...scope.querySelectorAll(args.views)].filter(shown)
      : [scope];
    for (const view of views) {
      const spends: { el: Element; what: string }[] = [];
      for (const el of view.querySelectorAll("*")) {
        if (el.closest("svg") || !shown(el)) {
          continue;
        }
        const s = style(el);
        const isControl = el.matches(CONTROL);
        const grounded = paints(el).length > 0;
        const bg = coralOf(fill(s));
        const stop = stopsOf(s.backgroundImage)
          .map(coralOf)
          .find((one) => one);
        const edge = (["top", "right", "bottom", "left"] as const)
          .map((side) =>
            Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0
              ? coralOf(rgba(s.getPropertyValue(`border-${side}-color`)))
              : null
          )
          .find((one) => one);
        const ink = coralOf(rgba(s.color));
        const hasWords = visibleWords(el).length > 0;
        let what: string | null = null;
        if (bg) {
          what = `fill ${bg}`;
        } else if (stop) {
          what = `gradient ${stop}`;
        } else if (edge) {
          what = `edge ${edge}`;
        } else if (ink && (grounded || (isControl && el.tagName !== "A"))) {
          what = `ink ${ink}`;
        }
        // A control, or a chip: a ground of its own holding words. A
        // coral mark with no words (the logo, a caret, a progress bar) is
        // brand-solid's own job (DESIGN.md:553); a coral word with no
        // ground, a link among them, is link ink (DESIGN.md:554).
        if (!(what && (isControl || (grounded && hasWords)))) {
          continue;
        }
        if (spends.some((one) => one.el.contains(el))) {
          continue;
        }
        // An identity tile stands on its mark hue (DESIGN.md, Identity marks
        // and tiles: "in a `mark-N` colour"), and a parent's count on it is
        // on the flat hue: who it is, not an act, whatever hue it was given.
        if (el.closest("[data-tree-mark]")) {
          named.push(
            `an identity tile on its mark hue, not the act (DESIGN.md, Identity marks and tiles): ${describe(el)} (${what})`
          );
          continue;
        }
        const excuse = args.coralExcept.find((one) => el.closest(one.selector));
        if (excuse) {
          named.push(
            `coral excused on ${describe(el)} (${what}): ${excuse.reason}`
          );
          continue;
        }
        if (sanctioned(el)) {
          named.push(
            `coral on a checked, selected or chosen control (DESIGN.md:596): ${describe(el)} (${what})`
          );
          continue;
        }
        spends.push({ el, what });
      }
      if (spends.length > 1) {
        say(
          "coral",
          spends[1]?.el ?? view,
          `${spends.length} corals in ${selectorOf(view)}: ${spends
            .map((one) => `${describe(one.el)} (${one.what})`)
            .join("; ")}`
        );
      }
    }
  }

  // ---- 3. a lone glyph sits on nothing ----
  /** A solid disc, tile or rounded shape behind a glyph: spans 70% of the viewBox each way, solid at its rim. */
  const discs = (svg: SVGSVGElement): string[] => {
    const vb = svg.viewBox?.baseVal;
    const box =
      vb && vb.width > 0
        ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height }
        : (() => {
            const r = svg.getBoundingClientRect();
            return { x: 0, y: 0, w: r.width, h: r.height };
          })();
    const shapes = [
      ...svg.querySelectorAll<SVGGeometryElement>(
        "circle, ellipse, rect, path, polygon"
      ),
    ].filter(
      (shape) =>
        !shape.closest("defs, mask, clipPath, pattern, symbol") &&
        getComputedStyle(shape).display !== "none"
    );
    const out: string[] = [];
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one shape read whole, serialized into the page
    shapes.forEach((shape, i) => {
      let b: DOMRect;
      try {
        b = shape.getBBox();
      } catch {
        return;
      }
      const sx = b.width / box.w;
      const sy = b.height / box.h;
      if (sx < 0.7 || sy < 0.7) {
        return;
      }
      const cs = getComputedStyle(shape);
      if (cs.fill === "none" || Number(cs.fillOpacity) === 0) {
        return;
      }
      // A regular enclosure, a disc or a tile: 16 points on an ellipse at
      // 90% of the box's half-sizes all fall in its fill (a glyph's strokes
      // leave its rim open), and its four corners agree, all out (a disc)
      // or all in (a tile); a bubble's tail or a folder's tab stands in
      // one corner only, the glyph's own shape, not a ground behind it.
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      let solid = true;
      for (let k = 0; k < 16 && solid; k += 1) {
        const t = (k / 16) * Math.PI * 2;
        const p = new DOMPoint(
          cx + Math.cos(t) * b.width * 0.45,
          cy + Math.sin(t) * b.height * 0.45
        );
        solid = shape.isPointInFill(p);
      }
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([dx, dy]) =>
        shape.isPointInFill(
          new DOMPoint(
            cx + (dx as number) * b.width * 0.47,
            cy + (dy as number) * b.height * 0.47
          )
        )
      );
      const regular = corners.every(Boolean) || !corners.some(Boolean);
      // Behind the glyph: every shape drawn after it stands inside it.
      const later = shapes.slice(i + 1).map((one) => {
        try {
          return one.getBBox();
        } catch {
          return null;
        }
      });
      const holds = later.every(
        (r) =>
          r !== null &&
          r.x >= b.x - 0.5 &&
          r.y >= b.y - 0.5 &&
          r.x + r.width <= b.x + b.width + 0.5 &&
          r.y + r.height <= b.y + b.height + 0.5
      );
      if (!(solid && regular && holds)) {
        return;
      }
      const behind = i < shapes.length - 1;
      out.push(
        `a ${behind ? "" : "lone "}${shape.tagName} ${behind ? "behind the glyph " : ""}spans ${Math.round(sx * 100)}%×${Math.round(sy * 100)}% of its ${box.w}×${box.h} viewBox`
      );
    });
    return out;
  };
  if (!skip.has("glyph")) {
    let hovered = 0;
    for (const control of controls) {
      if (visibleWords(control)) {
        continue;
      }
      const glyphs = [
        ...control.querySelectorAll("svg, img, canvas, [data-slot=bar-symbol]"),
      ].filter((g) => shown(g) && !g.parentElement?.closest("svg"));
      if (glyphs.length === 0) {
        continue;
      }
      if (control.matches(":hover") || control.matches(":focus-visible")) {
        hovered += 1;
        continue;
      }
      // A pressed, open or chosen control's fill is its state (the Press
      // Rule's surface-pressed, a toggle's on step), not a tile; its svg
      // is still read below.
      const stated = control.matches(
        '[aria-pressed="true"], [aria-expanded="true"], [aria-selected="true"], [aria-current]:not([aria-current="false"]), [data-state="on"], [data-state="open"]'
      );
      // A checkbox, radio or switch is its box: no glyph stands on it.
      if (
        control.matches(
          'input, [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]'
        )
      ) {
        continue;
      }
      // DESIGN.md draws these glyph controls on a ground of their own: the
      // composer's Attach (raised, control edge) and Send/Stop (coral), and
      // the view's one prominent act on the coral (The Coral Is Where You Act).
      const composer = control.closest(
        '[data-slot="composer"], [data-slot="cin"]'
      );
      const own = style(control);
      const prominent =
        coralOf(fill(own)) ??
        stopsOf(own.backgroundImage)
          .map(coralOf)
          .find((one) => one);
      if (composer || prominent) {
        named.push(
          `${composer ? "a composer control on the composer's recipe (DESIGN.md:919: Attach raised, Send/Stop coral)" : "the view's prominent act on the coral (DESIGN.md:667)"}: ${describe(control)}`
        );
        continue;
      }
      // The control, and each wrapper that holds it alone (a lone symbol's capsule).
      const ground: string[] = [];
      for (
        let up: Element | null = control;
        up && up !== scope.parentElement;
        up = up.parentElement
      ) {
        if (up !== control) {
          const others = [...up.querySelectorAll(CONTROL)].filter(
            (c) => c !== control && !control.contains(c) && shown(c)
          );
          const ownWords = visibleWords(up).length > 0;
          const otherGlyphs = [...up.querySelectorAll("svg, img")].filter(
            (g) => !control.contains(g) && shown(g)
          );
          if (others.length > 0 || ownWords || otherGlyphs.length > 0) {
            break;
          }
        }
        const p = paints(up);
        if (p.length > 0) {
          const ur = up.getBoundingClientRect();
          const gr = (glyphs[0] as Element).getBoundingClientRect();
          // A row's cell or a card holding the control is the row's, not
          // the glyph's: a tile hugs its glyph (2.5 glyphs across and down).
          if (
            up !== control &&
            (ur.width > gr.width * 2.5 || ur.height > gr.height * 2.5)
          ) {
            break;
          }
          // A floating bar group's glass (DESIGN.md:666, the narrow bar's
          // Caw tab of DESIGN.md:800), one item or several; a capsule in
          // the page's flow is a tile.
          const us = style(up) as CSSStyleDeclaration & {
            webkitBackdropFilter?: string;
          };
          const glass =
            (us.backdropFilter && us.backdropFilter !== "none") ||
            (us.webkitBackdropFilter && us.webkitBackdropFilter !== "none");
          const round =
            glass ||
            Number.parseFloat(us.borderTopLeftRadius) >= ur.height / 2 - 1;
          let floats = false;
          for (
            let f: Element | null = up, n = 0;
            f && n < 4;
            f = f.parentElement, n += 1
          ) {
            if (/fixed|absolute|sticky/u.test(style(f).position)) {
              floats = true;
              break;
            }
          }
          if (round && floats) {
            named.push(
              `a floating group's glass (DESIGN.md:666) round ${describe(control)}: ${up === control ? "itself" : selectorOf(up)}`
            );
            if (up === scope) {
              break;
            }
            continue;
          }
        }
        if (p.length > 0 && !(stated && up === control)) {
          ground.push(
            `${up === control ? "itself" : selectorOf(up)}: ${p.join(", ")}`
          );
        }
        if (up === scope) {
          break;
        }
      }
      const shapes = glyphs
        .filter((g): g is SVGSVGElement => g instanceof SVGSVGElement)
        .flatMap(discs);
      if (ground.length > 0 || shapes.length > 0) {
        say(
          "glyph",
          control,
          [...ground.map((g) => `on a ground (${g})`), ...shapes].join("; ")
        );
      }
    }
    if (args.marks) {
      for (const mark of scope.querySelectorAll(args.marks)) {
        const svgs = [
          ...(mark instanceof SVGSVGElement
            ? [mark]
            : mark.querySelectorAll("svg")),
        ].filter(
          (g): g is SVGSVGElement => g instanceof SVGSVGElement && shown(g)
        );
        for (const svg of svgs) {
          const shapes = discs(svg);
          if (shapes.length > 0) {
            say("glyph", svg, `a standalone mark: ${shapes.join("; ")}`);
          }
        }
      }
    }
    if (hovered > 0) {
      unread.push(
        `glyph: ${hovered} glyph control(s) under the pointer or focus, read at rest only`
      );
    }
  }

  // ---- 4. bars have no ground; 5. heads ----
  const BAR =
    'header, [role="toolbar"], [role="banner"], [data-slot="bar"], [data-slot="view-bar"], [data-slot="page-head"], [data-slot="project-head"], [data-slot="side-head"], [data-slot="sheet-header"], [data-slot="drawer-header"], [data-slot="dialog-header"], [data-slot="foot"], [data-slot="page-foot"], [data-slot="sheet-footer"], [data-slot="drawer-footer"], [data-slot="dialog-footer"]';
  const bars = [...scope.querySelectorAll(BAR)].filter(shown);
  if (!skip.has("bar-ground")) {
    for (const bar of bars) {
      const p = paints(bar);
      if (p.length === 0) {
        continue;
      }
      const s = style(bar);
      const r = bar.getBoundingClientRect();
      const bg = fill(s);
      const holdsTabs = bar.querySelector('[role="tablist"]');
      if (
        holdsTabs &&
        bg[3] > 0.02 &&
        Math.hypot(bg[0] - shelf[0], bg[1] - shelf[1], bg[2] - shelf[2]) < 4
      ) {
        named.push(
          `folder-tab shelf (DESIGN.md:665): ${describe(bar)} on surface-shelf`
        );
        continue;
      }
      const radius = Number.parseFloat(s.borderTopLeftRadius);
      const nested = bar.parentElement?.closest(BAR);
      if (
        (bar.matches('[role="toolbar"]') || nested) &&
        radius >= Math.min(r.height, r.width) / 2 - 1
      ) {
        named.push(`a group's capsule (DESIGN.md:666): ${describe(bar)}`);
        continue;
      }
      if (
        bar.matches('[role="toolbar"]') &&
        /fixed|absolute/u.test(s.position)
      ) {
        named.push(
          `a floating toolbar, a surface of its own: ${describe(bar)}`
        );
        continue;
      }
      say("bar-ground", bar, `paints ${p.join(", ")}`);
    }
  }
  if (!skip.has("head")) {
    const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
    for (const bar of bars) {
      const title = [
        ...bar.querySelectorAll(`${HEADING}, [data-slot$="title"]`),
      ].find(shown);
      if (!title) {
        continue;
      }
      const t = title.getBoundingClientRect();
      const tMid = (t.top + t.bottom) / 2;
      // A layer a bar's control opens (a popover, a menu, a dialog) is over
      // the page, not in the bar's row, wherever its markup stands (a
      // preview's drawing keeps it beside its anchor; the product portals it).
      const LAYER =
        '[data-popover], [data-slot="popover-content"], [role="dialog"], [role="menu"], [role="listbox"]';
      const ofBar = (node: Node): boolean => {
        const el = node instanceof Element ? node : node.parentElement;
        const layer = el?.closest(LAYER);
        return bar.contains(node) && !(layer && bar.contains(layer));
      };
      const inBar = controls.filter(
        (c) => ofBar(c) && !title.contains(c) && !c.contains(title)
      );
      for (const c of inBar) {
        const r = c.getBoundingClientRect();
        const off = Math.abs((r.top + r.bottom) / 2 - tMid);
        if (off > 4) {
          say(
            "head",
            c,
            `off the title's row in ${selectorOf(bar)}: its centre ${px(off)} from the title “${words(title.textContent ?? "")}”'s`
          );
        }
      }
      const second = texts.find(
        (one) =>
          ofBar(one.node) &&
          !title.contains(one.node) &&
          !inBar.some((c) => c.contains(one.node)) &&
          one.rects.some((r) => r.top >= t.bottom - 1)
      );
      if (second) {
        const r = second.rects[0] as DOMRect;
        say(
          "head",
          second.parent,
          `a second line in ${selectorOf(bar)}: “${words(second.node.data)}” at ${px(r.top)}, under the title's foot at ${px(t.bottom)}`
        );
      }
      const want = words(title.textContent ?? "").toLowerCase();
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
      walker.currentNode = bar;
      let next = walker.nextNode() as Element | null;
      while (next && bar.contains(next)) {
        next = walker.nextNode() as Element | null;
      }
      for (; next; next = walker.nextNode() as Element | null) {
        if (next.matches(HEADING) && shown(next)) {
          if (words(next.textContent ?? "").toLowerCase() === want && want) {
            say(
              "head",
              next,
              `repeats the bar's title “${words(title.textContent ?? "")}” as the first heading under ${selectorOf(bar)}`
            );
          }
          break;
        }
      }
    }
  }

  // ---- 6. Back and Close are glyphs ----
  if (!skip.has("back-close")) {
    // The whole of its words: Back, Close, "Back to Board", "← Runs".
    const SAYS =
      /^(?:[←‹<]\s*)?(?:go\s+)?(?:back|close)(?:\s+to\s+.{1,40})?$|^[←‹]\s*\S.{0,40}$/iu;
    for (const c of controls) {
      const said = visibleWords(c);
      if (SAYS.test(said)) {
        say("back-close", c, `its words say “${words(said)}”`);
      }
    }
  }

  // ---- 7. hidden content has a cue ----
  const edgesOut: InPageRead["edges"] = [];
  if (!skip.has("hidden-cue")) {
    const FADE = 40;
    const scrollers = [...scope.querySelectorAll("*")].filter((el) => {
      if (
        el.matches("textarea, input, select, [contenteditable]") ||
        !shown(el)
      ) {
        return false;
      }
      const s = style(el);
      const y =
        /auto|scroll/u.test(s.overflowY) &&
        el.scrollHeight > el.clientHeight + 1;
      const x =
        /auto|scroll/u.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
      return x || y;
    });
    if (
      scope !== document.body &&
      /auto|scroll/u.test(style(scope).overflowY) &&
      scope.scrollHeight > scope.clientHeight + 1
    ) {
      scrollers.unshift(scope);
    }
    const masked = (el: Element) => {
      for (
        let up: Element | null = el, n = 0;
        up && n < 3;
        up = up.parentElement, n += 1
      ) {
        const s = style(up) as CSSStyleDeclaration & {
          webkitMaskImage?: string;
        };
        const mask =
          s.maskImage && s.maskImage !== "none"
            ? s.maskImage
            : s.webkitMaskImage;
        if (mask && mask !== "none") {
          return up;
        }
      }
      return null;
    };
    const itemsOf = (el: Element): Element[] => {
      let level = [...el.children].filter(shown);
      for (let n = 0; n < 2 && level.length === 1; n += 1) {
        const inner = [...(level[0] as Element).children].filter(shown);
        if (inner.length === 0) {
          break;
        }
        level = inner;
      }
      return level;
    };
    // A box that clips without scrolling (overflow hidden or clip) and
    // hides words past its foot or its end: a list cut off, no way to it.
    // A one-line truncation shows its own cue (an ellipsis, a line clamp).
    const clipped = new Map<Element, { bottom: number; right: number }>();
    for (const el of scope.querySelectorAll("*")) {
      const cs = style(el) as CSSStyleDeclaration & {
        webkitLineClamp?: string;
      };
      const clipsY = /hidden|clip/u.test(cs.overflowY);
      const clipsX = /hidden|clip/u.test(cs.overflowX);
      if (
        !(clipsY || clipsX) ||
        scrollers.includes(el) ||
        cs.textOverflow === "ellipsis" ||
        (cs.webkitLineClamp && cs.webkitLineClamp !== "none") ||
        el.getBoundingClientRect().height < 24 ||
        !shown(el)
      ) {
        continue;
      }
      const er = el.getBoundingClientRect();
      const foot = er.top + el.clientTop + el.clientHeight;
      const end = er.left + el.clientLeft + el.clientWidth;
      let bottom = 0;
      let right = 0;
      for (const t of texts) {
        if (!el.contains(t.node)) {
          continue;
        }
        const ts = style(t.parent);
        if (ts.textOverflow === "ellipsis") {
          continue;
        }
        // Words a box inside this one clips or scrolls are that box's cut.
        let nearest: Element | null = t.parent;
        while (nearest && nearest !== el) {
          const ns = style(nearest);
          if (ns.overflowX !== "visible" || ns.overflowY !== "visible") {
            break;
          }
          nearest = nearest.parentElement;
        }
        if (nearest !== el) {
          continue;
        }
        for (const tr of t.rects) {
          // Half a line or more out of sight: a line box's leading or a
          // descender's room past the edge hides no words.
          if (clipsY && tr.bottom - foot > tr.height / 2) {
            bottom = Math.max(bottom, tr.bottom - foot);
          }
          if (clipsX && tr.right - end > Math.min(tr.width / 2, 16)) {
            right = Math.max(right, tr.right - end);
          }
        }
      }
      if (bottom > 0 || right > 0) {
        clipped.set(el, { bottom, right });
      }
    }
    for (const sc of [...scrollers, ...clipped.keys()]) {
      const s = style(sc);
      const r = sc.getBoundingClientRect();
      const box = {
        top: r.top + sc.clientTop,
        left: r.left + sc.clientLeft,
        bottom: r.top + sc.clientTop + sc.clientHeight,
        right: r.left + sc.clientLeft + sc.clientWidth,
      };
      const cuts: ("top" | "bottom" | "left" | "right")[] = [];
      const cut = clipped.get(sc);
      if (cut?.bottom) {
        cuts.push("bottom");
      }
      if (cut?.right) {
        cuts.push("right");
      }
      if (
        /auto|scroll/u.test(s.overflowY) &&
        sc.scrollHeight > sc.clientHeight + 1
      ) {
        if (sc.scrollTop > 1) {
          cuts.push("top");
        }
        if (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1) {
          cuts.push("bottom");
        }
      }
      if (
        /auto|scroll/u.test(s.overflowX) &&
        sc.scrollWidth > sc.clientWidth + 1
      ) {
        const x = Math.abs(sc.scrollLeft);
        if (x > 1) {
          cuts.push("left");
        }
        if (x + sc.clientWidth < sc.scrollWidth - 1) {
          cuts.push("right");
        }
      }
      for (const side of cuts) {
        // A bar standing over the cut with its own scroll edge effect
        // (DESIGN.md:665: the content blurs and fades under the bar).
        const point = {
          top: [(box.left + box.right) / 2, box.top + 2],
          bottom: [(box.left + box.right) / 2, box.bottom - 2],
          left: [box.left + 2, (box.top + box.bottom) / 2],
          right: [box.right - 2, (box.top + box.bottom) / 2],
        }[side] as [number, number];
        const onTop = document.elementFromPoint(point[0], point[1]);
        if (onTop && onTop !== sc && !sc.contains(onTop)) {
          let edge: Element | null = null;
          for (
            let u: Element | null = onTop;
            u && !u.contains(sc);
            u = u.parentElement
          ) {
            const us = style(u) as CSSStyleDeclaration & {
              webkitBackdropFilter?: string;
            };
            const blurs =
              (us.backdropFilter && us.backdropFilter !== "none") ||
              (us.webkitBackdropFilter && us.webkitBackdropFilter !== "none");
            if (blurs || paints(u).length > 0) {
              edge = u;
              break;
            }
          }
          if (edge) {
            named.push(
              `${describe(sc)}'s ${side} cut stands under ${describe(edge)}, its edge effect (DESIGN.md:665)`
            );
            continue;
          }
        }
        const holder = masked(sc);
        if (holder) {
          const vertical = side === "top" || side === "bottom";
          const len = Math.min(
            FADE,
            (vertical ? box.bottom - box.top : box.right - box.left) / 2
          );
          const band = vertical
            ? {
                x: box.left,
                width: box.right - box.left,
                y: side === "top" ? box.top : box.bottom - len,
                height: len,
              }
            : {
                y: box.top,
                height: box.bottom - box.top,
                x: side === "left" ? box.left : box.right - len,
                width: len,
              };
          // One mark per holder, kept for each of its cut edges.
          const mark = Number(
            holder.getAttribute("data-house-mask") ?? edgesOut.length
          );
          holder.setAttribute("data-house-mask", String(mark));
          edgesOut.push({ band, element: describe(sc), holder: mark, side });
          continue;
        }
        const items = itemsOf(sc);
        let peek = 0;
        for (const item of items) {
          const ir = item.getBoundingClientRect();
          if (
            side === "bottom" &&
            ir.top < box.bottom &&
            ir.bottom > box.bottom + 1
          ) {
            peek = Math.max(peek, box.bottom - ir.top);
          } else if (
            side === "top" &&
            ir.bottom > box.top &&
            ir.top < box.top - 1
          ) {
            peek = Math.max(peek, ir.bottom - box.top);
          } else if (
            side === "right" &&
            ir.left < box.right &&
            ir.right > box.right + 1
          ) {
            peek = Math.max(peek, box.right - ir.left);
          } else if (
            side === "left" &&
            ir.right > box.left &&
            ir.left < box.left - 1
          ) {
            peek = Math.max(peek, ir.right - box.left);
          }
        }
        if (peek < 16) {
          const hidden = cut
            ? (cut[side as "bottom" | "right"] ?? 0)
            : {
                bottom: sc.scrollHeight - sc.clientHeight - sc.scrollTop,
                top: sc.scrollTop,
                right:
                  sc.scrollWidth - sc.clientWidth - Math.abs(sc.scrollLeft),
                left: Math.abs(sc.scrollLeft),
              }[side];
          say(
            "hidden-cue",
            sc,
            `${cut ? "clips without scrolling, " : ""}cut at its ${side} with ${px(hidden)} hidden: no mask-image, and ${peek > 0 ? `the item there peeks ${px(peek)} (under 16px)` : "no item peeks past the edge"}`
          );
        }
      }
    }
  }

  // ---- 8. contrast ----
  let lowest: InPageRead["lowest"] = null;
  if (!skip.has("contrast")) {
    const root = rgba(style(document.documentElement).backgroundColor);
    const bodyBg = rgba(style(document.body).backgroundColor);
    const dark =
      style(document.documentElement).colorScheme.includes("dark") &&
      matchMedia("(prefers-color-scheme: dark)").matches;
    const canvasBase: Rgba = dark ? [18, 18, 18, 1] : [255, 255, 255, 1];
    let unreadImages = 0;
    let disabled = 0;
    const seenParents = new Set<Element>();
    for (const t of texts) {
      if (seenParents.has(t.parent)) {
        continue;
      }
      seenParents.add(t.parent);
      if (t.parent.closest('[disabled], [aria-disabled="true"]')) {
        disabled += 1;
        continue;
      }
      const ps = style(t.parent) as CSSStyleDeclaration & {
        webkitTextFillColor?: string;
      };
      if (ps.webkitTextFillColor && rgba(ps.webkitTextFillColor)[3] === 0) {
        unreadImages += 1;
        continue;
      }
      let opacity = 1;
      const layers: { bg: Rgba; stops: Rgba[] }[] = [];
      let image = false;
      for (let up: Element | null = t.parent; up; up = up.parentElement) {
        const s = style(up);
        opacity *= Number(s.opacity);
        if (s.backgroundImage.includes("url(")) {
          image = true;
          break;
        }
        const layer = { bg: fill(s), stops: stopsUnder(up, s, t.rects) };
        layers.push(layer);
        if (
          layer.bg[3] >= 0.99 ||
          (layer.stops.length > 0 && layer.stops.every((c) => c[3] >= 0.99))
        ) {
          break;
        }
      }
      if (image) {
        unreadImages += 1;
        continue;
      }
      const page = [root, bodyBg].find((c) => c[3] > 0);
      let grounds: Rgba[] = [page ? over(page, canvasBase) : canvasBase];
      for (const layer of layers.reverse()) {
        grounds = grounds.map((g) => over(layer.bg, g));
        if (layer.stops.length > 0) {
          grounds = grounds.flatMap((g) =>
            layer.stops.map((stop) => over(stop, g))
          );
        }
      }
      const ink = rgba(ps.color);
      const size = Number.parseFloat(ps.fontSize);
      const weight = Number(ps.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      let worst = 99;
      for (const g of grounds) {
        const drawn = over([ink[0], ink[1], ink[2], ink[3] * opacity], g);
        worst = Math.min(worst, ratio(drawn, g));
      }
      if (!lowest || worst < lowest.ratio) {
        lowest = {
          element: describe(t.parent),
          ratio: Math.round(worst * 100) / 100,
        };
      }
      if (worst < need) {
        say(
          "contrast",
          t.parent,
          `${worst.toFixed(2)}:1 under ${need}:1 (“${words(t.node.data)}”, ${ps.color} at ${size}px)`
        );
      }
    }
    if (unreadImages > 0) {
      unread.push(
        `contrast: ${unreadImages} text run(s) on an image or clipped gradient, read by impeccable on Chromium only`
      );
    }
    if (disabled > 0) {
      named.push(
        `contrast: ${disabled} run(s) in disabled controls, outside WCAG 1.4.3`
      );
    }
  }

  // ---- 9. settled ----
  if (!skip.has("settled")) {
    const walk = (root: Document | ShadowRoot): Animation[] => {
      const runs = [...root.getAnimations()];
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          runs.push(...walk(el.shadowRoot));
        }
      }
      return runs;
    };
    const running = walk(document).filter((run) => {
      const timing = run.effect?.getComputedTiming();
      const target = (run.effect as KeyframeEffect | null)?.target;
      // What moves in the surface read; a preview's own switch easing
      // after a press is not the surface.
      const host =
        target && "getRootNode" in target
          ? (target.getRootNode() as Document | ShadowRoot)
          : null;
      const el =
        host instanceof ShadowRoot ? host.host : (target as Element | null);
      return (
        el !== null &&
        el !== undefined &&
        inScope(el) &&
        (run.playState === "running" || run.pending) &&
        typeof timing?.endTime === "number" &&
        Number.isFinite(timing.endTime) &&
        (timing.progress ?? 1) < 1
      );
    });
    for (const run of running.slice(0, 4)) {
      const target = (run.effect as KeyframeEffect | null)?.target;
      const timing = run.effect?.getComputedTiming();
      say(
        "settled",
        target ?? null,
        `a finite ${(run as CSSAnimation).animationName ?? (run as CSSTransition).transitionProperty ?? "animation"} runs, at ${Math.round(Number(run.currentTime ?? 0))} of ${Math.round(Number(timing?.endTime ?? 0))}ms`
      );
    }
    if (document.fonts.status !== "loaded") {
      say("settled", null, `fonts ${document.fonts.status}`);
    }
  }

  // ---- 10. nothing made up ----
  if (!skip.has("made-up")) {
    const DENY = [
      /PROBE-/u,
      /JOURNEY-/u,
      /\/tmp\//u,
      /\.cawco\/tmp/u,
      /probe-kit/u,
      /\bLorem\b/iu,
      /\bTest item\b/iu,
    ];
    const flagged = new Set<Element>();
    for (const t of texts) {
      const hit = DENY.find((re) => re.test(t.node.data));
      if (hit && !flagged.has(t.parent)) {
        flagged.add(t.parent);
        say(
          "made-up",
          t.parent,
          `fixture words (${hit.source}): “${words(t.node.data)}”`
        );
      }
    }
    for (const el of scope.querySelectorAll(
      "[aria-label], [title], [alt], [placeholder]"
    )) {
      for (const attr of ["aria-label", "title", "alt", "placeholder"]) {
        const v = el.getAttribute(attr) ?? "";
        const hit = DENY.find((re) => re.test(v));
        if (hit && shown(el)) {
          say(
            "made-up",
            el,
            `fixture words in its ${attr} (${hit.source}): “${words(v)}”`
          );
        }
      }
    }
    for (const el of scope.querySelectorAll("*")) {
      if (
        !el.matches(
          'button, a, label, th, h1, h2, h3, h4, h5, h6, legend, option, [role="tab"]'
        ) &&
        el.children.length === 0 &&
        el.textContent?.trim() === "Body" &&
        shown(el) &&
        el.parentElement?.textContent?.trim() === "Body"
      ) {
        say("made-up", el, "a lone “Body” stands as the panel's content");
      }
    }
    for (const slot of args.allowedText) {
      for (const el of scope.querySelectorAll(slot.selector)) {
        if (!shown(el)) {
          continue;
        }
        const text = el.textContent?.replace(/\s+/gu, " ").trim() ?? "";
        if (!slot.texts.includes(text)) {
          say("made-up", el, `“${words(text)}” is not in ${slot.source}`);
        }
      }
    }
  }

  return { findings, edges: edgesOut, lowest, named, unread };
}

/** Whether each finding's element (by its kept index) or words match an exemption; the reason if so. */
function excuseIn(args: {
  except: { rule: string; selector?: string; text?: string; reason: string }[];
  items: { at: number; rule: string; element: string; measured: string }[];
}): (string | null)[] {
  const els =
    (window as unknown as { __houseEls?: Element[] }).__houseEls ?? [];
  return args.items.map((item) => {
    const el = item.at >= 0 ? els[item.at] : null;
    // Given both, both must hold: findings of that kind on that element.
    const hit = args.except.find(
      (one) =>
        one.rule === item.rule &&
        (one.selector || one.text) &&
        (!one.selector || el?.closest(one.selector)) &&
        (!one.text || `${item.element} ${item.measured}`.includes(one.text))
    );
    return hit ? hit.reason : null;
  });
}

/** Impeccable's selectors placed: whether each names an element in the scope, and that element's name. */
function placeIn(args: {
  scope: string;
  selectors: string[];
}): { inScope: boolean; at: number }[] {
  const scope = document.querySelector(args.scope) ?? document.body;
  const w = window as unknown as { __houseEls?: Element[] };
  w.__houseEls ??= [];
  const els = w.__houseEls;
  return args.selectors.map((selector) => {
    let found: Element | null = null;
    try {
      found =
        [...document.querySelectorAll(selector)].find((el) =>
          scope.contains(el)
        ) ?? null;
    } catch {
      found = null;
    }
    if (!found) {
      return { inScope: false, at: -1 };
    }
    els.push(found);
    return { inScope: true, at: els.length - 1 };
  });
}

/**
 * How far `a` stands from `b` in the `depth` css px of a band nearest its
 * `side`: the 95th percentile of the pixels' luminance difference (0–255).
 */
function inkAt(
  a: Raster,
  b: Raster,
  side: "top" | "bottom" | "left" | "right",
  depth: number
): number {
  const d = Math.max(1, Math.round(depth * a.scale));
  const lumAt = (r: Raster, k: number) =>
    0.2126 * (r.data[k] ?? 0) +
    0.7152 * (r.data[k + 1] ?? 0) +
    0.0722 * (r.data[k + 2] ?? 0);
  const values: number[] = [];
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const near =
        (side === "top" && y < d) ||
        (side === "bottom" && y >= a.height - d) ||
        (side === "left" && x < d) ||
        (side === "right" && x >= a.width - d);
      if (near) {
        const k = (y * a.width + x) * 4;
        values.push(Math.abs(lumAt(a, k) - lumAt(b, k)));
      }
    }
  }
  values.sort((x, y) => x - y);
  return values[Math.floor(0.95 * (values.length - 1))] ?? 0;
}

/**
 * Whether the mask on a cut edge draws: three drawings of its band, as it
 * stands, with the holder's mask lifted, and with the holder gone (the
 * ground behind it). What the scroller draws at the cut is the second
 * against the third; what the mask leaves of it, the first against the
 * third. Says nothing when the fade draws or nothing stands at the cut.
 */
async function fadeDraws(
  page: Page,
  edge: InPageRead["edges"][number]
): Promise<{ finding?: string; unread?: string } | null> {
  const view = page.viewportSize();
  const b = edge.band;
  const onScreen =
    view &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.x + b.width <= view.width + 0.5 &&
    b.y + b.height <= view.height + 0.5 &&
    b.width >= 4 &&
    b.height >= 4;
  if (!onScreen) {
    return {
      unread: `hidden-cue: ${edge.element}'s ${edge.side} fade is off the screen; its mask is declared, its drawing unread`,
    };
  }
  const clip = { x: b.x, y: b.y, width: b.width, height: b.height };
  const as = (rule: string | null) =>
    page.evaluate(
      ([i, r]) => {
        document.getElementById("house-unmask")?.remove();
        if (r) {
          const style = document.createElement("style");
          style.id = "house-unmask";
          style.textContent = `[data-house-mask="${i}"]{${r};transition:none!important}`;
          document.head.append(style);
        }
        return new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        );
      },
      [edge.holder, rule] as const
    );
  const withMask = await capture(page, clip);
  await as("mask-image:none!important;-webkit-mask-image:none!important");
  const bare = await capture(page, clip);
  await as("opacity:0!important");
  const ground = await capture(page, clip);
  await as(null);
  const vertical = edge.side === "top" || edge.side === "bottom";
  const depth = Math.min(6, (vertical ? b.height : b.width) / 4);
  const drawn = inkAt(bare, ground, edge.side, depth);
  const left = inkAt(withMask, ground, edge.side, depth);
  if (drawn < 12 || left <= drawn * 0.5) {
    return null;
  }
  return {
    finding: `its ${edge.side} mask does not fade what it cuts: in the outer ${depth}px its ink stands ${Math.round(drawn)} levels off the ground without the mask and ${Math.round(left)} with it`,
  };
}

/** How many impeccable runs a page has had, for a unique target title. */
let scans = 0;

/** `impeccable detect --json --cdp` on the page as it stands. */
async function impeccable(page: Page): Promise<{
  ran: boolean;
  said: string;
  found: { antipattern: string; selector: string; snippet: string }[];
}> {
  const engine = page.context().browser()?.browserType().name() ?? "unknown";
  if (engine !== "chromium") {
    return {
      ran: false,
      said: `impeccable reads Chromium only; not run on ${engine}`,
      found: [],
    };
  }
  const port = devtoolsPort(page);
  if (!port) {
    return {
      ran: false,
      said: "impeccable not run: the page's Chromium has no DevTools port (open it with kit.page)",
      found: [],
    };
  }
  const bin = impeccableBin();
  if (!bin) {
    return {
      ran: false,
      said: "impeccable not run: no launcher at $IMPECCABLE or in the user layer's impeccable skill",
      found: [],
    };
  }
  scans += 1;
  const token = `house-rules-${process.pid}-${scans}`;
  const title = await page.title();
  await page.evaluate((t) => {
    document.title = t;
  }, token);
  try {
    const child = Bun.spawn(
      [bin, "detect", "--json", "--cdp", String(port), "--target", token],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0 && code !== 2) {
      return {
        ran: false,
        said: `impeccable detect exited ${code}: ${err.trim().slice(0, 300)}`,
        found: [],
      };
    }
    const found = JSON.parse(out || "[]") as {
      antipattern: string;
      selector: string;
      snippet: string;
    }[];
    return {
      ran: true,
      said: `impeccable detect read the page (${found.length} finding(s) on the page)`,
      found,
    };
  } finally {
    await page.evaluate((t) => {
      document.title = t;
    }, title);
  }
}

/** Keeps every scroll position on the page and the focused element, for {@link putPlace}. */
function keepPlace(): void {
  const kept: [Element, number, number][] = [];
  for (const el of document.querySelectorAll("*")) {
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      kept.push([el, el.scrollTop, el.scrollLeft]);
    }
  }
  (window as unknown as { __housePlace: unknown }).__housePlace = {
    kept,
    x: window.scrollX,
    y: window.scrollY,
    focus: document.activeElement,
  };
}

/** Puts back what {@link keepPlace} kept: every scroll position, then the focus. */
function putPlace(): void {
  const place = (
    window as unknown as {
      __housePlace?: {
        focus: Element | null;
        kept: [Element, number, number][];
        x: number;
        y: number;
      };
    }
  ).__housePlace;
  if (!place) {
    return;
  }
  for (const el of document.querySelectorAll("*")) {
    const was = place.kept.find(([one]) => one === el);
    const top = was ? was[1] : 0;
    const left = was ? was[2] : 0;
    if (el.scrollTop !== top || el.scrollLeft !== left) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  }
  window.scrollTo(place.x, place.y);
  if (
    place.focus instanceof HTMLElement &&
    place.focus !== document.activeElement
  ) {
    place.focus.focus({ preventScroll: true });
  }
}

/** What impeccable reads for the house: its rule, by the house rule it serves. */
const IMPECCABLE_HOUSE: Record<string, HouseRule> = {
  "low-contrast": "contrast",
  "text-occlusion": "overflow",
};

/**
 * Every house rule read at the state the spec put `page` in. The spec
 * settles first (`settle`, or its own); a page still moving is the
 * `settled` rule's finding, not waited out here.
 */
export async function houseRules(
  page: Page,
  opts: HouseOptions = {}
): Promise<HouseRead> {
  const scope = opts.scope ?? "body";
  const exempt = Object.keys(opts.exempt ?? {});
  const read = await page.evaluate(houseRead, {
    scope,
    views: opts.views ?? null,
    marks: opts.marks ?? null,
    corals: TOKEN_VALUES(CORAL_TOKENS),
    shelf: TOKEN_VALUES(["surface-shelf"])[0] as {
      name: string;
      value: string;
    },
    allowedText: opts.allowedText ?? [],
    coralExcept: (opts.except ?? []).flatMap((one) =>
      one.rule === "coral" && one.selector
        ? [{ selector: one.selector, reason: one.reason }]
        : []
    ),
    exempt,
  });
  const findings: (HouseFinding & { at: number })[] = [...read.findings];
  const unread = [...read.unread];

  // 7: a declared fade that draws, read in the pixels with and without it.
  for (const edge of read.edges) {
    // biome-ignore lint/performance/noAwaitInLoops: one band drawn at a time, each lifting a style the next must not see
    const said = await fadeDraws(page, edge);
    if (said?.unread) {
      unread.push(said.unread);
    } else if (said?.finding) {
      findings.push({
        rule: "hidden-cue",
        element: edge.element,
        measured: said.finding,
        at: -1,
      });
    }
  }
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-house-mask]")) {
      el.removeAttribute("data-house-mask");
    }
  });

  // 1: the overflow sweep, the journeys' own.
  if (!exempt.includes("overflow")) {
    for (const line of await page.evaluate(scan)) {
      findings.push({
        rule: "overflow",
        element: "the page",
        measured: line,
        at: -1,
      });
    }
  }

  // impeccable on the page as it stands. It scrolls what it measures and
  // moves the focus (a transcript pinned to its foot came back 39px off it,
  // thinking-traffic), so every scroll position and the focus are put back.
  let imp: Awaited<ReturnType<typeof impeccable>>;
  if (opts.noImpeccable) {
    imp = {
      ran: false,
      said: `impeccable not run here: ${opts.noImpeccable}`,
      found: [],
    };
  } else {
    await page.evaluate(keepPlace);
    imp = await impeccable(page);
    await page.evaluate(putPlace);
  }
  const others: string[] = [];
  if (imp.found.length > 0) {
    const placed = await page.evaluate(placeIn, {
      scope,
      selectors: imp.found.map((f) => f.selector),
    });
    imp.found.forEach((f, i) => {
      const where = placed[i];
      if (!where?.inScope) {
        return;
      }
      const rule = IMPECCABLE_HOUSE[f.antipattern];
      if (rule && !exempt.includes(rule)) {
        findings.push({
          rule,
          element: f.selector,
          measured: `impeccable ${f.antipattern}: ${f.snippet}`,
          at: where.at,
        });
      } else if (!rule) {
        others.push(`${f.antipattern}: ${f.selector} (${f.snippet})`);
      }
    });
  }

  const reasons = opts.except?.length
    ? await page.evaluate(excuseIn, { except: opts.except, items: findings })
    : findings.map(() => null);
  const excused: HouseRead["excused"] = [];
  const kept: HouseFinding[] = [];
  findings.forEach(({ at: _at, ...f }, i) => {
    const reason = reasons[i];
    if (reason) {
      excused.push({ ...f, reason });
    } else {
      kept.push(f);
    }
  });
  return {
    findings: kept,
    excused,
    impeccable: { ran: imp.ran, said: imp.said },
    lowest: read.lowest,
    named: read.named,
    others,
    unread,
  };
}

/**
 * The house rules over a spec's states: `at` reads one, `report` says one
 * PASS or FAIL line per rule over all of them, then what was exempted,
 * excused, named and left unread, so nothing is skipped silently.
 */
export class HouseRules {
  /** Each rule's findings, one entry per element and what it measured, with the states it was read in. */
  private readonly found = new Map<
    HouseRule,
    Map<string, { first: string; n: number }>
  >();
  private readonly excused = new Map<string, number>();
  private readonly named = new Set<string>();
  private readonly unread = new Set<string>();
  private readonly others = new Map<string, number>();
  private readonly impeccable = new Set<string>();
  private lowest: { element: string; ratio: number; where: string } | null =
    null;
  private states = 0;
  private readonly kit: Kit;
  private readonly label: string;
  private readonly opts: HouseOptions;

  constructor(kit: Kit, label: string, opts: HouseOptions = {}) {
    this.kit = kit;
    this.label = label;
    this.opts = opts;
  }

  /** Reads one state; `more` adds to (or overrides) the spec's options for it. */
  async at(
    page: Page,
    where: string,
    more: HouseOptions = {}
  ): Promise<HouseRead> {
    const read = await houseRules(page, {
      ...this.opts,
      ...more,
      exempt: { ...this.opts.exempt, ...more.exempt },
      except: [...(this.opts.except ?? []), ...(more.except ?? [])],
      allowedText: [
        ...(this.opts.allowedText ?? []),
        ...(more.allowedText ?? []),
      ],
    });
    this.states += 1;
    for (const f of read.findings) {
      const byKey = this.found.get(f.rule) ?? new Map();
      const key = `${f.element}: ${f.measured}`;
      const known = byKey.get(key);
      byKey.set(key, { first: known?.first ?? where, n: (known?.n ?? 0) + 1 });
      this.found.set(f.rule, byKey);
    }
    for (const e of read.excused) {
      const key = `${e.rule} on ${e.element}: ${e.reason}`;
      this.excused.set(key, (this.excused.get(key) ?? 0) + 1);
    }
    for (const n of read.named) {
      this.named.add(n);
    }
    for (const u of read.unread) {
      this.unread.add(u);
    }
    for (const o of read.others) {
      this.others.set(o, (this.others.get(o) ?? 0) + 1);
    }
    this.impeccable.add(read.impeccable.ran ? "ran" : read.impeccable.said);
    if (
      read.lowest &&
      (!this.lowest || read.lowest.ratio < this.lowest.ratio)
    ) {
      this.lowest = { ...read.lowest, where };
    }
    return read;
  }

  /** One line per rule over every state read, then the exemptions, the excused, the named and the unread. */
  report(): void {
    const exempt = this.opts.exempt ?? {};
    const impeccableDown = [...this.impeccable].filter((one) => one !== "ran");
    for (const rule of RULES) {
      const { says, by } = HOUSE_RULES[rule];
      const reason = exempt[rule];
      if (reason) {
        this.kit.note(
          `${this.label} house rule ${rule} (${says}) exempt: ${reason}`
        );
        continue;
      }
      const byKey =
        this.found.get(rule) ?? new Map<string, { first: string; n: number }>();
      const total = [...byKey.values()].reduce((sum, one) => sum + one.n, 0);
      const list = [...byKey.entries()].map(
        ([key, one]) => `${key} (×${one.n}, first at ${one.first})`
      );
      const extra =
        rule === "contrast" && this.lowest
          ? `, lowest ${this.lowest.ratio.toFixed(2)}:1 at ${this.lowest.where}: ${this.lowest.element}`
          : "";
      this.kit.check(
        `${this.label} house rule ${rule}, ${says} (${by}): ${total} finding(s), ${list.length} distinct, over ${this.states} state(s)${extra}`,
        total === 0 && this.states > 0,
        list.slice(0, 5).join(" | ")
      );
    }
    // impeccable is part of the house check: a Chromium run that could not reach it fails.
    const said = (one: string) =>
      one.startsWith("impeccable reads Chromium only") ||
      one.startsWith("impeccable not run here");
    const blocking = impeccableDown.filter((one) => !said(one));
    if (blocking.length > 0) {
      this.kit.check(
        `${this.label} house rules: impeccable detect ran on every state`,
        false,
        blocking.join(" | ")
      );
    }
    for (const one of impeccableDown.filter(said)) {
      this.kit.note(
        `${this.label} house rules: ${one}; contrast and overflow read by the kit's own code alone here`
      );
    }
    for (const [key, n] of this.excused) {
      this.kit.note(`${this.label} house rule excused ×${n}: ${key}`);
    }
    for (const one of this.named) {
      this.kit.note(`${this.label} house rules named, not failed: ${one}`);
    }
    for (const one of this.unread) {
      this.kit.note(`${this.label} house rules unread: ${one}`);
    }
    if (this.others.size > 0) {
      const top = [...this.others.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([o, n]) => `${o} ×${n}`);
      this.kit.note(
        `${this.label} impeccable, outside the house rules (${this.others.size} distinct): ${top.join(" | ")}`
      );
    }
  }
}
