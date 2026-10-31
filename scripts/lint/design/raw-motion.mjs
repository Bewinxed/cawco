// The motion rule's markup and script half: a duration or a curve on the
// dashboard is a motion token, never a literal (DESIGN.md, Motion grammar:
// "All motion stands on three curves, `linear`, and a short duration scale";
// "The house does not use CSS `ease`"). The stylesheet half is Biome's
// (scripts/lint/no-raw-motion.grit, over every stylesheet and `<style>`).
//
// house/no-raw-motion reports, in a module, a component's script and its
// attributes (a `style`, a `style:` directive, a class's arbitrary value):
//
// - a CSS time written out (`120ms`, `0.24s`): `var(--dur-…)`, or `dur()`
//   (lib/cawco/motion/curves.svelte.ts) in a script, a run of arrivals
//   `staggered(n)`; `0s` and `0ms` say "at once" and stand;
// - a `cubic-bezier(…)`: `var(--ease-…)`, or `ease()` in a script;
// - CSS's own `ease`, `ease-in`, `ease-out` or `ease-in-out` as a curve (after
//   a duration or a `var()`, as a timing function, or as an `easing`): its
//   `--ease-*` token, or `linear` for a discrete property. The Tailwind class
//   `ease-out` is the house token's own utility and stands;
// - a Web Animation's or a Svelte transition's `duration` or `delay`
//   written as a number, or `element.animate(frames, 120)`: `dur("--dur-…")`.
//
// The motion helpers that hold the curves as functions of t (curves, rows,
// hang) are the one place a `cubic-bezier` is written (index.mjs). A literal
// that is no motion of the design says why in a
// `golar-ignore-next-line house/no-raw-motion -- <reason>` comment.
import { eachNode, parentOf } from "./model.mjs";

const TIME = /(?<![\w.#-])(?:\d+\.?\d*|\.\d+)m?s(?![\w-])/gu;
const ZERO = /^0*\.?0*m?s$/u;
const BEZIER = /cubic-bezier\(/u;
const KEYWORD = "ease(?:-in-out|-in|-out)?";
/**
 * A CSS keyword curve where a curve stands: after a duration or a `var()`,
 * or as a timing function's value. A class list's `duration-(--dur-x)
 * ease-out` is two house utilities, and stands.
 */
const KEYWORD_CURVE = new RegExp(
  `(?:(?:\\d(?:ms|s)|var\\([^()]*\\))[\\s_]+|timing-function\\s*:\\s*)${KEYWORD}(?![\\w-])`,
  "u"
);
const KEYWORD_ALONE = new RegExp(`^\\s*${KEYWORD}\\s*$`, "u");
/** The properties whose string is a curve and nothing else. */
const CURVE_KEYS = new Set([
  "easing",
  "transitionTimingFunction",
  "animationTimingFunction",
]);
/** The properties whose string is CSS motion, whatever else it says. */
const MOTION_KEYS = new Set([
  "transition",
  "animation",
  "transitionDuration",
  "transitionDelay",
  "animationDuration",
  "animationDelay",
]);
/**
 * A script's string that is CSS, not words: a declaration, a `var()`, a
 * curve. "timed out after 30000ms" is a message, and stands.
 */
const CSS_TEXT =
  /(?:transition|animation)[\w-]*\s*:|--[\w-]+\s*:|var\(--|cubic-bezier\(|\b(?:linear|step-(?:start|end))\b/u;
/** The properties whose number is a motion's time. */
const TIME_KEYS = new Set(["duration", "delay", "endDelay"]);

/** What a string writes that the rule refuses, said for a finding, or null. */
function refused(text, { css = true, curveOnly = false } = {}) {
  if (curveOnly && KEYWORD_ALONE.test(text)) {
    return `CSS's \`${text.trim()}\` curve: name an --ease-* token (ease("--ease-…") in a script), or linear for a discrete property`;
  }
  const times = css
    ? (text.match(TIME) ?? []).filter((t) => !ZERO.test(t))
    : [];
  if (times.length > 0) {
    return `the time ${times.join(", ")}: write var(--dur-…), dur("--dur-…") in a script, or staggered(n) for a run of arrivals`;
  }
  if (BEZIER.test(text)) {
    return 'a cubic-bezier(): write var(--ease-…), or ease("--ease-…") in a script';
  }
  const keyword = text.match(KEYWORD_CURVE);
  if (keyword) {
    return `CSS's own curve in "${keyword[0].trim()}": name an --ease-* token, or linear for a discrete property`;
  }
  return null;
}

/** A property's name, written plain or quoted. */
const keyName = (property) => {
  if (property.key?.type === "Identifier") {
    return property.key.name;
  }
  return typeof property.key?.value === "string" ? property.key.value : null;
};

/** A number literal other than 0, plain or negated. */
const isRawNumber = (node) => {
  const n =
    node?.type === "UnaryExpression" && node.operator === "-"
      ? node.argument
      : node;
  return n?.type === "Literal" && typeof n.value === "number" && n.value !== 0;
};

/** Whether an attribute's text is CSS: a style, a `style:` directive, a class. */
const cssAttribute = (node) =>
  node?.type === "StyleDirective" ||
  (node?.type === "Attribute" &&
    (node.name === "style" || node.name === "class"));

/**
 * What each kind of node writes that the rule refuses: where to say it,
 * and what; undefined where it writes nothing refused.
 */
const READERS = {
  Literal(model, node) {
    if (typeof node.value !== "string") {
      return;
    }
    const parent = parentOf(model, node);
    const key =
      parent?.type === "Property" && parent.value === node
        ? keyName(parent)
        : null;
    return {
      at: node,
      said: refused(node.value, {
        css: MOTION_KEYS.has(key) || CSS_TEXT.test(node.value),
        curveOnly: CURVE_KEYS.has(key),
      }),
    };
  },
  TemplateLiteral(_model, node) {
    const text = node.quasis.map((q) => q.value.cooked ?? "").join(" ");
    return { at: node, said: refused(text, { css: CSS_TEXT.test(text) }) };
  },
  // Words on the page and an attribute's words are copy; a style and a
  // class are CSS.
  Text(model, node) {
    if (cssAttribute(parentOf(model, node))) {
      return { at: node, said: refused(node.data) };
    }
  },
  Property(_model, node) {
    if (TIME_KEYS.has(keyName(node)) && isRawNumber(node.value)) {
      return { at: node.value, said: "a duration as a number" };
    }
  },
  CallExpression(_model, node) {
    const { callee, arguments: args } = node;
    if (
      callee?.type === "MemberExpression" &&
      !callee.computed &&
      callee.property.name === "animate" &&
      isRawNumber(args?.[1])
    ) {
      return { at: args[1], said: "a duration as a number" };
    }
  },
};

export function rawMotion(model) {
  const findings = [];
  const report = (node, said) =>
    findings.push({
      start: node.start,
      end: node.end,
      message: `This writes ${said}. A duration or a curve is a motion token (design/tokens/cawco.tokens.json, DESIGN.md Motion grammar).`,
    });
  eachNode(model, (node) => {
    const found = READERS[node.type]?.(model, node);
    if (found?.said) {
      report(found.at, found.said);
    }
  });
  return findings;
}
