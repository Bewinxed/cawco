/**
 * Measurements of a rendered page: overflow, contrast, coral use, bar and
 * head layout, insets, row density, glyphs and the rest in the table below,
 * read from the engine at the state the spec put the page in, the same way
 * in every spec. Screenshot review is left with what a person must judge.
 *
 *   const checks = new RenderedChecks(kit, engine, { scope: ".frame" });
 *   await checks.at(page, "state name");   // after the spec's own settle
 *   checks.report();                       // one PASS/FAIL line per rule
 *
 * From the command line, on any page, once per width (under 640 a phone's
 * touch screen), in the kit's Chromium, once the page has drawn
 * (`untilDrawn`); exits 1 on any finding, and fails every rule on a scope
 * that drew nothing:
 *
 *   bun scripts/probe-kit/rendered-checks.ts <url> [--width 1540] [--width 390x844] [--scope <selector>]
 *
 * `renderedChecks(page, opts)` is the one read under the ledger: it runs the
 * overflow sweep (journeys/scan.ts), `impeccable detect --json --cdp` on the
 * page as it stands (Chromium: the kit's own browser, by its DevTools port),
 * and the rendered checks impeccable has no rule for. Each finding names the
 * element (selector and accessible name), the rule and what it measured.
 *
 * | rule        | read by                     | what it reads |
 * | ----------- | --------------------------- | ------------- |
 * | overflow    | scan.ts + impeccable `text-occlusion` | boxes past the screen, out of their control or box, a control out of its row, card or panel, text under a control or an opaque box; what is hidden (a 1px box, `sr-only`'s `clip-path: inset(50%)`) is not read, and words an open layer covers (a popover, menu or dialog over the page) are named |
 * | coral       | own code                    | each view's (the spec's `views`, else the scope; and each `data-specimen`) controls and grounded chips whose fill, border or (a control's) ink resolves to a coral token from tokens.css; at most one; a checked checkbox, switch or radio, a chosen record (`data-chosen`), an identity tile on its mark hue, a mark out of the accessibility tree (`data-mark`: a comment's pin) and a region's one coral hairline side (the vermillion section rule) are allowed and named |
 * | glyph       | own code                    | a control whose only content is a glyph: no fill, border or shadow on it or on a wrapper that holds it alone; its svg holds no solid disc, tile or rounded shape spanning 70% of its viewBox |
 * | bar-ground  | own code                    | bars (toolbars, the bar data-slots, foot bars, and a `header` that does not scroll with its content: one that does, or one under another bar of its surface, heads a group of it, no bar) paint no fill, border or shadow; a folder-tab shelf (DESIGN.md, Shapes, Folder tabs), a group's capsule (DESIGN.md, The Title Bars Follow Liquid Glass Rule: Floating groups) and a foot's lone top hairline (DESIGN.md, Borders are graded) are named, not failed |
 * | head        | own code                    | a bar's (as bar-ground reads one) title and controls share one row (centres within 4px), no second line in the bar (a popover, menu or dialog it opens is no part of it), the title not repeated by the first heading under it |
 * | back-close  | own code                    | no control's words say Back or Close (DESIGN.md, The Title Bars Follow Liquid Glass Rule: Back and Close are symbols) |
 * | hidden-cue  | own code + ink              | a scroller cut at an edge (an element of it past that edge: a pseudo's overflow alone hides nothing) carries a computed mask there that draws (the edge's pixels with and without it), or an item peeking 16px or more, or stands under an edge effect (hit there, or blurring it without taking presses); a box that clips without scrolling hides no words past its edge, but inside a control that opens a layer, whole items dropped, none cut, are named |
 * | contrast    | own code + impeccable `low-contrast` | every text run against the ground under it (its boxes' fills, and the filled svg shapes drawn before it under its middle: a folder tab's sheet), 4.5:1 (3:1 at 24px); the lowest is reported |
 * | settled     | own code                    | no finite animation running, fonts loaded (`settle(page)` gets a page there) |
 * | made-up     | own code                    | no fixture or probe words (`PROBE-`, `/tmp/`, `Lorem` …), a lone "Body", text outside the spec's `allowedText` source |
 * | tight-inset | own code                    | words on an edged, rounded surface of 160×48 or more stand 8px or more from its sides (DESIGN.md, The Row Grid Rule) |
 * | tight-control | own code                  | a drawn button stands 7px (`space-2`) or more under the field, line or card above it |
 * | uneven-inset | own code                   | a drawn row its children fill (to its padding at both ends) keeps one inset at both ends, a child that paints nothing (a ghost, a wrapper) read by its ink; a row holding a track (a child whose ink all stands out of flow, placed on a scale) is a plot, not read: the smaller end not under 55% of a 16px or larger one (DESIGN.md, The Row Grid Rule) |
 * | fat-row     | own code                    | one-line rows of a list (its children of its commonest kind) not over 3.4 lines and 48px tall, a row that draws nothing less the margins its children keep inside it |
 * | loose-list  | own code                    | a list's alike rows, where two stand next to each other, not further apart than they are tall, and 24px |
 * | empty-pane  | own code                    | a landmark or pane of 120px or more holds a word, mark, control (an editor's `contenteditable` too) or drawn block |
 * | clipped-glyph | own code                  | an svg draws inside its viewBox, and no box that clips without scrolling cuts it |
 * | mixed-icons | own code                    | no outlined mark beside a filled one in a bar, nav or list; an open-stroked glyph (chevron, arrow, close, plus, tick) is allowed, and a ring (circles on one centre, stroked: a task ring, a spinner) is a figure; a shape at opacity 0 is not drawn |
 * | small-text  | own code                    | at a width under 600, no words drawn under 10px |
 * | text-overlap | own code                   | no two drawn text runs cross (an aria-hidden ruler's figures included); a layer over the page, or a pinned bar over what scrolls under it, is its own |
 * | anchor-drift | own code, over reads        | an open popover, menu or listbox whose height changed between two reads of a page holds its top or its bottom |
 * | decoration-spill | own code                 | an outline (offset past the border edge), a hard box-shadow (blur under 1px, by its spread and offsets), a dashed or dotted border, or an absolutely placed ::before/::after that draws, reaching 0.5px past the box it marks (a pseudo's own element, when that draws; not a pseudo flush outside it, which carries it on) or past the nearest box that clips it or rounded box that draws, its own box inside that one; a clip-path or mask is unread |
 * | nested-radius | own code                    | a wash (a fill or gradient, an element's or an absolute pseudo's) that nearly fills a rounded box (one axis within its radius of both ends) and whose corner stands within that radius of the box's corner (the box drawing or clipping) is outer radius less the mean inset, within 1.5px or a quarter of it, plus half the two insets' difference |
 * | state-shape | own code + CSS.forcePseudoState | each control in a bar and each rounded one, with hover, active and focus-visible forced on it in turn (Chromium; transitions held off) and at rest when drawn selected: the fill or ring that state paints anew (its own, a pseudo's, a child's half its size or more) takes the control's radius less its inset where a child or pseudo draws it, and, inside the glass it stands in (the nearest box that draws over it, rounded, and not scrolling it past its corners), the glass's radius less its inset (a capsule's across it), within 1.5px or a tenth (a quarter at a corner) |
 *
 * A sheet of specimens (a bench) says what a view is on the page itself:
 * each specimen that stands for a screen of its own carries `data-specimen`,
 * and the per-view rules (coral) read each as a view of its own, its
 * elements counted in the nearest view that holds them, the specimen itself
 * included (a button can be one). What stands outside every specimen is
 * still the scope's, or a spec's `views`. A product screen never carries
 * it: there, one view is the screen.
 *
 * Two other unintended-looking lines are read already: cut by
 * the crop by `overflow` and `hidden-cue`, spills its slot by `overflow`. An
 * entrance or an exit is not read here: a read comes after the settle, when
 * the move is over; a spec holds one on the clock with anim.ts.
 *
 * Every other impeccable finding in the scope is printed as a NOTE: its
 * rules are taste no check here measures.
 */
// biome-ignore-all lint/performance/useTopLevelRegex: the reads run serialized into the page (`page.evaluate`), so each regex lives inside its function
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { userSkillLayers } from "../../packages/core/src/paths";
import { capture, type Raster } from "./ink";
import { scan } from "./journeys/scan";
import { devtoolsPort, installRuns, type Kit, ROOT, Run, settle } from "./kit";

export type CheckName =
  | "overflow"
  | "coral"
  | "glyph"
  | "bar-ground"
  | "head"
  | "back-close"
  | "hidden-cue"
  | "contrast"
  | "settled"
  | "made-up"
  | "tight-inset"
  | "tight-control"
  | "uneven-inset"
  | "fat-row"
  | "loose-list"
  | "empty-pane"
  | "clipped-glyph"
  | "mixed-icons"
  | "small-text"
  | "text-overlap"
  | "anchor-drift"
  | "decoration-spill"
  | "nested-radius"
  | "state-shape";

/** The states state-shape forces on each control it reads, in the order read. */
const FORCED = ["hover", "active", "focus-visible"] as const;
type ForcedState = (typeof FORCED)[number];

/** Each rule, what it holds, and who reads it: the report's words. */
const CHECKS: Record<CheckName, { says: string; by: string }> = {
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
  "tight-inset": {
    says: "words stand 8px inside their surface (The Row Grid Rule: the text column and the trailing edge `space-3` in)",
    by: "own code",
  },
  "tight-control": {
    says: "a drawn button stands a ladder step under what is above it (Spacing ladder)",
    by: "own code",
  },
  "uneven-inset": {
    says: "a drawn row keeps one inset at both ends (The Row Grid Rule: the trailing edge, drawn in ink)",
    by: "own code",
  },
  "fat-row": {
    says: "a one-line row is no taller than the density it runs at (Density)",
    by: "own code",
  },
  "loose-list": {
    says: "a list's rows stand on its pitch, no air for filling (Density)",
    by: "own code",
  },
  "empty-pane": {
    says: "a pane holds something (The Empty Starts Work, The Claim Of Nothing)",
    by: "own code",
  },
  "clipped-glyph": {
    says: "a glyph is drawn whole on its grid (The Solar Duotone Rule)",
    by: "own code",
  },
  "mixed-icons": {
    says: "one face for marks in a bar (The Solar Duotone Rule)",
    by: "own code",
  },
  "small-text": {
    says: "no words under 10px on a narrow screen (the dense roles are the smallest that reads)",
    by: "own code",
  },
  "text-overlap": {
    says: "no words drawn over other words",
    by: "own code",
  },
  "anchor-drift": {
    says: "an open popover holds an edge as its list changes (The Nothing Jumps Rule)",
    by: "own code",
  },
  "decoration-spill": {
    says: "a ring, a dashed edge or a drawn pseudo stays inside the wash it marks and the rounded or clipped box it sits in (The One Ring Rule)",
    by: "own code",
  },
  "nested-radius": {
    says: "a wash in a rounded corner takes the outer radius less its inset (The Concentric Rule)",
    by: "own code",
  },
  "state-shape": {
    says: "a control's hover, pressed, focus and selected fill takes its shape, concentric in its glass (The Concentric Rule)",
    by: "own code + DevTools CSS.forcePseudoState",
  },
};

export const RULES = Object.keys(CHECKS) as CheckName[];

/** One element-level exemption: findings of `rule` on what `selector` matches, whose words hold `text`; either alone, or both together. */
interface CheckExcept {
  reason: string;
  rule: CheckName;
  selector?: string;
  text?: string;
}

export interface CheckOptions {
  /** Text slots that must hold one of `texts` (his starters, his records): `source` names where they come from. */
  allowedText?: {
    selector: string;
    source: string;
    texts: readonly string[];
  }[];
  /** Findings excused one by one, each with its reason. */
  except?: CheckExcept[];
  /** Whole rules not read here, each with its reason (printed). */
  exempt?: Partial<Record<CheckName, string>>;
  /** Standalone marks (a status glyph outside any control) held to the glyph rule's svg test too. */
  marks?: string;
  /**
   * Why impeccable does not run on this spec's reads, when it must not
   * (printed): the kit's own reads still run.
   */
  noImpeccable?: string;
  /** The surface the rules read: the product, not a preview's own chrome. Default `body`. */
  scope?: string;
  /** Each match is one view for the coral count. Default: the scope. A page's `data-specimen` is one too, whatever this says. */
  views?: string;
}

interface CheckFinding {
  element: string;
  measured: string;
  rule: CheckName;
}

export interface CheckRead {
  /** The scope drew nothing to read: no rule passes on it. */
  drewNothing: boolean;
  /** Findings excused by `except`, each with its reason. */
  excused: (CheckFinding & { reason: string })[];
  findings: CheckFinding[];
  /** What impeccable said: its run, or why it did not run. */
  impeccable: { ran: boolean; said: string };
  /** The lowest text contrast read, with its element. */
  lowest: { element: string; ratio: number } | null;
  /** What the rules met and name without failing (a checked checkbox's coral, a shelf, a capsule). */
  named: string[];
  /** Impeccable findings outside the rendered checks, in the scope. */
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

/** The impeccable skill's launcher, by its path inside the skill. */
const IMPECCABLE_LAUNCHER = join("impeccable", "scripts", "impeccable");

/**
 * The impeccable launcher: `$IMPECCABLE`, else the impeccable skill's in the
 * first of the fleet's skill layers that holds it (core paths.ts
 * `userSkillLayers`). The fleet may place impeccable as a plugin's skill, in
 * a vendored marketplace, and no `skills/impeccable` stands in the user layer
 * then: on the host every Chromium read said "no launcher" (r413).
 */
function impeccableBin(): string | null {
  const named = process.env.IMPECCABLE;
  if (named !== undefined) {
    return existsSync(named) ? named : null;
  }
  return (
    userSkillLayers()
      .map((dir) => join(dir, IMPECCABLE_LAUNCHER))
      .find((bin) => existsSync(bin)) ?? null
  );
}

interface InPageArgs {
  allowedText: { selector: string; source: string; texts: readonly string[] }[];
  /** Coral spends a spec excuses, each with its reason: dropped from the count, not from the report. */
  coralExcept: { reason: string; selector: string }[];
  corals: { name: string; value: string }[];
  exempt: string[];
  /** A state forced on every control state-shape reads (CSS.forcePseudoState): its read alone. Null for the read at rest. */
  forced: ForcedState | null;
  marks: string | null;
  scope: string;
  shelf: { name: string; value: string };
  views: string | null;
}

interface InPageRead {
  /** The scope drew nothing: no word, mark, control or box that paints. */
  drewNothing: boolean;
  edges: {
    band: { height: number; width: number; x: number; y: number };
    element: string;
    holder: number;
    /** How far an item peeks past the cut: 16px is a cue a fade cut short leaves. */
    peek: number;
    side: "top" | "bottom" | "left" | "right";
  }[];
  findings: (CheckFinding & { at: number })[];
  lowest: { element: string; ratio: number } | null;
  named: string[];
  unread: string[];
}

/**
 * The rendered checks impeccable has no rule for, read in the page. One
 * function serialized into the page, everything it uses inside it. Each
 * finding keeps the index of its element (`at`, in `window.__checkEls`) so
 * an exemption can be matched against the element itself.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
function readInPage(args: InPageArgs): InPageRead {
  const scope = document.querySelector(args.scope) ?? document.body;
  const skip = new Set(args.exempt);
  const findings: (CheckFinding & { at: number })[] = [];
  const named: string[] = [];
  const unread: string[] = [];
  // A forced state's read (state-shape) adds to the read it follows, whose
  // findings' kept elements it keeps.
  const marked = window as unknown as { __checkEls?: Element[] };
  const els: Element[] = (args.forced && marked.__checkEls) || [];
  marked.__checkEls = els;
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
  const say = (rule: CheckName, el: Element | null, measured: string) => {
    findings.push({
      rule,
      element: el ? describe(el) : "the page",
      measured,
      at: el ? keep(el) : -1,
    });
  };
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  /**
   * Every element at a point, top first, as the engine paints them there:
   * `elementsFromPoint` with every element hit-testable for the one read,
   * since `pointer-events: none` keeps an overlay out of the way of a
   * press, not of the eye (a scroll edge effect, HeadFade).
   */
  const stackAt = (x: number, y: number): Element[] => {
    const hitAll = document.createElement("style");
    hitAll.textContent = "*{pointer-events:auto!important}";
    document.head.append(hitAll);
    const stack = document.elementsFromPoint(x, y);
    hitAll.remove();
    return stack;
  };

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
  /** What a style paints at rest, an element's or a pseudo-element's: its fill, edges, shadow; empty when nothing. */
  const paintsOf = (s: CSSStyleDeclaration): string[] => {
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
    // A shadow whose every colour is clear (a kit button's ring and drop
    // composed at rest, all transparent) draws nothing, as a clear
    // gradient doesn't.
    if (
      s.boxShadow !== "none" &&
      [...s.boxShadow.matchAll(COLOR_FN)].some((m) => rgba(m[0])[3] > 0.02)
    ) {
      out.push(`box-shadow ${s.boxShadow.slice(0, 60)}`);
    }
    return out;
  };
  /** What a box paints of its own at rest. */
  const paints = (el: Element): string[] => paintsOf(style(el));

  const CONTROL =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="slider"]';
  /**
   * A specimen on a sheet of them (a bench): one view of its own for the
   * per-view rules (coral), as the screen it stands in for is, however many
   * stand on the sheet together.
   */
  const SPECIMEN = "[data-specimen]";
  /** A layer a control opens: over the page, wherever its markup stands. */
  const POPOVER =
    '[data-popover], [data-slot="popover-content"], [role="menu"], [role="listbox"]';
  const LAYER = `${POPOVER}, [role="dialog"]`;
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
    // Coral (DESIGN.md, The Coral Is Where You Act Rule) spends beside the act: checked controls, the
    // selected nav row and the chosen option, each said by its state; a
    // record of what was picked says it by `data-chosen` (ui/chip: "a
    // record of what was picked (`data-chosen`)").
    // A card that is one control's surface (that control reaching over
    // it: a map's card, DESIGN.md Map mode, "the chosen card … takes the
    // coral edge, as a chosen chip") is chosen when that control says so.
    const chosenCard = (el: Element) => {
      // Controls a person reaches only: a graph's connection handles
      // (Svelte Flow's, `role="button"` out of the tab order) are no press
      // of the card's.
      const own = [...el.querySelectorAll(CONTROL)].filter(
        (one) => one.getAttribute("tabindex") !== "-1"
      );
      return (
        own.length === 1 &&
        (own[0] as Element).matches(
          '[aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"]'
        )
      );
    };
    const sanctioned = (el: Element) =>
      Boolean(
        el.closest(
          '[role="checkbox"][aria-checked="true"], [role="switch"][aria-checked="true"], [role="radio"][aria-checked="true"], input:checked, [aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"], [data-chosen]:not([data-chosen="false"])'
        ) ||
        el.closest("label")?.querySelector("input:checked") ||
        el.querySelector('input:checked, [aria-checked="true"]') ||
        chosenCard(el)
      );
    // The views: the spec's (`views`), else the scope; and each specimen a
    // sheet marks (`data-specimen`), a view of its own whichever view holds
    // it. An element counts in the nearest view that holds it, itself
    // included: a specimen that is a button is its own view.
    const views = [
      ...(args.views
        ? [...scope.querySelectorAll(args.views)].filter(shown)
        : [scope]),
      ...[...scope.querySelectorAll(SPECIMEN)].filter(shown),
    ].filter((one, i, all) => all.indexOf(one) === i);
    const viewSet = new Set<Element>(views);
    const viewOf = (el: Element): Element | null => {
      for (let up: Element | null = el; up; up = up.parentElement) {
        if (viewSet.has(up)) {
          return up;
        }
      }
      return null;
    };
    for (const view of views) {
      const spends: { el: Element; what: string }[] = [];
      for (const el of [view, ...view.querySelectorAll("*")]) {
        if (el.closest("svg") || !shown(el) || viewOf(el) !== view) {
          continue;
        }
        const s = style(el);
        const isControl = el.matches(CONTROL);
        const grounded = paints(el).length > 0;
        const bg = coralOf(fill(s));
        const stop = stopsOf(s.backgroundImage)
          .map(coralOf)
          .find((one) => one);
        const coralSides = (["top", "right", "bottom", "left"] as const).map(
          (side) =>
            Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0
              ? coralOf(rgba(s.getPropertyValue(`border-${side}-color`)))
              : null
        );
        const edge = coralSides.find((one) => one);
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
        // brand-solid's own job (DESIGN.md, Primary: Brand); a coral word with no
        // ground, a link among them, is link ink (DESIGN.md, Brand ink and wash).
        if (!(what && (isControl || (grounded && hasWords)))) {
          continue;
        }
        if (spends.some((one) => one.el.contains(el))) {
          continue;
        }
        // The vermillion rule that parts two regions of a glass card (Files,
        // Caw's panel: `border-t border-brand-solid`): one hairline side of
        // a region, no fill, no other edge. A mark with no words, brand-solid's
        // job (DESIGN.md, The Coral Is Where You Act Rule; Primary: Brand,
        // "a vermillion section rule"), not an act.
        if (
          !(isControl || bg || stop || ink) &&
          coralSides.filter(Boolean).length === 1 &&
          (["top", "right", "bottom", "left"] as const).every(
            (side, i) =>
              !coralSides[i] ||
              Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) <= 1
          )
        ) {
          named.push(
            `a vermillion section rule, not the act (DESIGN.md, The Coral Is Where You Act Rule: the vermillion rule that parts two regions): ${describe(el)} (${what})`
          );
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
        // A mark says so itself (`data-mark`) and stands out of the
        // accessibility tree, its figure said by what it marks: a comment's
        // pin (PinMark), the reader's own mark, filled as DESIGN.md's Coral
        // Action fills "the reader's own row mark". Its figure is no word of
        // a chip's: who or what a thing is, not the act.
        const mark = el.closest('[data-mark][aria-hidden="true"]');
        if (mark && !isControl) {
          named.push(
            `a mark, not the act (DESIGN.md, Coral Action: the reader's own row mark): ${describe(mark)} (${what})`
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
            `coral on a checked, selected or chosen control (DESIGN.md, The Coral Is Where You Act Rule): ${describe(el)} (${what})`
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
          `${composer ? "a composer control on the composer's recipe (Attach raised, Send/Stop on the coral action: DESIGN.md, Coral Action)" : "the view's prominent act on the coral (DESIGN.md, The Title Bars Follow Liquid Glass Rule: One prominent action)"}: ${describe(control)}`
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
          // A floating bar group's glass (DESIGN.md, The Title Bars Follow Liquid Glass Rule: Floating groups,
          // the narrow bar's Caw tab too), one item or several; a capsule in
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
              `a floating group's glass (Title Bars rule: Floating groups) round ${describe(control)}: ${up === control ? "itself" : selectorOf(up)}`
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
  /** What names itself a bar: a toolbar, a banner, or a bar's data-slot. */
  const NAMED_BAR =
    '[role="toolbar"], [role="banner"], [data-slot="bar"], [data-slot="view-bar"], [data-slot="page-head"], [data-slot="project-head"], [data-slot="side-head"], [data-slot="sheet-header"], [data-slot="drawer-header"], [data-slot="dialog-header"], [data-slot="foot"], [data-slot="page-foot"], [data-slot="sheet-footer"], [data-slot="drawer-footer"], [data-slot="dialog-footer"]';
  const BAR = `header, ${NAMED_BAR}`;
  /** The bars that stand at a surface's foot. */
  const FOOT =
    '[data-slot="foot"], [data-slot="page-foot"], [data-slot="sheet-footer"], [data-slot="drawer-footer"], [data-slot="dialog-footer"]';
  /**
   * Whether `el` scrolls with the content it stands in: in flow under a
   * scroller (an element's, or the document's where its root scrolls),
   * neither it nor anything between sticky or fixed. DESIGN.md, The Title Bars Follow Liquid Glass Rule calls a
   * bar what heads a surface and never scrolls with its content ("content
   * runs to the top edge and the scroll edge effect blurs it under the
   * controls"), so a `<header>` that
   * scrolls with a list or a card heads a group of that content (a list's
   * section, a card's question) and is no bar.
   */
  const scrollsWithContent = (el: Element): boolean => {
    for (let at: Element | null = el; at; at = at.parentElement) {
      if (/sticky|fixed/u.test(style(at).position)) {
        return false;
      }
      const up = at.parentElement;
      if (!up || up === document.body || up === document.documentElement) {
        break;
      }
      if (/auto|scroll/u.test(style(up).overflowY)) {
        return true;
      }
    }
    const root = [document.documentElement, document.body].map(
      (one) => style(one).overflowY
    );
    return !root.some((one) => /hidden|clip/u.test(one));
  };
  const held = [...scope.querySelectorAll(BAR)]
    .filter(shown)
    .filter((one) => one.matches(NAMED_BAR) || !scrollsWithContent(one));
  /** The surface a bar heads: its nearest layer or landmark. */
  const surfaceOf = (el: Element) =>
    el.parentElement?.closest(
      `${LAYER}, main, aside, section, article, [role="main"], [role="region"], [role="complementary"]`
    ) ?? scope;
  /**
   * A bar heads its surface (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule: "Every bar that heads a surface"): a `<header>` under another bar
   * of the same surface (a sheet's relay head under the sheet's own title
   * and Close) heads a group of that surface's content, and is no bar.
   */
  const underABar = (el: Element) => {
    if (el.matches(NAMED_BAR)) {
      return false;
    }
    const surface = surfaceOf(el);
    const { top } = el.getBoundingClientRect();
    return held.some(
      (other) =>
        other !== el &&
        !other.contains(el) &&
        !el.contains(other) &&
        surface.contains(other) &&
        surfaceOf(other) === surface &&
        !other.matches(FOOT) &&
        other.getBoundingClientRect().bottom <= top + 1
    );
  };
  const bars = held.filter((one) => !underABar(one));
  if (!skip.has("bar-ground")) {
    for (const bar of bars) {
      const p = paints(bar);
      if (p.length === 0) {
        continue;
      }
      const s = style(bar);
      // A foot heads nothing: the one hairline on its top edge parts it
      // from the content above (DESIGN.md, Borders are graded:
      // "`border-hairline` separates rows and regions").
      if (
        bar.matches(FOOT) &&
        p.length === 1 &&
        p[0]?.startsWith("border-top ") &&
        Number.parseFloat(s.borderTopWidth) <= 1
      ) {
        named.push(
          `a foot's hairline parting it from the content above (DESIGN.md, Borders are graded): ${describe(bar)}`
        );
        continue;
      }
      const r = bar.getBoundingClientRect();
      const bg = fill(s);
      const holdsTabs = bar.querySelector('[role="tablist"]');
      if (
        holdsTabs &&
        bg[3] > 0.02 &&
        Math.hypot(bg[0] - shelf[0], bg[1] - shelf[1], bg[2] - shelf[2]) < 4
      ) {
        named.push(
          `folder-tab shelf (DESIGN.md, Shapes, Folder tabs): ${describe(bar)} on surface-shelf`
        );
        continue;
      }
      const radius = Number.parseFloat(s.borderTopLeftRadius);
      const nested = bar.parentElement?.closest(BAR);
      if (
        (bar.matches('[role="toolbar"]') || nested) &&
        radius >= Math.min(r.height, r.width) / 2 - 1
      ) {
        named.push(
          `a group's capsule (Title Bars rule: Floating groups): ${describe(bar)}`
        );
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
      /** Words the edge runs through: some of them show, some are cut. */
      let cutThrough = false;
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
            cutThrough ||= tr.top < foot - 1;
          }
          if (clipsX && tr.right - end > Math.min(tr.width / 2, 16)) {
            right = Math.max(right, tr.right - end);
            cutThrough ||= tr.left < end - 1;
          }
        }
      }
      if (!(bottom > 0 || right > 0)) {
        continue;
      }
      // A control's summary of the layer it opens, dropping whole items
      // past its edge and cutting none (the usage strip's second account,
      // wrapped out of its one row): what it hides is a press away, and
      // nothing on the screen stands cut.
      const opener = el.closest(
        '[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded]'
      );
      if (!cutThrough && opener?.matches(CONTROL)) {
        named.push(
          `${describe(el)} drops whole items past its edge, cutting none, inside ${describe(opener)}, which opens them`
        );
        continue;
      }
      clipped.set(el, { bottom, right });
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
      // What the scroller holds past each edge, read off its elements'
      // boxes: an overflow a pseudo makes alone (a control's 44px
      // `touch-hit` area at a scroller's edge) hides nothing to scroll to.
      const reach = { top: 0, bottom: 0, left: 0, right: 0 };
      for (const one of sc.querySelectorAll("*")) {
        const or = one.getBoundingClientRect();
        if (or.width <= 0 || or.height <= 0) {
          continue;
        }
        reach.top = Math.max(reach.top, box.top - or.top);
        reach.bottom = Math.max(reach.bottom, or.bottom - box.bottom);
        reach.left = Math.max(reach.left, box.left - or.left);
        reach.right = Math.max(reach.right, or.right - box.right);
      }
      if (
        /auto|scroll/u.test(s.overflowY) &&
        sc.scrollHeight > sc.clientHeight + 1
      ) {
        if (sc.scrollTop > 1 && reach.top > 1) {
          cuts.push("top");
        }
        if (
          sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1 &&
          reach.bottom > 1
        ) {
          cuts.push("bottom");
        }
      }
      if (
        /auto|scroll/u.test(s.overflowX) &&
        sc.scrollWidth > sc.clientWidth + 1
      ) {
        const x = Math.abs(sc.scrollLeft);
        if (x > 1 && reach.left > 1) {
          cuts.push("left");
        }
        if (x + sc.clientWidth < sc.scrollWidth - 1 && reach.right > 1) {
          cuts.push("right");
        }
      }
      for (const side of cuts) {
        // A bar standing over the cut with its own scroll edge effect
        // (Title Bars rule, No bar ground: the content blurs under the bar):
        // what is hit over the cut, blurring or painting, or an overlay
        // that blurs it whether or not it takes presses (an edge effect is
        // `pointer-events: none`, HeadFade).
        const point = {
          top: [(box.left + box.right) / 2, box.top + 2],
          bottom: [(box.left + box.right) / 2, box.bottom - 2],
          left: [box.left + 2, (box.top + box.bottom) / 2],
          right: [box.right - 2, (box.top + box.bottom) / 2],
        }[side] as [number, number];
        /** The first box from `from` up to what holds the scroller that blurs, or (`painted`) paints, and is drawn. */
        const effectOver = (from: Element, painted: boolean) => {
          for (
            let u: Element | null = from;
            u && !u.contains(sc);
            u = u.parentElement
          ) {
            const us = style(u) as CSSStyleDeclaration & {
              webkitBackdropFilter?: string;
            };
            const blurs =
              (us.backdropFilter && us.backdropFilter !== "none") ||
              (us.webkitBackdropFilter && us.webkitBackdropFilter !== "none");
            if ((blurs || (painted && paints(u).length > 0)) && shown(u)) {
              return u;
            }
          }
          return null;
        };
        const hit = document.elementFromPoint(point[0], point[1]);
        let edge =
          hit && hit !== sc && !sc.contains(hit) ? effectOver(hit, true) : null;
        for (const above of edge ? [] : stackAt(point[0], point[1])) {
          if (above === sc || above.contains(sc)) {
            break;
          }
          edge = sc.contains(above) ? null : effectOver(above, false);
          if (edge) {
            break;
          }
        }
        // A floating bar's scroll edge effect over the cut (BarFloat's
        // HeadFade): it takes no press, so no hit test finds it.
        const scrollEdge = [
          ...document.querySelectorAll('[data-slot="head-fade"]'),
        ].find((one) => {
          const b = one.getBoundingClientRect();
          return (
            !sc.contains(one) &&
            (one.parentElement?.contains(sc) ?? false) &&
            point[0] >= b.left &&
            point[0] <= b.right &&
            point[1] >= b.top &&
            point[1] <= b.bottom
          );
        });
        if (scrollEdge) {
          named.push(
            `${describe(sc)}'s ${side} cut stands under ${describe(scrollEdge)}, the bar's scroll edge effect (Title Bars rule: No bar ground)`
          );
          continue;
        }
        if (edge) {
          named.push(
            `${describe(sc)}'s ${side} cut stands under ${describe(edge)}, its edge effect (Title Bars rule: No bar ground)`
          );
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
          // One mark per holder, kept for each of its cut edges. The peek
          // goes with it: a fade cut short (a tab strip's, kept off its
          // chosen tab) still leaves the peek's cue.
          const mark = Number(
            holder.getAttribute("data-check-mask") ?? edgesOut.length
          );
          holder.setAttribute("data-check-mask", String(mark));
          edgesOut.push({
            band,
            element: describe(sc),
            holder: mark,
            peek,
            side,
          });
          continue;
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
    /** Every element's place in the tree. */
    const treeOrder = new Map(
      [...document.querySelectorAll("*")].map((el, i) => [el, i] as const)
    );
    /** Each drawn svg of the scope, not inside another, with its box: what may paint a ground. */
    const svgGrounds = [...scope.querySelectorAll("svg")]
      .filter((svg) => !svg.parentElement?.closest("svg") && shown(svg))
      .map((svg) => ({ svg, r: svg.getBoundingClientRect() }));
    /** Whether `shape` (a geometry, or a `<use>` of one) fills the viewport point `x`, `y`. */
    const fillsAt = (shape: Element, x: number, y: number): boolean => {
      const href =
        shape instanceof SVGUseElement ? shape.href.baseVal : undefined;
      const target =
        href === undefined
          ? shape
          : document.getElementById(href.startsWith("#") ? href.slice(1) : "");
      const ctm = (shape as SVGGraphicsElement).getScreenCTM?.();
      if (!(target instanceof SVGGeometryElement && ctm)) {
        return false;
      }
      let at = new DOMPoint(x, y).matrixTransform(ctm.inverse());
      if (shape instanceof SVGUseElement) {
        at = new DOMPoint(
          at.x - shape.x.baseVal.value,
          at.y - shape.y.baseVal.value
        );
      }
      return target.isPointInFill(at);
    };
    /**
     * The svg shapes filled under `parent`'s words, at their middle: a
     * folder tab draws its sheet as one SVG path under its label
     * (fluid-tabs TabItem), the ground the label stands on, which no box's
     * background says. Read off the shapes' geometry, so a label scrolled
     * out of the screen is read too, and only of an svg drawn before the
     * words in the tree.
     */
    const shapesUnder = (parent: Element, rect: DOMRect | undefined) => {
      if (!rect) {
        return [];
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return svgGrounds
        .filter(
          ({ svg, r }) =>
            x >= r.left &&
            x <= r.right &&
            y >= r.top &&
            y <= r.bottom &&
            !svg.contains(parent) &&
            !parent.contains(svg) &&
            // Drawn before the words, so under them (a tab's sheet before
            // its hit); a glyph after them stands beside or over them.
            (treeOrder.get(svg) ?? 0) < (treeOrder.get(parent) ?? 0)
        )
        .flatMap(({ svg }) =>
          [
            ...svg.querySelectorAll(
              "path, rect, circle, ellipse, polygon, use"
            ),
          ].filter(
            (shape) =>
              !shape.closest("defs, mask, clipPath, pattern, symbol, marker") &&
              fillsAt(shape, x, y)
          )
        )
        .reverse();
    };
    /** A shape's fill as it reaches `up`: its colour at its fill-opacity and every opacity between; a paint server is an image. */
    const shapeFill = (shape: Element, up: Element): Rgba | "image" => {
      const cs = getComputedStyle(shape);
      if (cs.fill.includes("url(")) {
        return "image";
      }
      const c = rgba(cs.fill);
      let alpha = c[3] * (Number(cs.fillOpacity) || 0);
      for (
        let at: Element | null = shape;
        at && at !== up;
        at = at.parentElement
      ) {
        alpha *= Number(getComputedStyle(at).opacity);
      }
      return [c[0], c[1], c[2], alpha];
    };
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
      const shapes = shapesUnder(t.parent, t.rects[0]);
      const placed = new Set<Element>();
      for (let up: Element | null = t.parent; up; up = up.parentElement) {
        const s = style(up);
        opacity *= Number(s.opacity);
        if (s.backgroundImage.includes("url(")) {
          image = true;
          break;
        }
        // What an svg inside this box paints under the words stands over
        // the box's own fill.
        let solid = false;
        for (const shape of shapes) {
          if (placed.has(shape) || !up.contains(shape)) {
            continue;
          }
          placed.add(shape);
          const paint = shapeFill(shape, up);
          if (paint === "image") {
            image = true;
            break;
          }
          if (paint[3] > 0.02) {
            layers.push({ bg: paint, stops: [] });
            solid = paint[3] >= 0.99;
            if (solid) {
              break;
            }
          }
        }
        if (image || solid) {
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

  // ---- 11. the lines that are never intentional ----
  const inFlowBoxes = [...scope.querySelectorAll("*")].filter(
    (el) => !el.closest("svg") && shown(el)
  );
  /** Lays its children out one under another: a column, or a grid of one. */
  const isColumn = (el: Element) => {
    const s = style(el);
    if (s.display.includes("flex")) {
      return s.flexDirection.startsWith("column");
    }
    if (s.display.includes("grid")) {
      return s.gridTemplateColumns.split(" ").length < 2;
    }
    return s.display === "block" || s.display === "flow-root";
  };
  /** What a list's rows stand in: no landmark, nothing drawn cell by cell. */
  const listsRows = (el: Element) =>
    el.children.length >= 3 &&
    isColumn(el) &&
    !el.matches(
      'main, section, article, header, footer, form, table, [role="grid"]'
    ) &&
    !el.closest('table, [role="grid"]');

  // DESIGN.md, The Row Grid Rule: words on "one text column `space-3` after"
  // the mark, the last control on "one trailing edge `space-3` in from the
  // list's", held at the line words start to crowd it. Sideways only: a text
  // rect is the line's box, not its ink, so its top and foot carry the
  // leading and read short of what the eye sees.
  if (!skip.has("tight-inset")) {
    const told = new Set<Element>();
    for (const t of texts) {
      let owner: Element | null = t.parent;
      while (owner && scope.contains(owner) && paints(owner).length === 0) {
        owner = owner.parentElement;
      }
      if (!(owner && scope.contains(owner)) || told.has(owner)) {
        continue;
      }
      const s = style(owner);
      const r = owner.getBoundingClientRect();
      if (
        !(s.boxShadow !== "none" || edges(s).length > 0) ||
        Number.parseFloat(s.borderTopLeftRadius) < 6 ||
        r.width < 160 ||
        r.height < 48 ||
        owner.closest('[role="tablist"], [role="toolbar"]')
      ) {
        continue;
      }
      const left = Math.min(...t.rects.map((one) => one.left)) - r.left;
      const right = r.right - Math.max(...t.rects.map((one) => one.right));
      const near = [
        left >= 0 && left < 8 ? `${px(left)} from its left` : "",
        right >= 0 && right < 8 ? `${px(right)} from its right` : "",
      ].filter(Boolean);
      if (near.length > 0) {
        told.add(owner);
        say(
          "tight-inset",
          t.parent,
          `“${words(t.node.data)}” stands ${near.join(" and ")} in ${selectorOf(owner)}`
        );
      }
    }
  }

  // The Spacing ladder: `space-2` (7px) is the least a drawn button stands
  // under what is above it. The items of one list keep their own rhythm, and
  // a layer stands over what its button happens to line up with.
  if (!skip.has("tight-control")) {
    const above = inFlowBoxes
      .filter(
        (el) => paints(el).length > 0 || el.matches("input, textarea, select")
      )
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((one) => one.r.width >= 24 && one.r.height >= 12);
    for (const c of controls) {
      const r = c.getBoundingClientRect();
      if (
        !c.matches('button, [role="button"]') ||
        paints(c).length === 0 ||
        r.width < 24 ||
        r.height < 16
      ) {
        continue;
      }
      let worst: { el: Element; gap: number } | null = null;
      for (const { el, r: b } of above) {
        const gap = r.top - b.bottom;
        if (
          gap < -1 ||
          gap >= 7 ||
          Math.min(b.right, r.right) - Math.max(b.left, r.left) < 16 ||
          el.contains(c) ||
          c.contains(el) ||
          el.closest(LAYER) !== c.closest(LAYER) ||
          (el.parentElement === c.parentElement && el.tagName === c.tagName)
        ) {
          continue;
        }
        if (!worst || gap < worst.gap) {
          worst = { el, gap };
        }
      }
      if (worst) {
        say(
          "tight-control",
          c,
          `${px(worst.gap)} under ${describe(worst.el)}, under the 7px of space-2`
        );
      }
    }
  }

  // DESIGN.md, The Row Grid Rule: the trailing edge "drawn in ink". A drawn
  // row its children fill keeps one inset at both ends, read in ink: a child
  // that draws nothing of its own (a ghost control, a layout wrapper round
  // one) ends where its words, glyphs and painted boxes end, not at its
  // padding. A wrapper read by its box stood at the row's edge, ink at 0,
  // whatever it held. A row whose children stop
  // short of its padding on a side (a tab strip with room after its last
  // tab) has free space there, and is a layout.
  //
  // The rule is a row's: its mark, its words and its last control stand in
  // flow, one after another. A track (a timeline's lane, a ruler, a
  // meter) draws only what is placed by position (out of flow, at a time or
  // a value on its scale): its gaps are a delay or room left on the scale,
  // not an inset, and a box holding one is a plot, never read. On the
  // Animation face every lane and its ruler read as uneven rows, 290 times.
  if (!skip.has("uneven-inset")) {
    /** Whether `node`, inside `el`, is placed out of flow: it or a box between it and `el` stands absolute or fixed. */
    const placedWithin = (node: Element, el: Element): boolean => {
      for (
        let at: Element | null = node;
        at && at !== el;
        at = at.parentElement
      ) {
        if (/absolute|fixed/u.test(style(at).position)) {
          return true;
        }
      }
      return false;
    };
    /**
     * What `el` draws, sideways: its box when it paints, else (a ghost, a
     * wrapper) its words, glyphs and painted boxes inside; and whether it is
     * a track, everything it draws inside placed out of flow.
     */
    const inkOf = (
      el: Element
    ): { left: number; right: number; track: boolean } => {
      const box = el.getBoundingClientRect();
      if (paints(el).length > 0) {
        return { left: box.left, right: box.right, track: false };
      }
      let left = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let inFlow = false;
      let placed = false;
      const take = (one: { left: number; right: number }, at: Element) => {
        left = Math.min(left, one.left);
        right = Math.max(right, one.right);
        if (placedWithin(at, el)) {
          placed = true;
        } else {
          inFlow = true;
        }
      };
      for (const t of texts) {
        const at = t.node.parentElement;
        if (at && el.contains(t.node)) {
          for (const one of t.rects) {
            take(one, at);
          }
        }
      }
      for (const one of el.querySelectorAll("*")) {
        if (
          shown(one) &&
          !one.parentElement?.closest("svg") &&
          (one.matches("svg, img, canvas, video") || paints(one).length > 0)
        ) {
          take(one.getBoundingClientRect(), one);
        }
      }
      return Number.isFinite(left)
        ? { left, right, track: placed && !inFlow }
        : { left: box.left, right: box.right, track: false };
    };
    for (const row of inFlowBoxes) {
      const r = row.getBoundingClientRect();
      if (
        row.children.length < 2 ||
        r.width < 120 ||
        r.height < 24 ||
        r.height > 80 ||
        paints(row).length === 0 ||
        row.matches("table, thead, tbody, tr")
      ) {
        continue;
      }
      const kids = [...row.children]
        .filter(
          (kid) => shown(kid) && !/absolute|fixed/u.test(style(kid).position)
        )
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((kid) => kid.r.width >= 6 && kid.r.height >= 6);
      if (kids.length < 2) {
        continue;
      }
      const mids = kids.map((kid) => (kid.r.top + kid.r.bottom) / 2);
      if (Math.max(...mids) - Math.min(...mids) > 8) {
        continue;
      }
      const rs = style(row);
      const contentLeft =
        r.left +
        Number.parseFloat(rs.borderLeftWidth) +
        Number.parseFloat(rs.paddingLeft);
      const contentRight =
        r.right -
        Number.parseFloat(rs.borderRightWidth) -
        Number.parseFloat(rs.paddingRight);
      const reachLeft = Math.min(
        ...kids.map(
          (kid) => kid.r.left - Number.parseFloat(style(kid.el).marginLeft)
        )
      );
      const reachRight = Math.max(
        ...kids.map(
          (kid) => kid.r.right + Number.parseFloat(style(kid.el).marginRight)
        )
      );
      if (reachLeft - contentLeft > 1 || contentRight - reachRight > 1) {
        continue;
      }
      const ink = kids.map((kid) => inkOf(kid.el));
      if (ink.some((one) => one.track)) {
        continue;
      }
      const first = Math.min(...ink.map((one) => one.left));
      const last = Math.max(...ink.map((one) => one.right));
      const leftIn = first - r.left;
      const rightIn = r.right - last;
      const lo = Math.min(leftIn, rightIn);
      const hi = Math.max(leftIn, rightIn);
      if (hi >= 16 && lo >= 0 && lo < hi * 0.55 && hi - lo >= 6) {
        say(
          "uneven-inset",
          row,
          `holds its children ${px(leftIn)} from its left and ${px(rightIn)} from its right, in ink`
        );
      }
    }
  }

  // Density (a 44px row pitch), read off the list's own rows: a one-line row
  // grown over its words and a list stretched to fill its pane.
  if (!(skip.has("fat-row") && skip.has("loose-list"))) {
    for (const list of inFlowBoxes) {
      if (!listsRows(list)) {
        continue;
      }
      const rows = [...list.children]
        .filter(shown)
        .map((el) => ({ el, r: el.getBoundingClientRect() }));
      if (!skip.has("fat-row")) {
        /**
         * The margins a row that draws nothing keeps inside it, above its
         * first child and under its last, through the wrappers that hold
         * one child each: a list's spacing (a tool group's room above it,
         * held in by its row's `flow-root`), not the row's height.
         */
        const marginsInside = (row: Element): number => {
          let at: Element = row;
          for (let n = 0; n < 4 && paints(at).length === 0; n += 1) {
            const box = at.getBoundingClientRect();
            const inside = [...at.children]
              .filter(shown)
              .map((kid) => ({ kid, b: kid.getBoundingClientRect() }));
            if (inside.length === 0) {
              return 0;
            }
            const as = style(at);
            const top = Math.min(...inside.map((one) => one.b.top));
            const bottom = Math.max(...inside.map((one) => one.b.bottom));
            const head = inside.find((one) => one.b.top === top);
            const foot = inside.find((one) => one.b.bottom === bottom);
            const above = Math.min(
              top -
                box.top -
                Number.parseFloat(as.borderTopWidth) -
                Number.parseFloat(as.paddingTop),
              Number.parseFloat(head ? style(head.kid).marginTop : "0")
            );
            const below = Math.min(
              box.bottom -
                bottom -
                Number.parseFloat(as.borderBottomWidth) -
                Number.parseFloat(as.paddingBottom),
              Number.parseFloat(foot ? style(foot.kid).marginBottom : "0")
            );
            const kept = Math.max(0, above) + Math.max(0, below);
            if (kept > 0.5 || inside.length !== 1) {
              return kept;
            }
            at = (inside[0] as { kid: Element }).kid;
          }
          return 0;
        };
        // A list's rows are alike: the children of its most common kind (a
        // column of a bench's pane groups, its dials and its rail is a
        // layout, not a list).
        const kindOf = (el: Element) =>
          `${el.tagName}[${el.getAttribute("data-slot") ?? ""}]`;
        const kinds = new Map<string, number>();
        for (const { el } of rows) {
          kinds.set(kindOf(el), (kinds.get(kindOf(el)) ?? 0) + 1);
        }
        const [kind] =
          [...kinds.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        const wide = rows.filter(
          (one) =>
            kindOf(one.el) === kind && one.r.height >= 16 && one.r.width >= 120
        );
        const fat = wide.flatMap(({ el, r }) => {
          // A field (its label over its control) is no one-line row: a
          // select's words are its options', drawn in no line of the row.
          if (
            el.querySelector(
              'textarea, input, select, [role="combobox"], img, canvas'
            )
          ) {
            return [];
          }
          // A pane laid out in a page's column (its scroller holding the
          // page's content) is a region, no row: its one line is the
          // little its content says, not a row grown over its words.
          if (
            [el, ...el.querySelectorAll("*")].some((one) =>
              /^(auto|scroll)$/u.test(style(one).overflowY)
            )
          ) {
            return [];
          }
          // A row that draws nothing ends where its children do: a margin
          // a child keeps inside it (a tool group's space above it, held in
          // by its row's `flow-root`) is the list's spacing, not its height.
          const h = r.height - marginsInside(el);
          if (h <= 48) {
            return [];
          }
          const runs = texts.filter((t) => el.contains(t.node));
          const tops = new Set(
            runs.flatMap((t) => t.rects.map((one) => Math.round(one.top / 6)))
          );
          if (runs.length === 0 || tops.size > 1) {
            return [];
          }
          const size = Math.max(
            ...runs.map((t) => Number.parseFloat(style(t.parent).fontSize))
          );
          return h > size * 3.4 ? [{ el, h, size }] : [];
        });
        const [worst] = fat.sort((a, b) => b.h - a.h);
        if (worst && wide.length >= 3 && fat.length >= 2) {
          say(
            "fat-row",
            worst.el,
            `${px(worst.h)} tall for one ${px(worst.size)} line, ${fat.length} of ${wide.length} rows in ${selectorOf(list)}`
          );
        }
      }
      if (!skip.has("loose-list")) {
        const ordered = rows.map((one) => one.r).sort((a, b) => a.top - b.top);
        const isAlike = (r: DOMRect) =>
          r.height >= 14 && r.height <= 64 && r.width >= 100;
        const alike = ordered.filter(isAlike);
        const hs = alike.map((r) => r.height);
        const ws = alike.map((r) => r.width);
        // The air between two alike rows standing next to each other: a
        // taller row between them (a transcript's turn between its tool
        // rows) is a row, not air.
        const gaps = ordered.slice(1).flatMap((r, i) => {
          const before = ordered[i] as DOMRect;
          return isAlike(r) && isAlike(before) ? [r.top - before.bottom] : [];
        });
        // A virtual list places its rows itself (virtua's absolute items):
        // what stands between two drawn rows is rows not drawn yet.
        const placed = rows.some(
          (one) => style(one.el).position === "absolute"
        );
        if (
          !placed &&
          gaps.length >= 2 &&
          Math.max(...hs) <= Math.min(...hs) * 1.5 &&
          Math.max(...ws) <= Math.min(...ws) * 1.3
        ) {
          const mid = (of: number[]) =>
            [...of].sort((a, b) => a - b)[Math.floor(of.length / 2)] ?? 0;
          const gap = mid(gaps);
          const h = mid(hs);
          if (gap > Math.max(24, h)) {
            say(
              "loose-list",
              list,
              `rows ${px(gap)} apart for ${px(h)} of row`
            );
          }
        }
      }
    }
  }

  // The Empty Starts Work and The Claim Of Nothing: empty, a pane says why
  // and offers the work; loading, a skeleton stands in. A pane with nothing
  // in it at all is neither. A short list over free space is a layout, held
  // to at one item and many, so only the pane with nothing is read. An
  // editor is a field (its `contenteditable`, its placeholder a pseudo's).
  if (!skip.has("empty-pane")) {
    const panes = [
      ...scope.querySelectorAll(
        'main, aside, section, [role="main"], [role="complementary"], [role="region"], [role="tabpanel"], [data-slot$="pane"]'
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return shown(el) && r.height >= 120 && r.width >= 80;
    });
    const holds = (el: Element) =>
      visibleWords(el).length > 0 ||
      style(el).backgroundImage.includes("url(") ||
      [...el.querySelectorAll("*")].some(
        (one) =>
          shown(one) &&
          (one.matches(
            `svg, img, canvas, video, iframe, object, embed, ${CONTROL}, [contenteditable]:not([contenteditable="false"])`
          ) ||
            one.shadowRoot !== null ||
            (one.children.length === 0 && paints(one).length > 0))
      );
    const bare = panes.filter((el) => !holds(el));
    for (const pane of bare) {
      if (!bare.some((one) => one !== pane && pane.contains(one))) {
        const r = pane.getBoundingClientRect();
        say(
          "empty-pane",
          pane,
          `${px(r.width)}×${px(r.height)} with no word, mark, control or drawn block in it`
        );
      }
    }
  }

  // The Solar Duotone Rule: each glyph is drawn on its grid and shows whole.
  // A scroller's cut is content to scroll to, and hidden-cue's to read.
  const glyphs = [...scope.querySelectorAll("svg")].filter(
    (svg) =>
      !svg.parentElement?.closest("svg") &&
      shown(svg) &&
      svg.getBoundingClientRect().width >= 8 &&
      svg.getBoundingClientRect().width <= 160 &&
      svg.getBoundingClientRect().height <= 160
  );
  if (!skip.has("clipped-glyph")) {
    for (const svg of glyphs) {
      const vb = svg.viewBox?.baseVal;
      const shape = svg.querySelector(
        "path, circle, rect, line, polyline, polygon, ellipse"
      );
      let past = 0;
      if (vb && vb.width > 0 && shape && style(svg).overflow !== "visible") {
        try {
          const b = svg.getBBox();
          past =
            b.width > 0
              ? Math.max(
                  vb.x - b.x,
                  vb.y - b.y,
                  b.x + b.width - (vb.x + vb.width),
                  b.y + b.height - (vb.y + vb.height)
                )
              : 0;
        } catch {
          past = 0;
        }
      }
      const stroke = shape
        ? Number.parseFloat(getComputedStyle(shape).strokeWidth) || 0
        : 0;
      if (past > stroke / 2 + 0.25) {
        say(
          "clipped-glyph",
          svg,
          `draws ${past.toFixed(1)} units past its viewBox`
        );
        continue;
      }
      const r = svg.getBoundingClientRect();
      for (
        let up = svg.parentElement;
        up && scope.contains(up) && up !== scope;
        up = up.parentElement
      ) {
        const s = style(up);
        const c = up.getBoundingClientRect();
        const cuts = [
          /hidden|clip/u.test(s.overflowX) && r.left < c.left - 0.5
            ? `${px(c.left - r.left)} at its left`
            : "",
          /hidden|clip/u.test(s.overflowX) && r.right > c.right + 0.5
            ? `${px(r.right - c.right)} at its right`
            : "",
          /hidden|clip/u.test(s.overflowY) && r.top < c.top - 0.5
            ? `${px(c.top - r.top)} at its top`
            : "",
          /hidden|clip/u.test(s.overflowY) && r.bottom > c.bottom + 0.5
            ? `${px(r.bottom - c.bottom)} at its foot`
            : "",
        ].filter(Boolean);
        const gone =
          r.right <= c.left ||
          r.left >= c.right ||
          r.bottom <= c.top ||
          r.top >= c.bottom;
        if (gone || /auto|scroll/u.test(s.overflowX + s.overflowY)) {
          break;
        }
        if (cuts.length > 0) {
          say(
            "clipped-glyph",
            svg,
            `cut by ${selectorOf(up)}: ${cuts.join(", ")}`
          );
          break;
        }
      }
    }
  }

  // The Solar Duotone Rule: marks wear bold-duotone, and chevrons, arrows,
  // Close, Plus, Tick and Minus are open linear strokes "because they are
  // glyphs, not marks". An outlined mark is a stroke that closes a shape.
  if (!skip.has("mixed-icons")) {
    const faceOf = (
      svg: SVGSVGElement
    ): "filled" | "outlined" | "glyph" | null => {
      let filled = 0;
      let stroked = 0;
      let closed = false;
      /** Drawn: nothing between it and its svg hides it (a task ring's check waits at opacity 0). */
      const drawn = (shape: Element) => {
        for (
          let at: Element | null = shape;
          at && at !== svg;
          at = at.parentElement
        ) {
          const cs = getComputedStyle(at);
          if (cs.display === "none" || Number(cs.opacity) === 0) {
            return false;
          }
        }
        return true;
      };
      const shapes = [
        ...svg.querySelectorAll(
          "path, rect, circle, ellipse, polygon, line, polyline"
        ),
      ].filter(
        (shape) =>
          !shape.closest("defs, mask, clipPath, pattern, symbol") &&
          drawn(shape)
      );
      // A ring: circles on one centre, stroked and unfilled, a track and its
      // arc. A figure (DESIGN.md, Task ring: "wound from the top as a clock
      // is read"; Spinner: "a 16px ring with a quarter arc"), not a mark.
      const circles = shapes.filter(
        (one): one is SVGCircleElement => one instanceof SVGCircleElement
      );
      if (
        circles.length > 0 &&
        circles.length === shapes.length &&
        circles.every((one) => {
          const cs = getComputedStyle(one);
          const first = circles[0] as SVGCircleElement;
          return (
            (cs.fill === "none" || rgba(cs.fill)[3] === 0) &&
            cs.stroke !== "none" &&
            Math.abs(one.cx.baseVal.value - first.cx.baseVal.value) < 0.5 &&
            Math.abs(one.cy.baseVal.value - first.cy.baseVal.value) < 0.5
          );
        })
      ) {
        return null;
      }
      for (const shape of shapes) {
        const s = getComputedStyle(shape);
        const hasFill = s.fill !== "none" && rgba(s.fill)[3] > 0;
        const hasStroke =
          s.stroke !== "none" && Number.parseFloat(s.strokeWidth) > 0;
        if (hasStroke && !hasFill) {
          stroked += 1;
          closed ||=
            shape.matches("rect, circle, ellipse, polygon") ||
            /z/iu.test(shape.getAttribute("d") ?? "");
        } else if (hasFill && !hasStroke) {
          filled += 1;
        }
      }
      if (filled > 0 && stroked === 0) {
        return "filled";
      }
      if (stroked > 0 && filled === 0) {
        return closed ? "outlined" : "glyph";
      }
      return null;
    };
    const holders = [
      ...scope.querySelectorAll(
        `${BAR}, nav, [role="tablist"], [role="list"], ul`
      ),
    ].filter(shown);
    for (const holder of holders) {
      const faces = glyphs
        .filter((svg) => holder.contains(svg))
        .filter((svg) => svg.getBoundingClientRect().width <= 32)
        .map((svg) => ({ svg, face: faceOf(svg) }));
      const outlined = faces.filter((one) => one.face === "outlined");
      const filled = faces.filter((one) => one.face === "filled");
      const [first] = outlined;
      if (first && filled.length > 0) {
        say(
          "mixed-icons",
          first.svg,
          `${outlined.length} outlined beside ${filled.length} filled in ${selectorOf(holder)}`
        );
      }
    }
  }

  // DESIGN.md's dense roles "are already the smallest that reads" (meta,
  // 12px). As drawn, through any scale; one or two letters are a mark.
  if (!skip.has("small-text") && window.innerWidth < 600) {
    const told = new Set<Element>();
    for (const t of texts) {
      if (told.has(t.parent) || t.node.data.trim().length <= 2) {
        continue;
      }
      const own = t.parent as HTMLElement;
      const scale =
        own.offsetWidth > 0
          ? own.getBoundingClientRect().width / own.offsetWidth
          : 1;
      const size = Number.parseFloat(style(t.parent).fontSize) * scale;
      if (size < 10) {
        told.add(t.parent);
        say(
          "small-text",
          t.parent,
          `“${words(t.node.data)}” drawn at ${px(size)} on a ${window.innerWidth}px screen`
        );
      }
    }
  }

  // ---- 12. the drawn contour: what a box draws past its edge, and its corners ----
  /** A box as drawn, in the viewport: its edges, and each corner's radii [x, y] (top-left, top-right, bottom-right, bottom-left). */
  interface Contour {
    bottom: number;
    left: number;
    r: [number, number][];
    right: number;
    top: number;
  }
  const CORNERS = [
    "top-left",
    "top-right",
    "bottom-right",
    "bottom-left",
  ] as const;
  const num = (value: string) => Number.parseFloat(value) || 0;
  /** How much larger than its CSS px the page draws `el` (a scaled canvas). */
  const scaleOf = (el: Element) => {
    const w = el instanceof HTMLElement ? el.offsetWidth : 0;
    return w > 0 ? el.getBoundingClientRect().width / w : 1;
  };
  /**
   * A box's used corner radii, drawn w×h at `scale`: a percentage of the
   * side it runs along, and every radius scaled down where two meet past a
   * side (CSS Backgrounds 3 §4.5: "Let f = min(Li/Si) … If f < 1, then all
   * corner radii are reduced by multiplying them by f").
   */
  const radiiOf = (
    s: CSSStyleDeclaration,
    w: number,
    h: number,
    scale: number
  ): [number, number][] => {
    const raw = CORNERS.map((corner): [number, number] => {
      const [x = "0px", y = x] = s
        .getPropertyValue(`border-${corner}-radius`)
        .trim()
        .split(/\s+/u);
      const len = (value: string, whole: number) =>
        value.endsWith("%") ? (num(value) / 100) * whole : num(value) * scale;
      return [len(x, w), len(y, h)];
    });
    const [tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0]] = raw;
    const f = Math.min(
      1,
      w / (tl[0] + tr[0]),
      w / (bl[0] + br[0]),
      h / (tl[1] + bl[1]),
      h / (tr[1] + br[1])
    );
    return raw.map(([x, y]) => [x * f, y * f]);
  };
  const contours = new Map<Element, Contour>();
  /** An element's border box and its corners, as drawn. */
  const contourOf = (el: Element): Contour => {
    const known = contours.get(el);
    if (known) {
      return known;
    }
    const b = el.getBoundingClientRect();
    const c = {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      r: radiiOf(style(el), b.width, b.height, scaleOf(el)),
    };
    contours.set(el, c);
    return c;
  };
  const rounded = (c: Contour) => c.r.some(([x, y]) => x > 0.5 && y > 0.5);
  /**
   * A contour grown by `by` on every side (shrunk where negative), its
   * corners as a spread shadow's: "increased … by adding … the spread
   * distance (and flooring at zero)", the spread first "multiplied by the
   * proportion 1 + (r-1)^3" where the radius is under it (CSS Backgrounds 3
   * §6.1.1); an overflow clip edge's corners take the same shape (CSS
   * Overflow 3 §3.2), and an outline's follow its box's radius out.
   */
  const grown = (c: Contour, by: number): Contour => {
    const radius = (r: number) => {
      if (by < 0) {
        return Math.max(0, r + by);
      }
      const share = r / by;
      return r + (share < 1 ? by * (1 + (share - 1) ** 3) : by);
    };
    return {
      left: c.left - by,
      top: c.top - by,
      right: c.right + by,
      bottom: c.bottom + by,
      r: c.r.map(([x, y]) => [radius(x), radius(y)]),
    };
  };
  const shifted = (c: Contour, x: number, y: number): Contour => ({
    ...c,
    left: c.left + x,
    right: c.right + x,
    top: c.top + y,
    bottom: c.bottom + y,
  });
  /**
   * Points along a contour's edge: each corner's curve in five steps (its
   * corner point where square). A contour is convex, so its straight runs
   * lie between them.
   */
  const rimOf = (c: Contour): [number, number][] =>
    (
      [
        [c.left, c.top, 1, 1, 180],
        [c.right, c.top, -1, 1, 270],
        [c.right, c.bottom, -1, -1, 0],
        [c.left, c.bottom, 1, -1, 90],
      ] as const
    ).flatMap(([x, y, sx, sy, from], i) => {
      const [rx, ry] = c.r[i] ?? [0, 0];
      return [0, 1, 2, 3, 4].map((k): [number, number] => {
        const t = ((from + k * 22.5) * Math.PI) / 180;
        return [x + sx * rx + rx * Math.cos(t), y + sy * ry + ry * Math.sin(t)];
      });
    });
  /** How far a point stands outside a contour (0 or less inside), and where: past a side, or round a corner's curve. */
  const pastOf = (
    [x, y]: [number, number],
    c: Contour
  ): { by: number; where: string } => {
    for (let i = 0; i < 4; i += 1) {
      const [rx, ry] = c.r[i] ?? [0, 0];
      const left = i === 0 || i === 3;
      const top = i < 2;
      const cx = left ? c.left + rx : c.right - rx;
      const cy = top ? c.top + ry : c.bottom - ry;
      if (
        rx > 0.01 &&
        ry > 0.01 &&
        (left ? x < cx : x > cx) &&
        (top ? y < cy : y > cy)
      ) {
        return {
          by: (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * ((rx + ry) / 2),
          where: `${CORNERS[i]} corner`,
        };
      }
    }
    const sides: [string, number][] = [
      ["left", c.left - x],
      ["right", x - c.right],
      ["top", c.top - y],
      ["bottom", y - c.bottom],
    ];
    const [where, by] = sides.reduce((a, b) => (b[1] > a[1] ? b : a));
    return { by, where };
  };
  /** The farthest `inner`'s edge stands outside `outer`, and where. */
  const spillOf = (inner: Contour, outer: Contour) =>
    rimOf(inner)
      .map((p) => pastOf(p, outer))
      .reduce((a, b) => (b.by > a.by ? b : a));
  /**
   * The hard outer shadows a style casts (blur under 1px: a ring, or a line
   * a shadow draws), each by its offsets and spread; a blurred one is an
   * elevation, and fades as it goes.
   */
  const hardShadows = (value: string) =>
    value === "none"
      ? []
      : layersOf(value).flatMap((one) => {
          const colour = one.match(COLOR_FN)?.[0];
          if (/\binset\b/u.test(one) || (colour && rgba(colour)[3] <= 0.02)) {
            return [];
          }
          const [x = 0, y = 0, blur = 0, spread = 0] = (
            one.replace(COLOR_FN, "").match(/-?[\d.]+px/gu) ?? []
          ).map(num);
          return blur < 1 ? [{ x, y, blur, spread }] : [];
        });
  /**
   * What a style draws past its box's border edge, each as a contour: its
   * outline, "drawn starting just outside the border edge" and offset from
   * it by `outline-offset` (CSS UI 4 §3.5; a negative offset draws it
   * inside), and its hard outer shadows, "drawn outside the border edge
   * only", grown by their spread and moved by their offsets (CSS
   * Backgrounds 3 §6.1.1).
   */
  const reachOf = (
    s: CSSStyleDeclaration,
    own: Contour,
    scale: number
  ): { c: Contour; what: string }[] => {
    const out: { c: Contour; what: string }[] = [];
    const width = num(s.outlineWidth);
    if (
      s.outlineStyle !== "none" &&
      width > 0 &&
      rgba(s.outlineColor)[3] > 0.02
    ) {
      out.push({
        what: `outline (${s.outlineWidth} ${s.outlineStyle}, offset ${s.outlineOffset})`,
        c: grown(own, (num(s.outlineOffset) + width) * scale),
      });
    }
    for (const one of hardShadows(s.boxShadow)) {
      out.push({
        what: `box-shadow ring (${px(one.x)} ${px(one.y)} ${px(one.blur)} ${px(one.spread)})`,
        c: shifted(
          grown(own, one.spread * scale),
          one.x * scale,
          one.y * scale
        ),
      });
    }
    return out.filter((one) => spillOf(one.c, own).by > 0.5);
  };
  /** A style's dashed or dotted edges: one border when all four are alike, else by side. */
  const brokenEdges = (s: CSSStyleDeclaration): string[] => {
    const said = (["top", "right", "bottom", "left"] as const)
      .filter(
        (side) =>
          /dashed|dotted/u.test(s.getPropertyValue(`border-${side}-style`)) &&
          num(s.getPropertyValue(`border-${side}-width`)) > 0 &&
          rgba(s.getPropertyValue(`border-${side}-color`))[3] > 0.02
      )
      .map((side) => ({
        side,
        how: `${s.getPropertyValue(`border-${side}-width`)} ${s.getPropertyValue(`border-${side}-style`)}`,
      }));
    return said.length === 4 && said.every((one) => one.how === said[0]?.how)
      ? [`border ${said[0]?.how}`]
      : said.map((one) => `border-${one.side} ${one.how}`);
  };
  /**
   * Whether a box makes the containing block of the boxes placed in it
   * (CSS Position 3 §2.1: "Properties that can cause a box to establish an
   * absolute positioning containing block include position, transform,
   * will-change, contain…"); for fixed boxes, position alone does not.
   */
  const placesIn = (s: CSSStyleDeclaration, fixed: boolean) =>
    s.display !== "contents" &&
    ((!fixed && s.position !== "static") ||
      [
        s.transform,
        s.translate,
        s.scale,
        s.rotate,
        s.perspective,
        s.filter,
        s.backdropFilter,
      ].some((one) => one && one !== "none") ||
      /layout|paint|strict|content/u.test(s.contain) ||
      Boolean(s.containerType && s.containerType !== "normal") ||
      /transform|perspective|filter/u.test(s.willChange) ||
      (!fixed && /position/u.test(s.willChange)));
  /** The box a box placed absolutely (or fixed) in `from` is placed in: `from` or an ancestor; null for the initial containing block. */
  const holderOf = (from: Element | null, fixed = false): Element | null => {
    for (
      let up = from;
      up && up !== document.documentElement;
      up = up.parentElement
    ) {
      if (placesIn(style(up), fixed)) {
        return up;
      }
    }
    return null;
  };
  /**
   * Where a box cuts what it holds: its padding box, "rounded based on the
   * border radius, adjusted to the padding edge" (CSS Overflow 3 §3.1.2),
   * that radius "the outer border radius minus the corresponding border
   * thickness" (CSS Backgrounds 3 §4.2); an axis it does not clip runs on,
   * and a clip on one axis alone "is not rounded". Null when it clips nothing.
   */
  const clipOf = (el: Element): Contour | null => {
    const s = style(el);
    const cx = s.overflowX !== "visible";
    const cy = s.overflowY !== "visible";
    if (!(cx || cy)) {
      return null;
    }
    const own = contourOf(el);
    const k = scaleOf(el);
    const [t, r, b, l] = [
      s.borderTopWidth,
      s.borderRightWidth,
      s.borderBottomWidth,
      s.borderLeftWidth,
    ].map((one) => num(one) * k) as [number, number, number, number];
    const both = cx && cy;
    const cut: Contour = {
      left: cx ? own.left + l : Number.NEGATIVE_INFINITY,
      right: cx ? own.right - r : Number.POSITIVE_INFINITY,
      top: cy ? own.top + t : Number.NEGATIVE_INFINITY,
      bottom: cy ? own.bottom - b : Number.POSITIVE_INFINITY,
      r: own.r.map(([x, y], i): [number, number] =>
        both
          ? [
              Math.max(0, x - (i === 0 || i === 3 ? l : r)),
              Math.max(0, y - (i < 2 ? t : b)),
            ]
          : [0, 0]
      ),
    };
    // `overflow: clip` paints out to its overflow-clip-margin (CSS Overflow 3 §3.2).
    const margin = num(s.overflowClipMargin ?? "0px") * k;
    return s.overflowX === "clip" && s.overflowY === "clip" && margin > 0
      ? grown(cut, margin)
      : cut;
  };
  /**
   * The nearest box that cuts what a box placed `position` in `from` draws:
   * a placed box escapes the clip of every box between it and its
   * containing block (CSS 2.1 §11.1.1), so the walk goes by containing
   * blocks; up to the scope, and not the root's (the screen's edge is
   * `overflow`'s).
   */
  const cutterOf = (from: Element | null, position: string): Element | null => {
    let pos = position;
    for (let up = from; up;) {
      let next: Element | null = up;
      if (pos === "absolute") {
        next = holderOf(up);
      } else if (pos === "fixed") {
        next = holderOf(up, true);
      }
      if (
        !next ||
        next === document.body ||
        next === document.documentElement ||
        !scope.contains(next)
      ) {
        return null;
      }
      if (clipOf(next)) {
        return next;
      }
      pos = style(next).position;
      up = next.parentElement;
    }
    return null;
  };
  const pseudoStyles = new Map<
    Element,
    Partial<Record<"::before" | "::after", CSSStyleDeclaration | null>>
  >();
  /** A pseudo-element of `el` that makes a box, absolutely placed and shown: its style, else null. */
  const pseudoOf = (
    el: Element,
    which: "::before" | "::after"
  ): CSSStyleDeclaration | null => {
    const known = pseudoStyles.get(el) ?? {};
    pseudoStyles.set(el, known);
    const kept = known[which];
    if (kept !== undefined) {
      return kept;
    }
    const ps = getComputedStyle(el, which);
    const made =
      ps.content !== "none" &&
      ps.content !== "normal" &&
      ps.display !== "none" &&
      ps.visibility === "visible" &&
      Number(ps.opacity) > 0 &&
      ps.position === "absolute";
    known[which] = made ? ps : null;
    return known[which] ?? null;
  };
  /**
   * Where an absolutely placed pseudo-element of `el` is drawn: its
   * resolved offsets and size (CSSOM: a placed box's are its used values)
   * from its containing block's padding edge (CSS Position 3 §2.1), then its
   * own translate, scale and transform about its origin (CSS Transforms 2
   * §6). Null where one did not resolve to px.
   */
  const pseudoBox = (el: Element, ps: CSSStyleDeclaration): Contour | null => {
    if (
      ![ps.left, ps.top, ps.width, ps.height].every((one) => one.endsWith("px"))
    ) {
      return null;
    }
    const holder = holderOf(el);
    const hs = holder ? style(holder) : null;
    const k = holder ? scaleOf(holder) : 1;
    const root = document.documentElement;
    const hb = holder
      ? holder.getBoundingClientRect()
      : {
          left: -window.scrollX,
          top: -window.scrollY,
          right: root.clientWidth - window.scrollX,
        };
    const edge = (side: string) =>
      (hs ? num(hs.getPropertyValue(`border-${side}-width`)) : 0) * k;
    let w = num(ps.width);
    let h = num(ps.height);
    if (ps.boxSizing !== "border-box") {
      w +=
        num(ps.paddingLeft) +
        num(ps.paddingRight) +
        num(ps.borderLeftWidth) +
        num(ps.borderRightWidth);
      h +=
        num(ps.paddingTop) +
        num(ps.paddingBottom) +
        num(ps.borderTopWidth) +
        num(ps.borderBottomWidth);
    }
    const rtl =
      style(holder ?? root).direction === "rtl" && ps.right.endsWith("px");
    const x = rtl
      ? hb.right - edge("right") - (num(ps.right) + num(ps.marginRight) + w) * k
      : hb.left + edge("left") + (num(ps.left) + num(ps.marginLeft)) * k;
    const y = hb.top + edge("top") + (num(ps.top) + num(ps.marginTop)) * k;
    const [ox = w / 2, oy = h / 2] = ps.transformOrigin.split(/\s+/u).map(num);
    const m = ps.transform.match(/^matrix(3d)?\((.+)\)$/u);
    const v = m?.[2]?.split(",").map(Number) ?? [];
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = m?.[1]
      ? [v[0], v[1], v[4], v[5], v[12], v[13]]
      : v;
    const [tx = "0px", ty = "0px"] =
      ps.translate === "none" ? [] : ps.translate.split(/\s+/u);
    const [sx = 1, sy = sx] =
      ps.scale === "none" ? [] : ps.scale.split(/\s+/u).map(Number);
    const along = (value: string, whole: number) =>
      value.endsWith("%") ? (num(value) / 100) * whole : num(value);
    const corners = (
      [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ] as const
    ).map(([cx, cy]) => {
      const qx = cx - ox;
      const qy = cy - oy;
      return [
        ox + along(tx, w) + sx * (a * qx + c * qy + e),
        oy + along(ty, h) + sy * (b * qx + d * qy + f),
      ] as const;
    });
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return {
      left: x + Math.min(...xs) * k,
      right: x + Math.max(...xs) * k,
      top: y + Math.min(...ys) * k,
      bottom: y + Math.max(...ys) * k,
      r: radiiOf(ps, w * k, h * k, k).map(([rx, ry]) => [
        rx * Math.abs(sx * a),
        ry * Math.abs(sy * d),
      ]),
    };
  };
  /** The nearest box from `from` up, inside the scope, that draws a rounded shape of its own (a fill, an edge or a shadow), or also one that cuts by it. */
  const roundedHome = (from: Element | null, cuts: boolean): Element | null => {
    for (
      let up = from;
      up && scope.contains(up) && up !== document.body;
      up = up.parentElement
    ) {
      const s = style(up);
      const shows =
        paints(up).length > 0 ||
        (cuts && (s.overflowX !== "visible" || s.overflowY !== "visible"));
      if (shows && rounded(contourOf(up))) {
        return up;
      }
    }
    return null;
  };
  /** A wash's colour: its fill, else its gradient's first stop that shows; null when it draws none. */
  const washOf = (s: CSSStyleDeclaration): Rgba | null => {
    const own = fill(s);
    if (own[3] > 0.02) {
      return own;
    }
    return stopsOf(s.backgroundImage).find((one) => one[3] > 0.02) ?? null;
  };
  /**
   * Whether a style draws through a clip-path or a mask: what it draws is
   * that shape, not its box (the hanging card's neck, a `::before` cut to
   * the flare's curve), so its box says nothing of it.
   */
  const shaped = (s: CSSStyleDeclaration) => {
    const m = s as CSSStyleDeclaration & { webkitMaskImage?: string };
    return (
      s.clipPath !== "none" ||
      (s.maskImage && s.maskImage !== "none") ||
      Boolean(m.webkitMaskImage && m.webkitMaskImage !== "none")
    );
  };
  /** Elements whose decorations or washes were drawn through a clip-path or mask, by rule: not read. */
  const shapedBy = {
    "decoration-spill": new Set<string>(),
    "nested-radius": new Set<string>(),
  };
  const sayShaped = () => {
    for (const [rule, seen] of Object.entries(shapedBy)) {
      if (seen.size > 0) {
        unread.push(
          `${rule}: ${seen.size} element(s) draw it through a clip-path or mask, whose shape is not their box (${[...seen].slice(0, 3).join("; ")})`
        );
      }
    }
  };

  // A decoration draws inside the box it belongs to: the One Ring Rule's
  // ring is "inset on rows, tabs and anything flush or clipped" (design.css
  // `focus-inset`), and a ring, a dashed edge or a pseudo-element's line or
  // wash stays inside the wash it marks and the rounded or clipped box it
  // sits in. A ring or pseudo of a box that itself runs past that box (out
  // of its row, or scrolled out of sight) is `overflow`'s and the scroll's.
  if (!skip.has("decoration-spill")) {
    const scrolls = (el: Element) => {
      const s = style(el);
      return (
        (/auto|scroll/u.test(s.overflowY) &&
          el.scrollHeight > el.clientHeight + 1) ||
        (/auto|scroll/u.test(s.overflowX) &&
          el.scrollWidth > el.clientWidth + 1)
      );
    };
    const meets = (a: Contour, b: Contour) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top;
    /** Pseudo-elements standing flush outside their own box, by its selector: a joint, an edge fade. */
    const beside = new Set<string>();
    const spillAt = (el: Element): string | null => {
      const s = style(el);
      const own = contourOf(el);
      const scale = scaleOf(el);
      // Its own clip-path or mask cuts all it draws, rings and pseudos too.
      if (shaped(s)) {
        if (
          reachOf(s, own, scale).length > 0 ||
          brokenEdges(s).length > 0 ||
          (["::before", "::after"] as const).some((one) => pseudoOf(el, one))
        ) {
          shapedBy["decoration-spill"].add(selectorOf(el));
        }
        return null;
      }
      const decors: {
        c: Contour;
        from: Element | null;
        /** Its owner's box is its measure: a home its owner already runs past is not read. */
        owned: boolean;
        /** It marks its owner's own drawn box. */
        marks: boolean;
        position: string;
        what: string;
      }[] = [];
      for (const one of reachOf(s, own, scale)) {
        decors.push({
          c: one.c,
          what: `its ${one.what}`,
          from: el.parentElement,
          owned: true,
          marks: false,
          position: s.position,
        });
      }
      const broken = brokenEdges(s);
      if (broken.length > 0) {
        decors.push({
          c: own,
          what: `its ${broken.join(", ")}`,
          from: el.parentElement,
          owned: false,
          marks: false,
          position: s.position,
        });
      }
      for (const which of ["::before", "::after"] as const) {
        const ps = pseudoOf(el, which);
        const box = ps ? pseudoBox(el, ps) : null;
        if (!(ps && box)) {
          continue;
        }
        if (shaped(ps)) {
          shapedBy["decoration-spill"].add(`${selectorOf(el)}${which}`);
          continue;
        }
        const rings = reachOf(ps, box, scale);
        // Its broken edges said by their style; its fill and solid edges by what they paint.
        const dashes = brokenEdges(ps);
        const drawn = [
          ...dashes,
          ...paintsOf(ps).filter(
            (one) =>
              !(
                one.startsWith("box-shadow") ||
                (dashes.length > 0 && one.startsWith("border-"))
              )
          ),
        ];
        if (drawn.length === 0 && rings.length === 0) {
          continue;
        }
        // Wholly outside its box and flush against one side, it carries
        // the box on (an edge fade, a joint to the next card): it marks
        // no wash of its box's, and is read against the boxes it sits in.
        const flush =
          !meets(box, own) &&
          [
            box.bottom - own.top,
            own.bottom - box.top,
            box.right - own.left,
            own.right - box.left,
          ].some((gap) => Math.abs(gap) <= 0.5);
        if (flush) {
          beside.add(`${selectorOf(el)}${which}`);
        }
        const said = `its ${which}`;
        for (const one of [
          {
            c: box,
            what: `${said} (${drawn.join(", ").slice(0, 80) || "its rings"})`,
          },
          ...rings.map((ring) => ({
            c: ring.c,
            what: `${said}'s ${ring.what}`,
          })),
        ]) {
          decors.push({
            ...one,
            from: el,
            owned: true,
            marks: !flush && paints(el).length > 0,
            position: "absolute",
          });
        }
      }
      let worst: { by: number; said: string } | null = null;
      for (const d of decors) {
        const homes: { el: Element; c: Contour; how: string; cuts: boolean }[] =
          [];
        if (d.marks) {
          homes.push({
            el,
            c: own,
            how: `its own box, the ${washOf(s) ? "wash" : "box"} it marks`,
            cuts: false,
          });
        }
        const cutter = cutterOf(d.from, d.position);
        const cut = cutter ? clipOf(cutter) : null;
        if (cutter && cut) {
          homes.push({
            el: cutter,
            c: cut,
            how: `${selectorOf(cutter)}, which clips it (overflow ${style(cutter).overflow})`,
            cuts: true,
          });
        }
        // Its own box is the one it marks, when that draws; the rounded box
        // it sits in is from its parent up.
        const round = roundedHome(el.parentElement, false);
        if (round && round !== cutter) {
          const rc = contourOf(round);
          homes.push({
            el: round,
            c: rc,
            how: `${selectorOf(round)}, rounded ${px(Math.max(...rc.r.flat()))}`,
            cuts: false,
          });
        }
        for (const home of homes) {
          if (home.el !== el) {
            // Its owner's square corners a rounded box cuts are that box's
            // to round (nested-radius reads them): its sides alone say it
            // runs past.
            const away = d.owned
              ? spillOf(own, { ...home.c, r: [] }).by > 0.5
              : (home.cuts && scrolls(home.el)) || !meets(d.c, home.c);
            if (away) {
              continue;
            }
          }
          const spill = spillOf(d.c, home.c);
          if (spill.by > 0.5 && !(worst && worst.by >= spill.by)) {
            worst = {
              by: spill.by,
              said: `${d.what} reaches ${px(spill.by)} past the ${spill.where} of ${home.how}`,
            };
          }
        }
      }
      return worst?.said ?? null;
    };
    for (const el of inFlowBoxes) {
      const said = spillAt(el);
      if (said) {
        say("decoration-spill", el, said);
      }
    }
    if (beside.size > 0) {
      named.push(
        `decoration-spill: ${beside.size} pseudo-element(s) flush outside their own box carry it on (an edge fade, a joint), read against the boxes they sit in: ${[...beside].slice(0, 3).join("; ")}`
      );
    }
  }

  // The Concentric Rule: "a surface nested in another's corner takes the
  // outer radius less the gap between their edges, the outer's edge
  // counted", and "the hover ghost, the selection pill and the focus ring
  // take the contour of what they mark". Read at a corner of a wash that
  // stands within the outer radius of a rounded box's corner, where the box
  // draws its curve or cuts by it; a chip clear of the corner keeps its own.
  if (!skip.has("nested-radius")) {
    /** How far along a corner's diagonal its curve's midpoint stands from the square corner, per px of radius. */
    const K = 1 - Math.SQRT1_2;
    const alike = (a: Rgba, b: Rgba) =>
      Math.abs(a[3] - b[3]) < 0.03 &&
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 4;
    const cornerAt = (
      inner: Contour,
      outer: Element
    ): {
      at: string;
      drawn: number;
      dx: number;
      dy: number;
      want: number;
      big: number;
    } | null => {
      const oc = contourOf(outer);
      const os = style(outer);
      const cut =
        os.overflowX !== "visible" && os.overflowY !== "visible"
          ? clipOf(outer)
          : null;
      let worst: {
        at: string;
        big: number;
        drawn: number;
        dx: number;
        dy: number;
        off: number;
        want: number;
      } | null = null;
      for (const [i, at] of CORNERS.entries()) {
        const left = i === 0 || i === 3;
        const top = i < 2;
        const dx = Math.max(
          0,
          left ? inner.left - oc.left : oc.right - inner.right
        );
        const dy = Math.max(
          0,
          top ? inner.top - oc.top : oc.bottom - inner.bottom
        );
        const [orx = 0, ory = 0] = oc.r[i] ?? [];
        const big = (orx + ory) / 2;
        if (big < 0.5 || Math.hypot(dx, dy) >= big) {
          continue;
        }
        const gap = (dx + dy) / 2;
        const want = Math.max(0, big - gap);
        const [irx = 0, iry = 0] = inner.r[i] ?? [];
        let drawn = (irx + iry) / 2;
        // Where the box cuts by its curve and that curve stands further in
        // along the corner's diagonal than the wash's own, the cut is the
        // corner drawn.
        if (cut) {
          const [crx = 0, cry = 0] = cut.r[i] ?? [];
          const cin =
            ((left ? cut.left - oc.left : oc.right - cut.right) +
              (top ? cut.top - oc.top : oc.bottom - cut.bottom)) /
              2 +
            ((crx + cry) / 2) * K;
          if (cin > gap + drawn * K) {
            drawn = (cin - gap) / K;
          }
        }
        // No one radius is concentric when the two insets differ: half
        // their difference is given.
        const room = Math.max(1.5, want * 0.25) + Math.abs(dx - dy) / 2;
        const off = Math.abs(drawn - want) - room;
        if (off > 0 && !(worst && worst.off >= off)) {
          worst = { at, big, drawn, dx, dy, off, want };
        }
      }
      return worst;
    };
    for (const el of inFlowBoxes) {
      if (
        el.matches(
          'img, video, canvas, iframe, input[type="checkbox"], input[type="radio"], input[type="range"]'
        )
      ) {
        continue;
      }
      const s = style(el);
      const inners: {
        c: Contour;
        colour: Rgba;
        from: Element | null;
        what: string;
      }[] = [];
      const own = washOf(s);
      if (own) {
        inners.push({
          c: contourOf(el),
          colour: own,
          from: el.parentElement,
          what: "its",
        });
      }
      for (const which of ["::before", "::after"] as const) {
        const ps = pseudoOf(el, which);
        const colour = ps ? washOf(ps) : null;
        const box = ps && colour ? pseudoBox(el, ps) : null;
        if (ps && colour && box && shaped(ps)) {
          shapedBy["nested-radius"].add(`${selectorOf(el)}${which}`);
        } else if (colour && box) {
          inners.push({ c: box, colour, from: el, what: `its ${which}'s` });
        }
      }
      // Its own clip-path or mask cuts its wash and its pseudos' alike.
      if (shaped(s)) {
        if (inners.length > 0) {
          shapedBy["nested-radius"].add(selectorOf(el));
        }
        continue;
      }
      for (const inner of inners) {
        const outer = roundedHome(inner.from, true);
        if (!outer) {
          continue;
        }
        const oc = contourOf(outer);
        const ground = washOf(style(outer));
        const ic = inner.c;
        // It nearly fills the box: along one axis it stands within the
        // box's corner radius of both ends (a row's ghost, a groove's
        // thumb), not a chip or a dot that only stands near one corner.
        const reach = Math.max(...oc.r.map(([x, y]) => (x + y) / 2));
        const fills =
          (ic.left - oc.left < reach && oc.right - ic.right < reach) ||
          (ic.top - oc.top < reach && oc.bottom - ic.bottom < reach);
        if (
          !fills ||
          (ground && alike(ground, inner.colour)) ||
          ic.left < oc.left - 0.5 ||
          ic.top < oc.top - 0.5 ||
          ic.right > oc.right + 0.5 ||
          ic.bottom > oc.bottom + 0.5
        ) {
          continue;
        }
        const corner = cornerAt(ic, outer);
        if (corner) {
          say(
            "nested-radius",
            el,
            `${inner.what} ${corner.at} corner is ${px(corner.drawn)} round, ${px(corner.dx)}×${px(corner.dy)} in from ${selectorOf(outer)}'s ${px(corner.big)} corner: concentric is ${px(corner.want)}`
          );
          break;
        }
      }
    }
  }

  // A control's hover, pressed, focus and selected fill takes the control's
  // shape (DESIGN.md, The Concentric Rule: "the hover ghost, the selection
  // pill and the focus ring take the contour of what they mark"): a fill a
  // child or a pseudo-element draws inside a rounded control takes the
  // control's radius less its inset, and any fill inside a group's glass
  // (a capsule, or a box that draws a rounded shape) the glass's radius
  // less its inset, so it sits concentric. A capsule's curve runs its whole
  // length: an item anywhere along it is concentric at the capsule's radius
  // less its inset across it. The read at rest names the controls (each in a
  // bar, and each rounded one), keeps what each draws at rest and reads a
  // selected one's fill; each forced state's read (`forcedStates`, the
  // DevTools protocol's CSS.forcePseudoState) reads what that state draws
  // anew.
  if (!skip.has("state-shape")) {
    const STATE_CONTROL =
      'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';
    /** A control drawn chosen at rest: its fill is its selected state's. */
    const SELECTED =
      '[aria-pressed="true"], [aria-expanded="true"], [aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-checked="true"], [data-state="on"], [data-state="open"], [data-state="active"], [data-pressed]';
    interface StateFill {
      box: Contour;
      key: string;
      sig: string;
      what: string;
    }
    const stash = window as unknown as {
      __stateShape?: {
        els: Element[];
        rest: Map<Element, Map<string, string>>;
      };
    };
    const shadowDraws = (s: CSSStyleDeclaration) =>
      s.boxShadow !== "none" &&
      [...s.boxShadow.matchAll(COLOR_FN)].some((m) => rgba(m[0])[3] > 0.02);
    /** What `el` paints of a fill or a ring: its own, its pseudos', and each child's (and its pseudos') at least half its width and height, a nested control's aside. */
    const fillsOf = (el: Element): StateFill[] => {
      const out: StateFill[] = [];
      const add = (
        s: CSSStyleDeclaration,
        box: Contour | null,
        key: string,
        what: string
      ) => {
        if (box && !shaped(s) && (washOf(s) || shadowDraws(s))) {
          out.push({
            box,
            key,
            what,
            sig: `${s.backgroundColor}|${s.backgroundImage}|${s.boxShadow}|${s.opacity}`,
          });
        }
      };
      const withPseudos = (e: Element, key: string, what: string) => {
        add(style(e), contourOf(e), key, what);
        for (const which of ["::before", "::after"] as const) {
          const ps = pseudoOf(e, which);
          if (ps) {
            add(ps, pseudoBox(e, ps), `${key}${which}`, `${what}${which}`);
          }
        }
      };
      withPseudos(el, "own", "its");
      const b = el.getBoundingClientRect();
      [...el.querySelectorAll("*")].forEach((d, i) => {
        if (
          d.closest("svg") ||
          d.matches(STATE_CONTROL) ||
          d.parentElement?.closest(STATE_CONTROL) !== el ||
          !shown(d)
        ) {
          return;
        }
        const r = d.getBoundingClientRect();
        if (r.width >= b.width / 2 && r.height >= b.height / 2) {
          withPseudos(d, `child ${i}`, `its ${d.tagName.toLowerCase()}'s`);
        }
      });
      return out;
    };
    /** Whether a box scrolls what it holds: its content moves under its corners. */
    const scrollsContent = (box: Element) => {
      const s = style(box);
      return (
        (/auto|scroll/u.test(s.overflowY) &&
          box.scrollHeight > box.clientHeight + 1) ||
        (/auto|scroll/u.test(s.overflowX) &&
          box.scrollWidth > box.clientWidth + 1)
      );
    };
    /** The glass `el` stands in: the nearest box over it that draws (a fill, an edge, a shadow, its own or a placed pseudo's that holds it), when that is rounded and holds it still (a box that scrolls it moves it past its corners: where it stands there is the scroll's, not a drawing's). */
    const glassOf = (el: Element): { box: Contour; name: string } | null => {
      const b = el.getBoundingClientRect();
      const holds = (c: Contour) =>
        c.left <= b.left + 0.5 &&
        c.top <= b.top + 0.5 &&
        c.right >= b.right - 0.5 &&
        c.bottom >= b.bottom - 0.5;
      for (
        let up = el.parentElement;
        up && scope.contains(up) && up !== document.body;
        up = up.parentElement
      ) {
        if (paints(up).length > 0) {
          const c = contourOf(up);
          return rounded(c) && !scrollsContent(up)
            ? { box: c, name: selectorOf(up) }
            : null;
        }
        for (const which of ["::before", "::after"] as const) {
          const ps = pseudoOf(up, which);
          const c =
            ps && !shaped(ps) && paintsOf(ps).length > 0
              ? pseudoBox(up, ps)
              : null;
          if (c && holds(c)) {
            return rounded(c)
              ? { box: c, name: `${selectorOf(up)}${which}` }
              : null;
          }
        }
      }
      return null;
    };
    /** Where `inner`'s corners leave `outer`'s contour, the worst corner: what it draws, what concentric is, its inset and the outer radius. */
    const missOf = (
      inner: Contour,
      outer: Contour
    ): {
      at: string;
      big: number;
      drawn: number;
      inset: number;
      want: number;
    } | null => {
      const w = outer.right - outer.left;
      const h = outer.bottom - outer.top;
      const half = Math.min(w, h) / 2;
      const capsule = outer.r.every(([x, y]) => Math.min(x, y) >= half - 0.5);
      const across =
        h <= w
          ? [inner.top - outer.top, outer.bottom - inner.bottom]
          : [inner.left - outer.left, outer.right - inner.right];
      const [a0 = 0, a1 = 0] = across;
      let worst: {
        at: string;
        big: number;
        drawn: number;
        inset: number;
        off: number;
        want: number;
      } | null = null;
      for (const [i, at] of CORNERS.entries()) {
        const left = i === 0 || i === 3;
        const top = i < 2;
        const dx = Math.max(
          0,
          left ? inner.left - outer.left : outer.right - inner.right
        );
        const dy = Math.max(
          0,
          top ? inner.top - outer.top : outer.bottom - inner.bottom
        );
        const [orx = 0, ory = 0] = outer.r[i] ?? [];
        const big = (orx + ory) / 2;
        let inset: number;
        let room: number;
        if (capsule) {
          inset = Math.max(0, (a0 + a1) / 2);
          room = Math.max(1.5, (big - inset) * 0.1) + Math.abs(a0 - a1) / 2;
        } else {
          if (big < 0.5 || Math.hypot(dx, dy) >= big) {
            continue;
          }
          inset = (dx + dy) / 2;
          room = Math.max(1.5, (big - inset) * 0.25) + Math.abs(dx - dy) / 2;
        }
        const want = Math.max(0, big - inset);
        const [irx = 0, iry = 0] = inner.r[i] ?? [];
        const drawn = (irx + iry) / 2;
        const off = Math.abs(drawn - want) - room;
        if (off > 0 && !(worst && worst.off >= off)) {
          worst = { at, big, drawn, inset, off, want };
        }
      }
      return worst;
    };
    /** One finding per control and state: the first fill that leaves its control's or its glass's contour. */
    const judge = (el: Element, fills: StateFill[], state: string) => {
      const own = contourOf(el);
      const glass = glassOf(el);
      for (const f of fills) {
        const mine =
          f.key !== "own" && rounded(own) ? missOf(f.box, own) : null;
        if (mine) {
          say(
            "state-shape",
            el,
            `${state}: ${f.what} fill is ${px(mine.drawn)} round at its ${mine.at} corner, ${px(mine.inset)} inside the control's own ${px(mine.big)} corner: concentric is ${px(mine.want)}`
          );
          return;
        }
        const g = glass;
        const inside =
          g &&
          f.box.left >= g.box.left - 0.5 &&
          f.box.top >= g.box.top - 0.5 &&
          f.box.right <= g.box.right + 0.5 &&
          f.box.bottom <= g.box.bottom + 0.5;
        const theirs = g && inside ? missOf(f.box, g.box) : null;
        if (g && theirs) {
          say(
            "state-shape",
            el,
            `${state}: ${f.what} fill is ${px(theirs.drawn)} round at its ${theirs.at} corner, ${px(theirs.inset)} in from ${g.name}'s ${px(theirs.big)} round glass: concentric is ${px(theirs.want)}`
          );
          return;
        }
      }
    };
    if (args.forced) {
      const atRest = stash.__stateShape;
      for (const el of atRest?.els ?? []) {
        if (!(el.isConnected && shown(el))) {
          continue;
        }
        const rest = atRest?.rest.get(el);
        judge(
          el,
          fillsOf(el).filter((f) => rest?.get(f.key) !== f.sig),
          args.forced
        );
      }
    } else {
      const read = controls.filter(
        (el) =>
          el.matches(STATE_CONTROL) &&
          !el.matches(':disabled, [aria-disabled="true"]') &&
          (el.closest(BAR) || rounded(contourOf(el)))
      );
      const rest = new Map<Element, Map<string, string>>();
      for (const el of read) {
        const fills = fillsOf(el);
        rest.set(el, new Map(fills.map((f) => [f.key, f.sig])));
        if (el.matches(SELECTED)) {
          judge(el, fills, "selected");
        }
      }
      stash.__stateShape = { els: read, rest };
    }
  }

  // Words over words: two text runs drawn, a reader's or not (an
  // aria-hidden ruler's figures run into each other as readily), whose line
  // boxes cross by 2px sideways and a third of the shorter's height. A run
  // wrapping onto its next line is one run. Each run is read as it shows:
  // cut by every box round it that clips (a scroller, a drawer's body), so
  // a list scrolled under its drawer's head is no overlap. A layer over the
  // page (a popover, a dialog) and a pinned bar over what scrolls under it
  // stand over words by design: only runs on one plane are compared.
  if (!skip.has("text-overlap")) {
    // A floating bar over its scroll edge effect (BarFloat: HeadFade, then
    // the bar) is pinned as a sticky one is: what scrolls under it is blurred
    // and faded there, never drawn under its words.
    const pinned = (el: Element) => {
      for (let up: Element | null = el; up; up = up.parentElement) {
        const at = style(up).position;
        if (
          at === "fixed" ||
          at === "sticky" ||
          (at === "absolute" &&
            up.previousElementSibling?.matches('[data-slot="head-fade"]'))
        ) {
          return up;
        }
      }
      return null;
    };
    /** Each layer and pinned bar by a number of its own: a run's plane is the pair it stands in. */
    const planes = new Map<Element | null, number>([[null, -1]]);
    const planeOf = (el: Element | null) => {
      if (!planes.has(el)) {
        planes.set(el, planes.size);
      }
      return planes.get(el);
    };
    interface Box {
      bottom: number;
      left: number;
      right: number;
      top: number;
    }
    /** What of the viewport `el` shows its content in: every clipping box round it, crossed. */
    const shows = new Map<Element, Box>();
    const showsOf = (el: Element | null): Box => {
      if (!el) {
        return {
          left: 0,
          top: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
        };
      }
      const known = shows.get(el);
      if (known) {
        return known;
      }
      const outer = showsOf(el.parentElement);
      const s = style(el);
      let box = outer;
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const r = el.getBoundingClientRect();
        const left = r.left + el.clientLeft;
        const top = r.top + el.clientTop;
        box = {
          left: Math.max(outer.left, left),
          top: Math.max(outer.top, top),
          right: Math.min(outer.right, left + el.clientWidth),
          bottom: Math.min(outer.bottom, top + el.clientHeight),
        };
      }
      shows.set(el, box);
      return box;
    };
    const runs = texts.flatMap((t) => {
      const plane = `${planeOf(t.parent.closest(LAYER))}/${planeOf(pinned(t.parent))}`;
      const cut = showsOf(t.parent);
      return t.rects.flatMap((one) => {
        const r = {
          left: Math.max(one.left, cut.left),
          top: Math.max(one.top, cut.top),
          right: Math.min(one.right, cut.right),
          bottom: Math.min(one.bottom, cut.bottom),
          height: one.height,
        };
        return r.right - r.left > 1 && r.bottom - r.top > 1
          ? [{ t, r, plane }]
          : [];
      });
    });
    const told = new Set<Element>();
    for (let i = 0; i < runs.length; i += 1) {
      const a = runs[i] as (typeof runs)[number];
      for (let j = i + 1; j < runs.length; j += 1) {
        const b = runs[j] as (typeof runs)[number];
        if (a.t === b.t || a.plane !== b.plane || told.has(b.t.parent)) {
          continue;
        }
        const across =
          Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const down =
          Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (across > 2 && down > Math.min(a.r.height, b.r.height) / 3) {
          told.add(a.t.parent);
          told.add(b.t.parent);
          say(
            "text-overlap",
            a.t.parent,
            `“${words(a.t.node.data)}” and “${words(b.t.node.data)}” (${selectorOf(b.t.parent)}) cross by ${px(across)} × ${px(down)}`
          );
          break;
        }
      }
    }
  }

  sayShaped();

  // The Nothing Jumps Rule, on an open surface: its list grows and shrinks
  // from the edge it opened on. Read across this page's reads, so one read
  // alone says so.
  {
    const was = window as unknown as {
      __checkLayers?: Map<
        Element,
        { bottom: number; height: number; top: number }
      >;
    };
    was.__checkLayers ??= new Map();
    const seen = was.__checkLayers;
    const layers = [...scope.querySelectorAll(POPOVER)].filter(
      (el) => shown(el) && !el.parentElement?.closest(POPOVER)
    );
    for (const layer of layers) {
      const r = layer.getBoundingClientRect();
      const before = seen.get(layer);
      if (!before) {
        if (!skip.has("anchor-drift")) {
          unread.push(
            `anchor-drift: ${describe(layer)} first read here; a later read of this page compares it`
          );
        }
      } else if (
        !skip.has("anchor-drift") &&
        Math.abs(r.height - before.height) >= 0.5 &&
        Math.abs(r.top - before.top) >= 1 &&
        Math.abs(r.bottom - before.bottom) >= 1
      ) {
        say(
          "anchor-drift",
          layer,
          `its top moved ${px(r.top - before.top)} and its foot ${px(r.bottom - before.bottom)} as its height went ${px(before.height)} to ${px(r.height)}`
        );
      }
      seen.set(layer, { top: r.top, bottom: r.bottom, height: r.height });
    }
  }

  // A scope that draws nothing would pass every rule on nothing (a dev
  // route read before vite compiled it held 3 elements), so it says so.
  const drewNothing =
    texts.length === 0 &&
    !inFlowBoxes.some(
      (el) =>
        el.matches(
          `svg, img, canvas, video, iframe, object, embed, ${CONTROL}`
        ) || paints(el).length > 0
    );

  return { drewNothing, findings, edges: edgesOut, lowest, named, unread };
}

/** Whether each finding's element (by its kept index) or words match an exemption; the reason if so. */
function excuseIn(args: {
  except: { rule: string; selector?: string; text?: string; reason: string }[];
  items: { at: number; rule: string; element: string; measured: string }[];
}): (string | null)[] {
  const els =
    (window as unknown as { __checkEls?: Element[] }).__checkEls ?? [];
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
}): { inScope: boolean; at: number; layer: string | null }[] {
  const scope = document.querySelector(args.scope) ?? document.body;
  const w = window as unknown as { __checkEls?: Element[] };
  w.__checkEls ??= [];
  const els = w.__checkEls;
  // A layer that floats over the page by design: a popover, a menu, a list
  // it opens, a dialog, sheet or drawer.
  const LAYER =
    '[data-popover], [data-slot="popover-content"], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="drawer-content"]';
  /**
   * The open layer drawn over `el`, when one is and does not hold it: read
   * at its middle and a quarter in from either end of its middle line, so
   * words half under a layer (a chip's value under its neighbour's open
   * card) are named as under it too, not only words whose middle is.
   */
  const layerOver = (el: Element): string | null => {
    const r = el.getBoundingClientRect();
    const layer =
      [0.5, 0.25, 0.75]
        .map((across) =>
          document
            .elementsFromPoint(
              r.left + r.width * across,
              r.top + r.height / 2
            )[0]
            ?.closest(LAYER)
        )
        .find((one) => one && !one.contains(el)) ?? null;
    if (!layer) {
      return null;
    }
    const slot = layer.getAttribute("data-slot");
    const role = layer.getAttribute("role");
    return `${layer.tagName.toLowerCase()}${slot ? `[data-slot=${slot}]` : ""}${role ? `[role=${role}]` : ""}`;
  };
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
      return { inScope: false, at: -1, layer: null };
    }
    els.push(found);
    return { inScope: true, at: els.length - 1, layer: layerOver(found) };
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
        document.getElementById("check-unmask")?.remove();
        if (r) {
          const style = document.createElement("style");
          style.id = "check-unmask";
          style.textContent = `[data-check-mask="${i}"]{${r};transition:none!important}`;
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

/**
 * state-shape's forced reads: each state in FORCED held on every control
 * the read at rest named (`window.__stateShape`), through the DevTools
 * protocol's CSS.forcePseudoState, transitions held off by an inspector
 * sheet so the read meets the state's own fill, then let go. A browser with
 * no DevTools protocol (Firefox, WebKit) forces nothing: said unread.
 */
async function forcedStates(
  page: Page,
  args: InPageArgs
): Promise<{
  findings: (CheckFinding & { at: number })[];
  named: string[];
  unread: string[];
}> {
  let cdp: Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    return {
      findings: [],
      named: [],
      unread: [
        "state-shape: this browser forces no state (no DevTools protocol): hover, pressed and focus read only where a spec puts them",
      ],
    };
  }
  const findings: (CheckFinding & { at: number })[] = [];
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await cdp.send("DOM.getDocument", { depth: 0 });
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: "window.__stateShape?.els ?? []",
    });
    if (!result.objectId) {
      return { findings, named: [], unread: [] };
    }
    const { result: props } = await cdp.send("Runtime.getProperties", {
      objectId: result.objectId,
      ownProperties: true,
    });
    const nodeIds = await Promise.all(
      props
        .filter((one) => /^\d+$/u.test(one.name) && one.value?.objectId)
        .map((one) =>
          cdp
            .send("DOM.requestNode", { objectId: one.value?.objectId ?? "" })
            .then((r) => r.nodeId)
        )
    );
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const { styleSheetId } = await cdp.send("CSS.createStyleSheet", {
      frameId: frameTree.frame.id,
    });
    await cdp.send("CSS.setStyleSheetText", {
      styleSheetId,
      text: "*, *::before, *::after { transition: none !important; }",
    });
    const force = (states: ForcedState[]) =>
      Promise.all(
        nodeIds.map((nodeId) =>
          cdp.send("CSS.forcePseudoState", {
            nodeId,
            forcedPseudoClasses: states,
          })
        )
      );
    try {
      for (const state of FORCED) {
        await force([state]);
        const read = await page.evaluate(readInPage, {
          ...args,
          forced: state,
          exempt: RULES.filter((rule) => rule !== "state-shape"),
        });
        findings.push(...read.findings);
      }
    } finally {
      await force([]);
      await cdp.send("CSS.setStyleSheetText", { styleSheetId, text: "" });
    }
    return {
      findings,
      named: [
        `state-shape: ${nodeIds.length} control(s) read at rest and with ${FORCED.join(", ")} forced`,
      ],
      unread: [],
    };
  } finally {
    await cdp.detach();
  }
}

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
    // The place, not the page: this machine holds no impeccable where the
    // fleet places skills. A workspace's boundary reads every one of those
    // layers (core paths.ts `fleetSyncedPaths`), so inside one the answer is
    // the host's. Said as not run here, as a spec that runs on the host is
    // (kit.ts `Spec.host`).
    const why = `$IMPECCABLE is unset and none of the fleet's skill layers holds ${IMPECCABLE_LAUNCHER}: ${userSkillLayers().join(", ")}`;
    return {
      ran: false,
      said: `impeccable not run here: no launcher (${why})`,
      found: [],
    };
  }
  scans += 1;
  const token = `rendered-checks-${process.pid}-${scans}`;
  const title = await page.title();
  await page.evaluate((t) => {
    document.title = t;
  }, token);
  try {
    const child = Bun.spawn(
      [bin, "detect", "--json", "--cdp", String(port), "--target", token],
      { env: process.env, cwd: ROOT, stdout: "pipe", stderr: "pipe" }
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
  (window as unknown as { __checkPlace: unknown }).__checkPlace = {
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
      __checkPlace?: {
        focus: Element | null;
        kept: [Element, number, number][];
        x: number;
        y: number;
      };
    }
  ).__checkPlace;
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

/** The impeccable rules these checks take in: each by the check it serves. */
const IMPECCABLE_CHECKS: Record<string, CheckName> = {
  "low-contrast": "contrast",
  "text-occlusion": "overflow",
};

/**
 * Each masked cut's fade read in its pixels (fadeDraws): a fade that does
 * not draw is hidden-cue's finding, unless an item peeks 16px there, the
 * cue a fade cut short leaves (a tab strip's, kept off its chosen tab).
 */
async function fadeCues(
  page: Page,
  edges: InPageRead["edges"]
): Promise<{
  findings: (CheckFinding & { at: number })[];
  named: string[];
  unread: string[];
}> {
  const out = {
    findings: [] as (CheckFinding & { at: number })[],
    named: [] as string[],
    unread: [] as string[],
  };
  for (const edge of edges) {
    const said = await fadeDraws(page, edge);
    if (said?.unread) {
      out.unread.push(said.unread);
    } else if (said?.finding && edge.peek >= 16) {
      out.named.push(
        `${edge.element}'s ${edge.side} fade draws little (${said.finding}), and an item peeks ${Math.round(edge.peek * 10) / 10}px there, the cue`
      );
    } else if (said?.finding) {
      out.findings.push({
        rule: "hidden-cue",
        element: edge.element,
        measured: said.finding,
        at: -1,
      });
    }
  }
  return out;
}

/**
 * Every rendered check read at the state the spec put `page` in. The spec
 * settles first (`settle`, or its own); a page still moving is the
 * `settled` rule's finding, not waited out here.
 */
async function renderedChecks(
  page: Page,
  opts: CheckOptions = {}
): Promise<CheckRead> {
  const scope = opts.scope ?? "body";
  const exempt = Object.keys(opts.exempt ?? {});
  const args: InPageArgs = {
    scope,
    forced: null,
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
  };
  const read = await page.evaluate(readInPage, args);
  const findings: (CheckFinding & { at: number })[] = [...read.findings];
  const unread = [...read.unread];
  const stateNamed: string[] = [];
  if (!exempt.includes("state-shape")) {
    const states = await forcedStates(page, args);
    findings.push(...states.findings);
    unread.push(...states.unread);
    stateNamed.push(...states.named);
  }

  // 7: a declared fade that draws, read in the pixels with and without it.
  const named = [...read.named, ...stateNamed];
  const fades = await fadeCues(page, read.edges);
  findings.push(...fades.findings);
  unread.push(...fades.unread);
  named.push(...fades.named);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-check-mask]")) {
      el.removeAttribute("data-check-mask");
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
      const rule = IMPECCABLE_CHECKS[f.antipattern];
      // Words an open layer covers (a popover, a menu, a dialog) are under
      // it by design: the layer floats over the page (DESIGN.md, Elevation
      // & Depth), and what it covers is the page it was opened over, not
      // text one box laid over another.
      if (f.antipattern === "text-occlusion" && where.layer) {
        named.push(
          `words under an open layer, which floats over the page: ${f.selector} under ${where.layer}`
        );
        return;
      }
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
  const excused: CheckRead["excused"] = [];
  const kept: CheckFinding[] = [];
  findings.forEach(({ at: _at, ...f }, i) => {
    const reason = reasons[i];
    if (reason) {
      excused.push({ ...f, reason });
    } else {
      kept.push(f);
    }
  });
  return {
    drewNothing: read.drewNothing,
    findings: kept,
    excused,
    impeccable: { ran: imp.ran, said: imp.said },
    lowest: read.lowest,
    named,
    others,
    unread,
  };
}

/**
 * The rendered checks over a spec's states: `at` reads one, `report` says one
 * PASS or FAIL line per rule over all of them, then what was exempted,
 * excused, named and left unread, so nothing is skipped silently.
 */
export class RenderedChecks {
  /** Each rule's findings, one entry per element and what it measured, with the states it was read in. */
  private readonly found = new Map<
    CheckName,
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
  /** The states whose scope drew nothing: no rule passes over them. */
  private readonly blank: string[] = [];
  private readonly kit: Kit;
  private readonly label: string;
  private readonly opts: CheckOptions;

  constructor(kit: Kit, label: string, opts: CheckOptions = {}) {
    this.kit = kit;
    this.label = label;
    this.opts = opts;
  }

  /** Reads one state; `more` adds to (or overrides) the spec's options for it. */
  async at(
    page: Page,
    where: string,
    more: CheckOptions = {}
  ): Promise<CheckRead> {
    const read = await renderedChecks(page, {
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
    if (read.drewNothing) {
      this.blank.push(where);
    }
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
    // Every finding, whole, beside the spec's shots: a check line names five.
    mkdirSync(this.kit.out, { recursive: true });
    writeFileSync(
      `${this.kit.out}/checks-${this.label}.json`,
      JSON.stringify(
        Object.fromEntries(
          [...this.found].map(([rule, byKey]) => [
            rule,
            [...byKey].map(([key, one]) => ({ ...one, finding: key })),
          ])
        ),
        null,
        2
      )
    );
    const impeccableDown = [...this.impeccable].filter((one) => one !== "ran");
    for (const rule of RULES) {
      const { says, by } = CHECKS[rule];
      const reason = exempt[rule];
      if (reason) {
        this.kit.note(
          `${this.label} rendered check ${rule} (${says}) exempt: ${reason}`
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
      const blank =
        this.blank.length > 0
          ? `, ${this.blank.length} state(s) drew nothing to read (${this.blank.slice(0, 3).join(", ")})`
          : "";
      this.kit.check(
        `${this.label} rendered check ${rule}, ${says} (${by}): ${total} finding(s), ${list.length} distinct, over ${this.states} state(s)${extra}${blank}`,
        total === 0 && this.states > 0 && this.blank.length === 0,
        list.slice(0, 5).join(" | ")
      );
    }
    // impeccable is part of the rendered check: a Chromium run that could not reach it fails.
    const said = (one: string) =>
      one.startsWith("impeccable reads Chromium only") ||
      one.startsWith("impeccable not run here");
    const blocking = impeccableDown.filter((one) => !said(one));
    if (blocking.length > 0) {
      this.kit.check(
        `${this.label} rendered checks: impeccable detect ran on every state`,
        false,
        blocking.join(" | ")
      );
    }
    for (const one of impeccableDown.filter(said)) {
      this.kit.note(
        `${this.label} rendered checks: ${one}; contrast and overflow read by the kit's own code alone here`
      );
    }
    for (const [key, n] of this.excused) {
      this.kit.note(`${this.label} rendered check excused ×${n}: ${key}`);
    }
    for (const one of this.named) {
      this.kit.note(`${this.label} rendered checks named, not failed: ${one}`);
    }
    for (const one of this.unread) {
      this.kit.note(`${this.label} rendered checks unread: ${one}`);
    }
    if (this.others.size > 0) {
      const top = [...this.others.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([o, n]) => `${o} ×${n}`);
      this.kit.note(
        `${this.label} impeccable, outside the rendered checks (${this.others.size} distinct): ${top.join(" | ")}`
      );
    }
  }
}

/** How long a page's elements stand still before it counts as drawn. */
const DRAWN_QUIET_MS = 1000;
/** The longest a read waits for a page to draw; past it the read says so and reads what is there. */
const DRAWN_BOUND_MS = 30_000;

/** The page's elements, an open shadow root's included, and whether `scope` draws a word, a mark or a painted box. */
function drawnNow(scope: string): { drew: boolean; elements: number } {
  const count = (under: Document | ShadowRoot): number => {
    let n = 0;
    for (const el of under.querySelectorAll("*")) {
      n += 1 + (el.shadowRoot ? count(el.shadowRoot) : 0);
    }
    return n;
  };
  const root = document.querySelector(scope) ?? document.body;
  const painted = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (
      r.width > 1 &&
      r.height > 1 &&
      s.visibility === "visible" &&
      (s.backgroundImage !== "none" ||
        !/rgba?\(0, 0, 0, 0\)|transparent/u.test(s.backgroundColor) ||
        ["top", "right", "bottom", "left"].some(
          (side) =>
            Number.parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
            s.getPropertyValue(`border-${side}-style`) !== "none"
        ))
    );
  };
  const drew =
    (root instanceof HTMLElement && root.innerText.trim().length > 0) ||
    [...root.querySelectorAll("*")].some(
      (el) =>
        (el.matches("svg, img, canvas, video, iframe") &&
          el.getBoundingClientRect().width > 1) ||
        painted(el)
    );
  return { drew, elements: count(document) };
}

/** What {@link untilDrawn} saw: the elements it ended on, how long it waited, and whether the page drew and then stood still. */
export interface Drawn {
  drew: boolean;
  elements: number;
  ms: number;
  /** It drew and no element came or went for the quiet window, inside the bound. */
  still: boolean;
}

/**
 * Waits until the page has drawn: something in `scope` to read, and no
 * element added or taken away for `quiet` ms, up to `bound` ms. A page read
 * at `load` is not one drawn: vite compiles a dev route's modules on its
 * first load, and 25 of 32 dev benches read at `load` held 3 elements, every
 * rule passing on nothing (2026-11-04).
 */
export async function untilDrawn(
  page: Page,
  scope = "body",
  { bound = DRAWN_BOUND_MS, quiet = DRAWN_QUIET_MS } = {}
): Promise<Drawn> {
  const start = Date.now();
  let last = -1;
  let changed = start;
  for (;;) {
    const now = await page.evaluate(drawnNow, scope);
    const at = Date.now();
    if (now.elements !== last) {
      last = now.elements;
      changed = at;
    }
    if (now.drew && at - changed >= quiet) {
      return { ...now, ms: at - start, still: true };
    }
    if (at - start >= bound) {
      return { ...now, ms: at - start, still: false };
    }
    await page.waitForTimeout(150);
  }
}

/** What a read says of the wait before it: how long the page took to draw, or that it did not. */
export const saidOfDrawn = (drawn: Drawn): string => {
  const s = (drawn.ms / 1000).toFixed(1);
  if (drawn.still) {
    return `drawn: ${drawn.elements} elements, still for ${DRAWN_QUIET_MS / 1000}s, after ${s}s`;
  }
  return drawn.drew
    ? `still drawing after ${s}s (${drawn.elements} elements): read as it stood`
    : `drew nothing to read in ${s}s (${drawn.elements} elements)`;
};

/** Below this width a page is read as a phone's: touch and a coarse pointer (DESIGN.md's 640px line). */
const PHONE_LINE = 640;
const USAGE =
  "bun scripts/probe-kit/rendered-checks.ts <url> [--width 1540] [--width 390x844] [--scope <selector>] [--scheme light|dark] [--wait-for <selector>]";

/** One width a page is read at, from `--width 1540` or `--width 390x844`. */
const sizeOf = (said: string): { height: number; width: number } => {
  const [width, height] = said.split("x").map(Number);
  if (!(width && width > 0) || (height !== undefined && !(height > 0))) {
    throw new Error(`--width takes px, like 1540 or 390x844: not "${said}".`);
  }
  return { width, height: height ?? (width < PHONE_LINE ? 844 : 900) };
};

/** What the command line asks: the page, its widths (1440 when none), and the scope. */
const askedOf = (
  args: string[]
): {
  scheme: "light" | "dark";
  waitFor: string | undefined;
  scope: string | undefined;
  sizes: { height: number; width: number }[];
  url: string | undefined;
} => {
  const valuesOf = (flag: string) =>
    args.flatMap((one, i) =>
      one === flag && args[i + 1] ? [args[i + 1] as string] : []
    );
  const widths = valuesOf("--width");
  const [scope] = valuesOf("--scope");
  const [scheme] = valuesOf("--scheme");
  const [waitFor] = valuesOf("--wait-for");
  if (scheme !== undefined && scheme !== "light" && scheme !== "dark") {
    throw new Error(`--scheme takes light or dark: not "${scheme}".`);
  }
  return {
    waitFor,
    scheme: scheme ?? "light",
    url: args.find(
      (one, i) => !(one.startsWith("--") || args[i - 1]?.startsWith("--"))
    ),
    sizes: (widths.length > 0 ? widths : ["1440"]).map(sizeOf),
    scope,
  };
};

/** One width's read, said: each rule's PASS or FAIL and what it found, then the rest. The findings' count. */
const sayRead = (read: CheckRead): number => {
  let found = 0;
  if (read.drewNothing) {
    for (const rule of RULES) {
      console.log(
        `UNREAD ${rule}, ${CHECKS[rule].says}: the page drew nothing in its scope to read`
      );
    }
    return RULES.length;
  }
  for (const rule of RULES) {
    const mine = read.findings.filter((one) => one.rule === rule);
    found += mine.length;
    console.log(
      `${mine.length === 0 ? "PASS" : "FAIL"} ${rule}, ${CHECKS[rule].says}: ${mine.length} finding(s)`
    );
    for (const one of mine.slice(0, 8)) {
      console.log(`  ${one.element}: ${one.measured}`);
    }
  }
  if (read.lowest) {
    console.log(
      `lowest contrast ${read.lowest.ratio.toFixed(2)}:1, ${read.lowest.element}`
    );
  }
  const lines = [
    ...read.named.map((one) => `named, not failed: ${one}`),
    ...read.unread.map((one) => `unread: ${one}`),
    `impeccable: ${read.impeccable.ran ? "ran" : read.impeccable.said}`,
    ...read.others.slice(0, 8).map((one) => `impeccable note: ${one}`),
  ];
  for (const line of lines) {
    console.log(line);
  }
  return found;
};

/**
 * The rendered checks read on the page at `url` from the command line, once per
 * width, in the kit's Chromium (its DevTools port open, so impeccable runs
 * on it as in a spec). Exits 1 when any rule found something.
 */
async function main(args: string[]): Promise<number> {
  const { url, sizes, scope, scheme, waitFor } = askedOf(args);
  if (!url) {
    console.log(USAGE);
    return 2;
  }
  const run = new Run();
  let found = 0;
  try {
    const browser = await run.browser("chromium");
    for (const size of sizes) {
      const phone = size.width < PHONE_LINE;
      const context = await browser.newContext({
        viewport: size,
        colorScheme: scheme,
        deviceScaleFactor: 2,
        hasTouch: phone,
        isMobile: phone,
      });
      try {
        await context.addInitScript(installRuns);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "load" });
        if (waitFor) {
          await page.waitForSelector(waitFor, { state: "attached" });
        }
        const drawn = await untilDrawn(page, scope);
        await settle(page);
        const read = await renderedChecks(page, scope ? { scope } : {});
        if (!drawn.still) {
          read.unread.push(`every rule: ${saidOfDrawn(drawn)}`);
        }
        console.log(
          `
${size.width}×${size.height}${phone ? " touch" : ""} ${scheme}: ${page.url()}
${saidOfDrawn(drawn)}`
        );
        found += sayRead(read);
      } finally {
        await context.close();
      }
    }
  } finally {
    await run.close();
  }
  return found > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
