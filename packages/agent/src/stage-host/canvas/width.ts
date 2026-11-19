/**
 * A frame is drawn as its own width says. The canvas draws every story in
 * one page, so the window's width says nothing of a frame's: a story named
 * for a phone, in an embed wider than 640px, would draw its desk layout.
 * Each width condition in the project's sheets is answered by the frame's
 * body instead: its `@media` rules become `@container cawco-width` rules
 * (each frame with a width is that container; the canvas itself is the one
 * a frame without a width answers to), and script that asks `matchMedia`
 * is answered at the frame's width (runtime.ts). A list is answered query
 * by query, so a width in one of its queries is the frame's whatever the
 * others ask. The frame answers the device too: under the tablet's width a
 * phone's coarse pointer, no hover, upright; from there a desk's
 * ({@link DEVICE}), so a frame at 390 draws a phone's touch branches in a
 * desk's browser with a mouse.
 *
 * A frame with a width is a whole screen, as Storybook's `viewport`
 * parameter makes its iframe a device's: the viewport units in the
 * project's sheets (`100dvh`, `50vw`) are answered by the frame's screen,
 * its width and that screen's height (core `screenHeight`: 390×844,
 * 768×1024, a desk's 16:10), which its body carries as {@link SCREEN_VW}
 * and {@link SCREEN_VH}. Read off the window, an `h-dvh` app stood as tall
 * as the render's window in every frame, a phone's included, and grew with
 * it as the picture's pose grew the window for its room, so it never had
 * the room (frame-picture.ts `poseState`). Outside a frame with a width
 * each unit is the window's, as written.
 */

import { FORMS } from "@cawco/core/stage";

/** The container every frame with a width is, and the canvas around them. */
export const WIDTH_CONTAINER = "cawco-width";

/** The words of a condition: its features and keyword values, not a number's unit (`640px`, `40em`). */
const WORD = /(?<![\w.-])[a-z][a-z-]*/giu;
/** A feature on the viewport's width: `width`, `min-width`, `max-width` (range syntax names `width`; `device-width` is the screen's). */
const WIDTH = /^(?:min-|max-)?width$/iu;
/** The words that join conditions. */
const JOINS = new Set(["and", "or", "not"]);
/** A length in em or rem: in a media query both are the initial font size, 16px (Media Queries 4, "Relative lengths"). */
const RELATIVE = /(-?\d*\.?\d+)r?em\b/gu;
const PREFIX = /^(?:only\s+)?([a-z]+)\s+and\s+/iu;
const MEDIA_TYPE = /^(?:only\s+)?(?:all|screen|print)$/iu;
const NOT = /^not\b/iu;
const ALL = /^(?:only\s+)?all$/iu;
const AND = /^\s+and\s+/iu;
const COMMA = /^,/u;

/** `text` split at its top-level `sep`, outside parentheses, each part trimmed. */
function partsOf(text: string, sep: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const c = text[at];
    depth += Number(c === "(") - Number(c === ")");
    if (depth === 0) {
      const rest = text.slice(at);
      const match = rest.match(sep);
      if (match && match.index === 0) {
        parts.push(text.slice(from, at).trim());
        at += match[0].length - 1;
        from = at + 1;
      }
    }
  }
  parts.push(text.slice(from).trim());
  return parts.filter((one) => one !== "");
}

/** One query's media type and its top-level `and`ed conditions. */
function queryOf(text: string): { conditions: string[]; type: string } | null {
  if (NOT.test(text)) {
    return null;
  }
  if (MEDIA_TYPE.test(text)) {
    return { type: text, conditions: [] };
  }
  const typed = text.match(PREFIX);
  const rest = typed ? text.slice(typed[0].length) : text;
  const conditions = partsOf(rest, AND);
  if (conditions.some((one) => !(one.startsWith("(") && one.endsWith(")")))) {
    return null;
  }
  return { type: typed?.[1] ?? "", conditions };
}

/** A condition's words, its joins left out. */
const wordsOf = (condition: string): string[] =>
  [...condition.matchAll(WORD)]
    .map((m) => m[0].toLowerCase())
    .filter((word) => !JOINS.has(word));

/** Whether a condition names a width feature. */
const asksWidth = (condition: string): boolean =>
  wordsOf(condition).some((word) => WIDTH.test(word));

/** Whether a parenthesised condition names width features alone. */
const widthAlone = (condition: string): boolean => {
  const words = wordsOf(condition);
  return words.length > 0 && words.every((word) => WIDTH.test(word));
};

/** Whether a media type is every medium's (`all`, or none written). */
const anyMedium = (type: string): boolean => type === "" || ALL.test(type);

/** A width condition with its em and rem as px: in a container query they would follow the container's font. */
const inPx = (condition: string): string =>
  condition.replace(RELATIVE, (_, n: string) => `${Number(n) * 16}px`);

/**
 * The width under which a frame answers as a phone: core {@link FORMS}'
 * tablet, the line `screenHeight` stands a screen upright as a phone's
 * under. Its pointer is coarse, it has no hover, it stands portrait; a
 * frame at this width or wider answers as a desk does: a fine pointer that
 * hovers, landscape (the owner, 2026-11-19: "Other widths answer what a desk
 * does").
 */
const PHONE_UNDER = FORMS.tablet;
const IS_PHONE = `(width < ${PHONE_UNDER}px)`;
const IS_DESK = `(width >= ${PHONE_UNDER}px)`;
/** Conditions that hold and fail at any width, valid wherever a width condition is. */
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

/** A pointer's value as the frame answers it; the feature alone (`(pointer)`, some pointer) holds. */
const POINTER: Record<string, string> = {
  coarse: IS_PHONE,
  fine: IS_DESK,
  none: NEVER,
};

/**
 * Each feature of the device a frame answers by its width
 * ({@link PHONE_UNDER}), as a phone or a desk does, and the width condition
 * that answers it: `pointer` and `hover` (their `any-` kin alike) and
 * `orientation`, as `(feature: value)` or the feature alone.
 */
const DEVICE: [RegExp, (feature: string, value?: string) => string][] = [
  [
    /\(\s*(?:any-)?pointer\s*(?::\s*([a-z]+)\s*)?\)/giu,
    (_, value) => POINTER[value?.toLowerCase() ?? ""] ?? ALWAYS,
  ],
  [
    /\(\s*(?:any-)?hover\s*(?::\s*([a-z]+)\s*)?\)/giu,
    (_, value) => (value?.toLowerCase() === "none" ? IS_PHONE : IS_DESK),
  ],
  [
    /\(\s*orientation\s*:\s*([a-z]+)\s*\)/giu,
    (_, value) => (value?.toLowerCase() === "portrait" ? IS_PHONE : IS_DESK),
  ],
];

/** `text` with each device feature the frame answers ({@link DEVICE}) as the width condition that answers it. */
const deviceAsWidth = (text: string): string =>
  DEVICE.reduce(
    (out, [pattern, answer]) =>
      out.replace(pattern, (feature: string, value?: string) =>
        answer(feature, value)
      ),
    text
  );

/** One query of a list, as a frame answers it: its width conditions (`container`, empty for none) the frame's, the rest (`media`, empty for none) the window's; it holds where both do. */
interface FramePart {
  container: string;
  media: string;
}

/** How one media query list answers per frame. */
export type WidthSplit =
  /** No condition the frame answers: the window answers it. */
  | { kind: "none" }
  /** Its queries, each answered on its own: the list holds where one of them does (Media Queries 4 §2.1, a list is true if any query in it is). */
  | { kind: "frame"; parts: FramePart[] }
  /** A query whose width conditions can't be parted from the rest (a `not` over both, a width tied up with another feature): left to the window, and said. */
  | { kind: "kept" };

/** One query as the frame answers it; null where its width conditions can't be parted from the rest. */
function partOf(text: string): FramePart | null {
  const negated = NOT.test(text);
  const query = queryOf(negated ? text.replace(NOT, "").trim() : text);
  if (!query) {
    return null;
  }
  const width = query.conditions.filter(widthAlone);
  const rest = query.conditions.filter((c) => !widthAlone(c));
  // A width condition tied up with another (`((width < 600px) or (prefers-contrast: more))`): the window keeps it.
  if (rest.some(asksWidth)) {
    return null;
  }
  if (negated) {
    // `not` negates the whole query: the frame answers it only when it is width conditions alone.
    return rest.length === 0 && anyMedium(query.type)
      ? { container: `not (${inPx(width.join(" and "))})`, media: "" }
      : null;
  }
  return {
    container: inPx(width.join(" and ")),
    media: [anyMedium(query.type) ? "" : query.type, ...rest]
      .filter(Boolean)
      .join(" and "),
  };
}

/**
 * How a media query list (a `@media` rule's or `matchMedia`'s) answers per
 * frame: each of its queries on its own, its width conditions and the
 * device features a frame answers ({@link DEVICE}) the frame's, so
 * `(pointer: coarse), (width < 640px)` holds in a 390 frame through either.
 */
export function splitWidth(list: string): WidthSplit {
  const answered = deviceAsWidth(list);
  if (!asksWidth(answered)) {
    return { kind: "none" };
  }
  const parts = partsOf(answered, COMMA).map(partOf);
  if (parts.some((one) => one === null)) {
    return { kind: "kept" };
  }
  return { kind: "frame", parts: parts.filter((one) => one !== null) };
}

/**
 * The rules a split list stands as, each holding `inner` (`framed` inside
 * a container, {@link framedRule}): the queries the
 * frame alone answers as one `@container` rule (`or`ed), the window's alone
 * as one `@media` list, and each that both answer as an `@container` inside
 * an `@media`. The same declarations in each, so where two hold they say
 * the same.
 */
function rulesOf(parts: FramePart[], inner: string, framed: string): string[] {
  const contained = (condition: string) =>
    `@container ${WIDTH_CONTAINER} ${condition} {\n${framed}\n}`;
  const frameAlone = parts.filter((one) => one.container && !one.media);
  const windowAlone = parts.filter((one) => !one.container);
  const both = parts.filter((one) => one.container && one.media);
  const rules: string[] = [];
  if (frameAlone.length === 1 && frameAlone[0]) {
    rules.push(contained(frameAlone[0].container));
  } else if (frameAlone.length > 1) {
    rules.push(
      contained(frameAlone.map((one) => `(${one.container})`).join(" or "))
    );
  }
  if (windowAlone.length > 0) {
    rules.push(
      `@media ${windowAlone.map((one) => one.media || "all").join(", ")} {\n${inner}\n}`
    );
  }
  for (const one of both) {
    rules.push(`@media ${one.media} {\n${contained(one.container)}\n}`);
  }
  return rules;
}

/** A selector of the document's root, which a container query never reaches: a container's rules match its descendants alone. */
const ROOT_SELECTOR = /^(?::root|html)$/iu;
/** What stands for the root inside a frame: the story's own top elements, from which a custom property inherits as from the root. */
const FRAME_ROOT = ":where(.cawco-frame-body) > *";

/**
 * A rule as a frame's container holds it: `:root` and `html` among its
 * selectors stand for the frame's own top ({@link FRAME_ROOT}), so the
 * tokens a phone sets on the root (`@media (pointer: coarse) { :root {
 * --spacing-c-nav-h: 44px } }`) reach the story inside a phone's frame.
 */
function framedRule(rule: CSSRule): string {
  if (!(rule instanceof CSSStyleRule)) {
    return rule.cssText;
  }
  const selectors = rule.selectorText.split(",").map((one) => one.trim());
  if (!selectors.some((one) => ROOT_SELECTOR.test(one))) {
    return rule.cssText;
  }
  const framed = selectors
    .map((one) => (ROOT_SELECTOR.test(one) ? FRAME_ROOT : one))
    .join(", ");
  return rule.cssText.replace(rule.selectorText, () => framed);
}

const CONVERTED = new WeakSet<CSSRule>();

/** One hundredth of the frame's screen across and down, px: set on each body with a width (runtime.ts `sizeBody`). */
export const SCREEN_VW = "--cawco-vw";
export const SCREEN_VH = "--cawco-vh";

/** A length in a viewport unit (CSS Values 4 §6.1.2): its number, its `s`/`l`/`d` size, its axis. */
const VIEWPORT_LENGTH =
  /(?<![\w-])(-?(?:\d+\.?\d*|\.\d+))([sld]?)v(h|w|b|i|min|max)\b/gu;

/** A viewport length as the frame's screen answers it, the window's own unit where no frame says one. */
const screenLength = (
  _match: string,
  n: string,
  size: string,
  axis: string
): string => {
  const across = `var(${SCREEN_VW}, 1${size}vw)`;
  const down = `var(${SCREEN_VH}, 1${size}vh)`;
  const units: Record<string, string> = {
    h: down,
    b: down,
    w: across,
    i: across,
    min: `min(${across}, ${down})`,
    max: `max(${across}, ${down})`,
  };
  const unit = units[axis] ?? across;
  return `calc(${n} * ${unit})`;
};

/** A rule's declarations that measure by the viewport, measured by the frame's screen instead. */
function screenUnits(style: CSSStyleDeclaration): void {
  const found: [string, string, string][] = [];
  for (let at = 0; at < style.length; at += 1) {
    const name = style.item(at);
    const value = style.getPropertyValue(name);
    VIEWPORT_LENGTH.lastIndex = 0;
    if (VIEWPORT_LENGTH.test(value)) {
      found.push([name, value, style.getPropertyPriority(name)]);
    }
  }
  for (const [name, value, priority] of found) {
    style.setProperty(
      name,
      value.replace(VIEWPORT_LENGTH, screenLength),
      priority
    );
  }
}

/** One `@media` rule, at `index` of `container`, put as the frame answers it ({@link rulesOf}); named in `kept` where the window must. The rules after the first that stand in its place are read on by {@link frameWidths}'s walk, finding nothing more to put. */
function asFrame(
  container: CSSStyleSheet | CSSGroupingRule | CSSStyleRule,
  index: number,
  rule: CSSMediaRule,
  kept: Set<string>
): void {
  const split = splitWidth(rule.media.mediaText);
  if (split.kind === "kept") {
    kept.add(`@media ${rule.media.mediaText}`);
  }
  if (split.kind !== "frame") {
    return;
  }
  const inner = [...rule.cssRules].map((one) => one.cssText).join("\n");
  const framed = [...rule.cssRules].map(framedRule).join("\n");
  const rules = rulesOf(split.parts, inner, framed);
  let put = 0;
  try {
    for (const text of rules) {
      container.insertRule(text, index + 1 + put);
      put += 1;
    }
    container.deleteRule(index);
  } catch {
    // One the engine refused: the rules put so far go, and the window keeps the rule as written.
    for (; put > 0; put -= 1) {
      container.deleteRule(index + put);
    }
    kept.add(`@media ${rule.media.mediaText}`);
  }
}

/**
 * Each width `@media` rule under `container` as the frame answers it: an
 * `@container cawco-width` rule with its rules, inside an `@media` of what
 * the window still answers; and each viewport length as the frame's screen
 * answers it ({@link screenUnits}). A rule kept for the window is named in
 * `kept`.
 */
export function frameWidths(
  container: CSSStyleSheet | CSSGroupingRule | CSSKeyframesRule | CSSStyleRule,
  kept: Set<string>
): void {
  let rules: CSSRuleList;
  try {
    rules = container.cssRules;
  } catch {
    return;
  }
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules.item(index);
    if (!rule || CONVERTED.has(rule)) {
      continue;
    }
    // Keyframes hold no `@media` rule: only their frames' declarations are read.
    if (
      rule instanceof CSSMediaRule &&
      !(container instanceof CSSKeyframesRule)
    ) {
      asFrame(container, index, rule, kept);
    }
    const now = container.cssRules.item(index);
    if (!now) {
      continue;
    }
    CONVERTED.add(now);
    if ("style" in now && now.style instanceof CSSStyleDeclaration) {
      screenUnits(now.style);
    }
    // A keyframes rule too: its frames' declarations hold screen units.
    if (now instanceof CSSGroupingRule || now instanceof CSSKeyframesRule) {
      frameWidths(now, kept);
    }
  }
}
