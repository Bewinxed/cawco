/**
 * A media query's `prefers-color-scheme` answered for a scheme, where no
 * browser setting can: a frame's preferred scheme follows its element's
 * `color-scheme` in Firefox and WebKit (CSS Color Adjustment 1, "Opting
 * Into a Preferred Color Scheme"), and the system's in Chromium. Read in
 * Playwright on 2026-11-22: a same-origin frame given `color-scheme: dark`
 * under a light system answered `prefers-color-scheme: dark` in Firefox 159
 * and WebKit 27.2, and light in Chromium 158; the system's dark answered
 * dark in Chromium whatever the frame said. A page drawn in a scheme of
 * CawCo's choosing (the overlay's copy for a thumbnail, a design folder's
 * frame on the design graph) has each query asking it settled instead, so
 * its own rule for that scheme holds in every engine.
 */

/** A scheme a page is drawn in. */
export type MediaScheme = "light" | "dark";

/** A `prefers-color-scheme` feature in a media query. */
const PREFERS = /\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/giu;
/** Media features that always hold, and never do (range syntax: a width is never negative). */
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

/** `media` with each `prefers-color-scheme` feature settled for `scheme`; null when it names none. */
export function settledMedia(
  media: string,
  scheme: MediaScheme
): string | null {
  PREFERS.lastIndex = 0;
  if (!PREFERS.test(media)) {
    return null;
  }
  return media.replace(PREFERS, (_, said: string) =>
    said.toLowerCase() === scheme ? ALWAYS : NEVER
  );
}

/** Whether `rule` holds rules of its own (`@media`, `@supports`, `@layer`): by shape, as it may be another window's. */
const isGrouping = (rule: CSSRule): rule is CSSGroupingRule =>
  "cssRules" in rule;
/** Whether `rule` is an `@import`: by shape, as it may be another window's. */
const isImport = (rule: CSSRule): rule is CSSImportRule =>
  "styleSheet" in rule && "href" in rule;

/**
 * `visit` on each rule of `sheet` at any depth: inside a grouping rule and
 * through each `@import`'s sheet. A sheet of another origin keeps its
 * rules to itself, and is passed over.
 */
export function eachRule(
  sheet: CSSStyleSheet,
  visit: (rule: CSSRule) => void
): void {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return;
  }
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      visit(rule);
      if (isGrouping(rule)) {
        walk(rule.cssRules);
      }
      if (isImport(rule) && rule.styleSheet) {
        eachRule(rule.styleSheet, visit);
      }
    }
  };
  walk(rules);
}
