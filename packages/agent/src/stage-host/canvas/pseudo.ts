/**
 * Interaction states drawn from the project's own CSS (component canvas
 * §2, A1): every rule whose selector targets `:hover`, `:active`,
 * `:focus-visible`, `:focus-within` or `:focus` gains two alternatives, the
 * pseudo-class as a class on the element (`.cawco-hover`) and as the
 * element inside a forced frame (`.btn:is(.cawco-hover-all *)`); a frame
 * forced into a state carries that class on its body. One mechanism in the person's
 * browser and the daemon's.
 *
 * The rewrite is Storybook's pseudo-states addon's (`rewriteStyleSheet.ts`,
 * `splitSelectors.ts`, `constants.ts`, MIT, © Storybook contributors,
 * https://github.com/storybookjs/storybook/tree/next/code/addons/pseudo-states),
 * its class prefix ours, its `:host` branch dropped (a canvas frame is no
 * shadow root) and its ancestor form written in place (`rewriteRule`). Ours on top: each rewritten selector without its states is
 * kept per state ({@link Reach}), so a canvas knows which frames a state
 * reaches before it draws a column; a rule that will not take its rewrite
 * is kept as not forced (§7.1's report); and reduced motion is forced the
 * same way, by the media rules' own text.
 */

/** Dynamic pseudo-classes, `focus` after its longer kin (Storybook's `PSEUDO_STATES`, its visited/link/target left out). */
const PSEUDO_STATES = [
  "hover",
  "active",
  "focus-visible",
  "focus-within",
  "focus",
] as const;
export type PseudoState = (typeof PSEUDO_STATES)[number];

/** Pseudo-elements a class can't follow (Storybook's `EXCLUDED_PSEUDO_ELEMENT_PATTERNS`). */
const EXCLUDED_PSEUDO_ELEMENT_PATTERNS = [
  "::-(webkit|moz|ms)-[a-z-]+",
  "::part\\([^)]+\\)",
];

const PREFIX = "cawco-";
/** The class a frame's body carries to force a state on everything in it. */
export const allClass = (state: PseudoState): string => `${PREFIX}${state}-all`;

const selectorStartPattern = /[|>+~,\s(]/;
const pseudoStatePattern = new RegExp(`:(${PSEUDO_STATES.join("|")})`, "g");
const excludedPseudoElementPattern = new RegExp(
  `(?:${EXCLUDED_PSEUDO_ELEMENT_PATTERNS.join("|")})\\S*`,
  "g"
);
const BLANK_ITEMS = /([\s(]),\s+|(,\s+)+(?=\))/g;

interface PseudoStateMatch {
  index: number;
  state: PseudoState;
  text: string;
}

const isEscaped = (selector: string, index: number): boolean => {
  let backslashes = 0;
  for (let at = index - 1; at >= 0 && selector[at] === "\\"; at -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};

const findPseudoStates = (selector: string): PseudoStateMatch[] => {
  const matches: PseudoStateMatch[] = [];
  pseudoStatePattern.lastIndex = 0;
  for (
    let match = pseudoStatePattern.exec(selector);
    match;
    match = pseudoStatePattern.exec(selector)
  ) {
    if (!isEscaped(selector, match.index)) {
      matches.push({
        index: match.index,
        state: match[1] as PseudoState,
        text: match[0],
      });
    }
  }
  return matches;
};

const excludedRanges = (selector: string): { end: number; start: number }[] => {
  const ranges: { end: number; start: number }[] = [];
  excludedPseudoElementPattern.lastIndex = 0;
  for (
    let match = excludedPseudoElementPattern.exec(selector);
    match;
    match = excludedPseudoElementPattern.exec(selector)
  ) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
};

/** Each state in `selector` (outside a pseudo-element that takes no class) replaced by `instead(state)`. */
const replacePseudoStates = (
  selector: string,
  instead: (state: PseudoState) => string,
  found = findPseudoStates(selector)
): string => {
  const excluded = excludedRanges(selector);
  const matches = found.filter(
    ({ index }) =>
      !excluded.some(({ start, end }) => index >= start && index < end)
  );
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += selector.slice(cursor, match.index);
    result += instead(match.state);
    cursor = match.index + match.text.length;
  }
  return result + selector.slice(cursor);
};

/** The selector without its states (`*` where a state stood alone), and the states it had. */
const extractPseudoStates = (
  selector: string
): { states: PseudoState[]; without: string } => {
  const states = new Set<PseudoState>();
  let without = "";
  let cursor = 0;
  for (const match of findPseudoStates(selector)) {
    without += selector.slice(cursor, match.index);
    if (
      match.index > 0 &&
      selectorStartPattern.test(selector[match.index - 1] as string)
    ) {
      without += "*";
    }
    states.add(match.state);
    cursor = match.index + match.text.length;
  }
  without += selector.slice(cursor);
  without = without.replaceAll(BLANK_ITEMS, "$1") || "*";
  return { states: [...states], without };
};

/** A selector list split at its top-level commas (Storybook's `splitSelectors`). */
export function splitSelectors(selectors: string): string[] {
  if (selectors.startsWith("@")) {
    return [selectors];
  }
  const result: string[] = [];
  let parentheses = 0;
  let brackets = 0;
  let selector = "";
  for (const char of selectors) {
    if (char === "(") {
      parentheses += 1;
    } else if (char === ")") {
      parentheses -= 1;
    } else if (char === "[") {
      brackets += 1;
    } else if (char === "]") {
      brackets -= 1;
    } else if (char === "," && !parentheses && !brackets) {
      result.push(selector.trim());
      selector = "";
      continue;
    }
    selector += char;
  }
  result.push(selector.trim());
  return result;
}

/**
 * Where each state reaches: the selectors (without their states, nesting
 * resolved) of every rule that targets it. A frame has a state's column
 * when one of them matches an element in it.
 */
export type Reach = Record<PseudoState, Set<string>>;

export const emptyReach = (): Reach => ({
  hover: new Set(),
  active: new Set(),
  "focus-visible": new Set(),
  "focus-within": new Set(),
  focus: new Set(),
});

/** A nested rule's selector with its parents' in place of `&` (`:is()` keeps their meaning). */
function resolvedSelector(rule: CSSStyleRule, selector: string): string {
  let parent = rule.parentRule;
  while (parent && !(parent instanceof CSSStyleRule)) {
    parent = parent.parentRule;
  }
  if (!(parent instanceof CSSStyleRule)) {
    return selector;
  }
  const outer = resolvedSelector(parent, parent.selectorText);
  return selector.includes("&")
    ? selector.replaceAll("&", `:is(${outer})`)
    : `:is(${outer}) ${selector}`;
}

interface Rewrite {
  /** The selectors each state reaches, gathered as rules rewrite. */
  reach: Reach;
  /** Selectors whose rewrite the engine refused. */
  refused: Set<string>;
}

/** The rule's text with its selector list rewritten, or none when it targets no state. */
function rewriteRule(rule: CSSStyleRule, into: Rewrite): string | null {
  const { selectorText, cssText } = rule;
  let did = false;
  const selectors = splitSelectors(selectorText).flatMap((selector) => {
    if (selector.includes(`.${PREFIX}`)) {
      return [selector];
    }
    const found = findPseudoStates(selector);
    if (found.length === 0) {
      return [selector];
    }
    did = true;
    const { states, without } = extractPseudoStates(selector);
    const plain = resolvedSelector(rule, without);
    for (const state of states) {
      into.reach[state].add(plain);
    }
    const one = [selector];
    const asClass = replacePseudoStates(
      selector,
      (state) => `.${PREFIX}${state}`,
      found
    );
    if (asClass !== selector) {
      one.push(asClass);
    }
    // Ours, in place of Storybook's leading ancestor class: the state's
    // element inside a forced frame, written where the state stood, so
    // `@scope` rules, nesting (`&:hover`) and an outer context
    // (`.dark .btn:hover`) all keep their shape, and the specificity is
    // the pseudo-class's own (0,1,0).
    one.push(
      replacePseudoStates(
        selector,
        (state) => `:is(.${allClass(state)} *)`,
        found
      )
    );
    return one;
  });
  return did ? cssText.replace(selectorText, () => selectors.join(", ")) : null;
}

const REWRITTEN = new WeakSet<CSSRule>();
/** Storybook's bound per sheet: a reset with thousands of states gives up past it. */
const REWRITE_LIMIT = 1000;

function rewriteContainer(
  container: CSSStyleSheet | CSSGroupingRule | CSSStyleRule,
  into: Rewrite,
  left: number
): number {
  let count = 0;
  for (let index = 0; index < container.cssRules.length; index += 1) {
    const rule = container.cssRules[index] as CSSRule;
    if (REWRITTEN.has(rule)) {
      continue;
    }
    let target: CSSRule = rule;
    if (rule instanceof CSSStyleRule) {
      const text = rewriteRule(rule, into);
      if (text) {
        try {
          container.insertRule(text, index + 1);
          container.deleteRule(index);
          target = container.cssRules[index] as CSSRule;
          count += 1;
        } catch {
          into.refused.add(rule.selectorText);
        }
      }
    }
    REWRITTEN.add(target);
    if ("cssRules" in target && (target as CSSGroupingRule).cssRules.length) {
      count += rewriteContainer(target as CSSGroupingRule, into, left - count);
    }
    if (count >= left) {
      break;
    }
  }
  return count;
}

/** Rewrites one sheet in place; a cross-origin sheet (no `cssRules`) is left as it is. */
export function rewriteSheet(sheet: CSSStyleSheet, into: Rewrite): void {
  try {
    rewriteContainer(sheet, into, REWRITE_LIMIT);
  } catch {
    // A cross-origin sheet's rules can't be read: its states are not forced.
    if (sheet.href) {
      into.refused.add(`@import ${sheet.href}`);
    }
  }
}

/* --- Reduced motion -------------------------------------------------- */

const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;
const NO_PREFERENCE = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g;
const ORIGINAL_MEDIA = new WeakMap<CSSMediaRule, string>();

/**
 * Every `prefers-reduced-motion` media rule answers as `reduce` would
 * (`motion: "reduce"`) or as the browser's own (`"on"`): its condition's
 * text rewritten, the original kept to put back.
 */
export function forceMotion(
  container: CSSStyleSheet | CSSGroupingRule,
  motion: "on" | "reduce"
): void {
  let rules: CSSRuleList;
  try {
    rules = container.cssRules;
  } catch {
    return;
  }
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      const original = ORIGINAL_MEDIA.get(rule) ?? rule.media.mediaText;
      if (REDUCE.test(original) || NO_PREFERENCE.test(original)) {
        ORIGINAL_MEDIA.set(rule, original);
        REDUCE.lastIndex = 0;
        NO_PREFERENCE.lastIndex = 0;
        // Conditions that hold and fail at any width, valid inside `and`.
        const next =
          motion === "reduce"
            ? original
                .replace(REDUCE, "(min-width: 0px)")
                .replace(NO_PREFERENCE, "(not (min-width: 0px))")
            : original;
        // Written only when it changes: each write is a new media query the engine restyles the page for.
        if (rule.media.mediaText !== next) {
          rule.media.mediaText = next;
        }
      }
      REDUCE.lastIndex = 0;
      NO_PREFERENCE.lastIndex = 0;
    }
    if ("cssRules" in rule) {
      forceMotion(rule as CSSGroupingRule, motion);
    }
  }
}

export type { Rewrite };
