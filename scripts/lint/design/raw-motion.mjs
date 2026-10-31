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
//   written as a number, or `element.animate(frames, 120)`: `dur("--dur-…")`;
// - a length a keyframe travels, in `element.animate(frames)`'s frames or a
//   Svelte transition's `css`, written out (`translateX(18px)`) or as a
//   number before its unit (`${(1 - t) * 8}px`): `var(--pop-rise)` or its
//   token. A template's number before `ms` or `s` is a time written out too.
//   A stylesheet's `@keyframes` lengths are no-raw-css-values.grit's.
//
// The motion helpers that hold the curves as functions of t (curves, rows,
// hang) are the one place a `cubic-bezier` is written (index.mjs). A literal
// that is no motion of the design says why in a
// `golar-ignore-next-line house/no-raw-motion -- <reason>` comment.
import { bindingAt, eachNode, parentOf } from "./model.mjs";
import { rawLengths } from "./raw-values.mjs";

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
function refused(text, { css = true, curveOnly = false, curves = false } = {}) {
  if (curveOnly && KEYWORD_ALONE.test(text)) {
    return `CSS's \`${text.trim()}\` curve: name an --ease-* token (ease("--ease-…") in a script), or linear for a discrete property`;
  }
  const times = css
    ? (text.match(TIME) ?? []).filter((t) => !ZERO.test(t))
    : [];
  if (times.length > 0) {
    return `the time ${times.join(", ")}: write var(--dur-…), dur("--dur-…") in a script, or staggered(n) for a run of arrivals`;
  }
  if (!curves && BEZIER.test(text)) {
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

const ARITHMETIC = new Set(["+", "-", "*"]);
/**
 * A number past ±1 written into a sum or a product (a length's
 * `(1 - t) * 8`), or a name for one (`const NUDGE_PX = 40`), or null.
 */
function writtenNumber(node, model = null) {
  if (node?.type === "Literal" && typeof node.value === "number") {
    return Math.abs(node.value) > 1 ? node : null;
  }
  if (node?.type === "Identifier" && model) {
    const binding = bindingAt(model, node.name, node.start);
    return binding?.kind === "const" && binding.init?.type === "Literal"
      ? writtenNumber(binding.init)
      : null;
  }
  if (node?.type === "UnaryExpression" && node.operator === "-") {
    return writtenNumber(node.argument, model);
  }
  if (node?.type === "BinaryExpression" && ARITHMETIC.has(node.operator)) {
    return writtenNumber(node.left, model) ?? writtenNumber(node.right, model);
  }
  return null;
}
/** Whether `node` reads a token (`dur("--dur-…")`) anywhere in it. */
const readsToken = (node) =>
  node?.type === "CallExpression" ||
  (node?.type === "BinaryExpression" &&
    (readsToken(node.left) || readsToken(node.right)));
/**
 * A duration written into a sum or a product (`i * 30`): a number of ten
 * or more milliseconds, in a sum that reads no token. A token's multiple
 * (`dur(…) * 1.5`), a frame count (`STEP * 2`) and seconds made
 * milliseconds (`* 1000`) are none.
 */
function writtenTime(node) {
  if (node?.type !== "BinaryExpression" || readsToken(node)) {
    return null;
  }
  const number = writtenNumber(node);
  return number && Math.abs(number.value) >= 10 && number.value !== 1000
    ? number
    : null;
}
const UNIT_AFTER = /^(?:px|rem|em|m?s)(?![\w-])/u;

/**
 * What a keyframe's text travels written out: each length literal, and each
 * number a template writes before a length or a time unit.
 */
function keyframeLiterals(model, node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    const lengths = rawLengths(node.value);
    return lengths.length > 0
      ? [{ at: node, said: `the length ${lengths.join(", ")} in a keyframe` }]
      : [];
  }
  if (node.type !== "TemplateLiteral") {
    return [];
  }
  const text = node.quasis.map((q) => q.value.cooked ?? "").join(" ");
  const lengths = rawLengths(text);
  const found =
    lengths.length > 0
      ? [{ at: node, said: `the length ${lengths.join(", ")} in a keyframe` }]
      : [];
  node.expressions.forEach((expression, i) => {
    const number = writtenNumber(expression, model);
    if (number && UNIT_AFTER.test(node.quasis[i + 1]?.value.cooked ?? "")) {
      // Reported where the template writes it: a name's number may stand in
      // another file's text.
      found.push({
        at:
          number.start >= node.start && number.end <= node.end
            ? number
            : expression,
        said: "a length or a time written as a number",
      });
    }
  });
  return found;
}

/**
 * Every string and template under `node`. The frames themselves, or one of
 * them, named by a `const` are read through it (`const frames = […]`); a
 * name inside a frame is a value read, not a frame.
 */
function textsUnder(model, node) {
  const out = [];
  const seen = new Set();
  /** How each kind of node is read; any other, through its children. */
  const READ = {
    Identifier(n, frame) {
      const binding = frame ? bindingAt(model, n.name, n.start) : null;
      if (binding?.kind === "const" && binding.init) {
        visit(binding.init, true);
      }
    },
    ArrayExpression(n) {
      for (const element of n.elements) {
        visit(element, true);
      }
    },
    ConditionalExpression(n, frame) {
      visit(n.test);
      visit(n.consequent, frame);
      visit(n.alternate, frame);
    },
    Literal(n) {
      out.push(n);
    },
    TemplateLiteral(n) {
      out.push(n);
    },
  };
  const children = (n) =>
    Object.entries(n)
      .filter(
        ([key, value]) =>
          key !== "loc" &&
          key !== "metadata" &&
          value &&
          typeof value === "object"
      )
      .flatMap(([, value]) => [value].flat());
  function visit(n, frame = false) {
    if (!n || typeof n !== "object" || seen.has(n)) {
      return;
    }
    seen.add(n);
    const read = READ[n.type];
    if (read) {
      read(n, frame);
      return;
    }
    for (const child of children(n)) {
      visit(child);
    }
  }
  visit(node, true);
  return out;
}

/** A keyframe's travel written out, under `node`: animate()'s frames, a transition's `css`. */
const keyframeTravel = (model, node) =>
  textsUnder(model, node).flatMap((text) => keyframeLiterals(model, text));

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
  Literal(model, node, { curves }) {
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
        curves,
      }),
    };
  },
  TemplateLiteral(_model, node, { curves }) {
    const text = node.quasis.map((q) => q.value.cooked ?? "").join(" ");
    return {
      at: node,
      said: refused(text, { css: CSS_TEXT.test(text), curves }),
    };
  },
  // Words on the page and an attribute's words are copy; a style and a
  // class are CSS.
  Text(model, node, { curves }) {
    if (cssAttribute(parentOf(model, node))) {
      return { at: node, said: refused(node.data, { curves }) };
    }
  },
  Property(model, node) {
    const key = keyName(node);
    if (
      TIME_KEYS.has(key) &&
      (isRawNumber(node.value) || writtenTime(node.value))
    ) {
      return { at: node.value, said: "a duration as a number" };
    }
    // A Svelte transition's frames.
    if (
      key === "css" &&
      (node.value?.type === "ArrowFunctionExpression" ||
        node.value?.type === "FunctionExpression")
    ) {
      return keyframeTravel(model, node.value.body);
    }
  },
  CallExpression(model, node) {
    const { callee, arguments: args } = node;
    if (
      callee?.type !== "MemberExpression" ||
      callee.computed ||
      callee.property.name !== "animate"
    ) {
      return;
    }
    const found = args?.[0] ? keyframeTravel(model, args[0]) : [];
    if (isRawNumber(args?.[1])) {
      found.push({ at: args[1], said: "a duration as a number" });
    }
    return found;
  },
};

export function rawMotion(model, { curves = false } = {}) {
  const findings = [];
  const report = (node, said) =>
    findings.push({
      start: node.start,
      end: node.end,
      message: `This writes ${said}. A duration or a curve is a motion token (design/tokens/cawco.tokens.json, DESIGN.md Motion grammar).`,
    });
  eachNode(model, (node) => {
    const found = READERS[node.type]?.(model, node, { curves });
    for (const one of [found ?? []].flat()) {
      if (one.said) {
        report(one.at, one.said);
      }
    }
  });
  return findings;
}
