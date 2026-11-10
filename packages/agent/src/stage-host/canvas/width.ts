/**
 * A frame is drawn as its own width says. The canvas draws every story in
 * one page, so the window's width says nothing of a frame's: a story named
 * for a phone, in an embed wider than 640px, would draw its desk layout.
 * Each width condition in the project's sheets is answered by the frame's
 * body instead: its `@media` rules become `@container cawco-width` rules
 * (each frame with a width is that container; the canvas itself is the one
 * a frame without a width answers to), and script that asks `matchMedia`
 * is answered at the frame's width (runtime.ts).
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

/** How one media query list answers per frame. */
export type WidthSplit =
  /** No width condition: the window answers it. */
  | { kind: "none" }
  /** Width conditions the frame answers (`container`), the rest (`media`, empty for none) the window. */
  | { container: string; kind: "frame"; media: string }
  /** Width conditions it can't part from the rest (a `not` over them, a list mixing them with others): left to the window, and said. */
  | { kind: "kept" };

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

/** How a media query list (a `@media` rule's or `matchMedia`'s) answers per frame. */
export function splitWidth(list: string): WidthSplit {
  if (!asksWidth(list)) {
    return { kind: "none" };
  }
  const read = partsOf(list, COMMA).map(queryOf);
  const queries = read.flatMap((one) => one ?? []);
  if (queries.length !== read.length) {
    return { kind: "kept" };
  }
  const parts = queries.map((one) => ({
    rest: one.conditions.filter((c) => !widthAlone(c)),
    type: one.type,
    width: one.conditions.filter(widthAlone),
  }));
  // A width condition tied up with another (`((width < 600px) or (hover))`): the window keeps it.
  if (parts.some((one) => one.rest.some(asksWidth))) {
    return { kind: "kept" };
  }
  const [only] = parts;
  if (parts.length === 1 && only) {
    return {
      kind: "frame",
      container: inPx(only.width.join(" and ")),
      media: [anyMedium(only.type) ? "" : only.type, ...only.rest]
        .filter(Boolean)
        .join(" and "),
    };
  }
  // A list says one container condition only when each query is width conditions alone.
  if (
    parts.some(
      (one) =>
        one.width.length === 0 || one.rest.length > 0 || !anyMedium(one.type)
    )
  ) {
    return { kind: "kept" };
  }
  return {
    kind: "frame",
    container: inPx(
      parts.map((one) => `(${one.width.join(" and ")})`).join(" or ")
    ),
    media: "",
  };
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

/** One `@media` rule, at `index` of `container`, put as the frame answers it; named in `kept` where the window must. */
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
  const query = `@container ${WIDTH_CONTAINER} ${split.container} {\n${inner}\n}`;
  try {
    container.insertRule(
      split.media ? `@media ${split.media} {\n${query}\n}` : query,
      index + 1
    );
    container.deleteRule(index);
  } catch {
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
