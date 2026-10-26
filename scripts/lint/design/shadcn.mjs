// The design system's class and style rules @shadcn/lint 0.2.3 held for the
// dashboard under ESLint, moved to Golar with the options they ran with
// (apps/dashboard/eslint.config.mjs at the move). Biome holds no-raw-colors
// for classes (biome.jsonc); these are the ones Biome's rules cannot hold:
//
// - no-raw-svg-colors: no-raw-colors' other half, a colour written into an
//   element's `fill`, `stroke`, `color`, `stop-color`, `flood-color` or
//   `lighting-color`.
// - no-unknown-classes: a class Tailwind writes no CSS for, and the project's
//   own CSS declares no selector for ("Classes Tailwind cannot generate",
//   shadcn-ui/lint docs/rules/no-unknown-classes.md). A colour token the
//   theme does not declare (`bg-highlight`) is one of them: shadcn left it
//   to no-raw-colors, whose Biome rule does not check it.
// - no-arbitrary-values: a value in brackets (`p-[13px]`) or an arbitrary
//   property (`[color:red]`), but the allowed patterns.
// - no-restyle: on a design-system component, a class that changes how it
//   looks; only where it stands is the caller's (the allow list).
// - require-static-classes: on a design-system component, a class value the
//   rules cannot read (a call, a `let`, an import, a glued `bg-${x}`).
// - no-inline-styles: a `style` attribute or `style:` directive setting a
//   property, but the allowed properties; a custom property passes unless it
//   carries a raw colour.
//
// Where shadcn named a class group (`m`, `basis`, `w`, …), the allow list
// here names the CSS properties that group writes, and a class is judged by
// what Tailwind compiles it to (tailwind.mjs): every property it sets must
// be one of them.
import { calleeName, keyOf, sitesOf, unwrap } from "./classes.mjs";
import { bindingAt, eachNode } from "./model.mjs";
import {
  classSelectors,
  declarationsOf,
  isArbitraryValue,
  isMarkerClass,
  knows,
  normalizeClass,
  splitVariants,
  themeClasses,
} from "./tailwind.mjs";

/** Exact names or `*` patterns, matched against a class without its variants. */
export function patterns(entries) {
  const compiled = entries.map(
    (entry) =>
      new RegExp(
        `^${entry.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*")}$`,
        "u"
      )
  );
  return (token) => {
    const { base } = splitVariants(token);
    return compiled.some((p) => p.test(base) || p.test(normalizeClass(token)));
  };
}

/* ------------------------------------------------------ no-unknown-classes */

/** The classes a component's own `<style>` declares. */
const styleClasses = (model) =>
  model.kind === "svelte" && model.ast.css
    ? classSelectors(model.text.slice(model.ast.css.start, model.ast.css.end))
    : new Set();

const MODIFIER = /\/[\w.%]+$/u;

/** Each class no CSS is written for. */
export function unknownClasses(model, { allow = [] } = {}) {
  const allowed = patterns(allow);
  const own = styleClasses(model);
  const findings = [];
  for (const site of sitesOf(model, { follow: false })) {
    for (const entry of site.entries) {
      const token = entry.name;
      const base = normalizeClass(token);
      const bare = base.replace(MODIFIER, "");
      if (
        !base ||
        base.startsWith("[") ||
        isMarkerClass(token) ||
        themeClasses.has(bare) ||
        own.has(bare) ||
        allowed(token) ||
        knows(token)
      ) {
        continue;
      }
      const variantOnly =
        token.includes(":") && knows(splitVariants(token).base);
      findings.push({
        start: entry.start,
        end: entry.end,
        message: variantOnly
          ? `"${token}" uses a variant this project's Tailwind does not know, so no CSS is generated for it. Use an existing variant, or declare it with @custom-variant in src/app.css.`
          : `"${token}" is not a class this project's Tailwind knows, so no CSS is generated for it. Fix the spelling, or declare it with @utility in src/app.css.`,
      });
    }
  }
  return findings;
}

/* ----------------------------------------------------- no-arbitrary-values */

/** Each class with a value in brackets. */
export function arbitraryValues(model, { allow = [] } = {}) {
  const allowed = patterns(allow);
  const findings = [];
  for (const site of sitesOf(model, { follow: false })) {
    for (const entry of site.entries) {
      if (isArbitraryValue(entry.name) && !allowed(entry.name)) {
        findings.push({
          start: entry.start,
          end: entry.end,
          message: `"${entry.name}" hardcodes an off-token value. Use a theme token or scale value instead.`,
        });
      }
    }
  }
  return findings;
}

/* -------------------------------------------------------------- no-restyle */

/**
 * The properties a placement class may set, by the shadcn class groups the
 * dashboard's allow list named: margins, a flex or grid item's share and
 * place, position and inset, stacking, and width constraints.
 */
export const PLACEMENT_PROPERTIES = new Set([
  // m, mx, my, ms, me, mbs, mbe, mt, mr, mb, ml
  "margin",
  "margin-inline",
  "margin-block",
  "margin-inline-start",
  "margin-inline-end",
  "margin-block-start",
  "margin-block-end",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  // basis, grow, shrink, order
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "order",
  // align-self, justify-self, place-self
  "align-self",
  "justify-self",
  "place-self",
  // col-start-end, col-start, col-end, row-start-end, row-start, row-end
  "grid-column",
  "grid-column-start",
  "grid-column-end",
  "grid-row",
  "grid-row-start",
  "grid-row-end",
  // position, inset, inset-x, inset-y, start, end, inset-bs, inset-be,
  // top, right, bottom, left, z
  "position",
  "inset",
  "inset-inline",
  "inset-block",
  "inset-inline-start",
  "inset-inline-end",
  "inset-block-start",
  "inset-block-end",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  // w, min-w, max-w, inline-size, min-inline-size, max-inline-size
  "width",
  "min-width",
  "max-width",
  "inline-size",
  "min-inline-size",
  "max-inline-size",
]);

/** Whether a class only places its element (what PLACEMENT allows). */
export function placesOnly(token, allowedClass) {
  if (isMarkerClass(token) || allowedClass(token)) {
    return true;
  }
  const base = normalizeClass(token);
  const declarations = declarationsOf(base);
  const own = declarations.filter((d) => !d.property.startsWith("--tw-"));
  if (
    own.length === 0 ||
    !own.every((d) => PLACEMENT_PROPERTIES.has(d.property))
  ) {
    return false;
  }
  // A length on Tailwind's numeric scale (`mt-2`, `w-4`) is none of the
  // theme's own steps: shadcn's classifier read a spacing scale as the
  // theme's keys alone, so it held no such class to a group, and a part
  // took none.
  // Tailwind writes such a step as a multiple of `--spacing`.
  return !own.some((d) => NUMERIC_STEP.test(d.value));
}

const NUMERIC_STEP = /var\(--spacing\)/u;

/** Each class on a design-system component that changes how it looks. */
export function restyle(model, { allowClasses = [] } = {}) {
  const allowedClass = patterns(allowClasses);
  const findings = [];
  for (const site of sitesOf(model, { follow: false })) {
    if (!site.component) {
      continue;
    }
    const { name } = site.component;
    for (const entry of site.entries) {
      if (entry.directive || placesOnly(entry.name, allowedClass)) {
        continue;
      }
      findings.push({
        start: entry.start,
        end: entry.end,
        message: site.component.wrapper
          ? `"${entry.name}" is not allowed on <${name}>: it hands its class to a design-system component, which owns its look. Use a variant; a caller places a part, never restyles it.`
          : `"${entry.name}" is not allowed on <${name}>: <${name}> owns its look. Use one of its variants, or add one where it is defined; a caller places a part, never restyles it.`,
      });
    }
  }
  return findings;
}

/* -------------------------------------------------- require-static-classes */

/** Each class value on a design-system component the rules cannot read. */
export function staticClasses(model) {
  const findings = [];
  for (const site of sitesOf(model, { follow: false })) {
    if (!site.component) {
      continue;
    }
    for (const node of site.unresolved) {
      findings.push({
        start: node.start,
        end: node.end,
        message: `Dynamically built ${site.attribute} on <${site.component.name}> cannot be checked. Use static class strings.`,
      });
    }
  }
  return findings;
}

/* -------------------------------------------------------- no-inline-styles */

const COLOR_FUNCTION =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch|color|color-mix|light-dark)\(/iu;
const NAMED_COLORS = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " "
  )
);

const LEAVES = /[\s,()/]+/u;

/** Whether a CSS value names a colour outright (not through a variable). */
export function hasRawColor(value) {
  const text = value
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, " ")
    .replace(/url\([^)]*\)/giu, " ")
    // A colour function whose channels are one variable reads the theme.
    .replace(
      /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(\s*var\([^()]*\)\s*(?:\/\s*(?:[\d.]+%?|var\([^()]*\)))?\s*\)/giu,
      " "
    )
    .replace(/var\([^)]*\)/giu, " ");
  if (COLOR_FUNCTION.test(text)) {
    return true;
  }
  return text
    .split(LEAVES)
    .some((leaf) => NAMED_COLORS.has(leaf.toLowerCase()));
}

/** `backgroundColor` as `background-color`; a custom property as it is. */
const cssName = (name) =>
  name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`).toLowerCase();

/** The declarations of a style text, split at top-level semicolons. */
function declarationsIn(css) {
  const out = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      out.push(css.slice(start, i));
      start = i + 1;
    }
  }
  out.push(css.slice(start));
  return out.flatMap((declaration) => {
    const colon = declaration.indexOf(":");
    const property = colon === -1 ? "" : declaration.slice(0, colon).trim();
    return property ? [{ property, value: declaration.slice(colon + 1) }] : [];
  });
}

/** The SVG and HTML attributes that paint a colour (shadcn's no-raw-colors). */
const COLOR_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "color",
  "stop-color",
  "flood-color",
  "lighting-color",
  "stopColor",
  "floodColor",
  "lightingColor",
]);

/**
 * Each colour attribute on an element that names a colour outright: the
 * half of @shadcn/lint's no-raw-colors Biome's noTailwindRawColors does not
 * hold ("The rule checks literal strings in `fill`, `stroke`, `color`,
 * `stopColor`, `floodColor`, and `lightingColor` on intrinsic elements",
 * shadcn-ui/lint docs/rules/no-raw-colors.md). `currentColor` and a theme
 * variable pass.
 */
/** A colour attribute's text, when it is written out (text, or a string in braces). */
function writtenColor(attribute) {
  const parts = attribute.value === true ? [] : [attribute.value].flat();
  if (parts.length > 0 && parts.every((part) => part.type === "Text")) {
    return parts.map((part) => part.raw).join("");
  }
  const literal =
    parts.length === 1 && parts[0].type === "ExpressionTag"
      ? unwrap(parts[0].expression)
      : null;
  return literal?.type === "Literal" && typeof literal.value === "string"
    ? literal.value
    : null;
}

export function rawSvgColors(model) {
  if (model.kind !== "svelte") {
    return [];
  }
  const findings = [];
  eachNode(model, (node) => {
    if (node.type !== "RegularElement" && node.type !== "SvelteElement") {
      return;
    }
    for (const attribute of node.attributes ?? []) {
      const text =
        attribute.type === "Attribute" && COLOR_ATTRIBUTES.has(attribute.name)
          ? writtenColor(attribute)
          : null;
      if (text !== null && hasRawColor(text)) {
        findings.push({
          start: attribute.start,
          end: attribute.end,
          message: `"${attribute.name}" paints the raw colour "${text}". Use currentColor with a text colour class, or a theme variable (var(--…)).`,
        });
      }
    }
  });
  return findings;
}

/** Each inline style that sets a property, or a custom property to a raw colour. */
export function inlineStyles(model, { allow = [] } = {}) {
  if (model.kind !== "svelte") {
    return [];
  }
  const allowed = allow.map(
    (entry) => new RegExp(`^${cssName(entry).replace(/\*/gu, ".*")}$`, "u")
  );
  const exempt = (property) => allowed.some((p) => p.test(cssName(property)));
  const findings = [];
  const report = (node, message) =>
    findings.push({ start: node.start, end: node.end, message });

  /** A value's text when it is one, or null. */
  const textOf = (node) => {
    const n = unwrap(node);
    if (n?.type === "Literal" && typeof n.value === "string") {
      return n.value;
    }
    if (n?.type === "TemplateLiteral") {
      return n.quasis.map((q) => q.value.cooked ?? "").join("\u{fffc}");
    }
    return null;
  };

  /** Whether a value carries a raw colour, as far as it can be read. */
  const carriesRawColor = (node, seen = new Set()) => {
    const n = unwrap(node);
    if (!n) {
      return false;
    }
    switch (n.type) {
      case "Literal":
        return typeof n.value === "string" && hasRawColor(n.value);
      case "TemplateLiteral":
        return hasRawColor(n.quasis.map((q) => q.value.cooked ?? "").join(" "));
      case "ConditionalExpression":
        return (
          carriesRawColor(n.consequent, seen) ||
          carriesRawColor(n.alternate, seen)
        );
      case "LogicalExpression":
        return carriesRawColor(n.left, seen) || carriesRawColor(n.right, seen);
      case "Identifier": {
        const b = bindingAt(model, n.name, n.start);
        if (!b || seen.has(b) || b.kind !== "const" || !b.init) {
          return false;
        }
        return carriesRawColor(b.init, new Set([...seen, b]));
      }
      default:
        return false;
    }
  };

  const judge = (property, at, value, text) => {
    if (exempt(property)) {
      return;
    }
    if (!property.startsWith("--")) {
      report(
        at,
        `Inline style sets ${property}. Style through classes; use CSS custom properties for dynamic values.`
      );
      return;
    }
    const raw = text === undefined ? carriesRawColor(value) : hasRawColor(text);
    if (raw) {
      report(
        at,
        `Custom property ${property} hardcodes a color. Define it as a theme token instead of injecting a raw value.`
      );
    }
  };

  const dynamic = (at) =>
    report(
      at,
      "Dynamic style object cannot be checked. Build it from CSS custom properties only."
    );

  /** Whether a name is a `style` prop the component received (forwarded). */
  const forwardedStyle = (identifier) => {
    const d = bindingAt(model, identifier.name, identifier.start)?.declarator;
    return Boolean(
      d &&
      d.id.type === "ObjectPattern" &&
      calleeName(unwrap(d.init) ?? {}) === "$props" &&
      d.id.properties.some(
        (p) =>
          p.type !== "RestElement" &&
          keyOf(p) === "style" &&
          (p.value?.type === "AssignmentPattern" ? p.value.left : p.value)
            ?.name === identifier.name
      )
    );
  };

  /** A value with nothing to read in it: `undefined`, `null`. */
  const nothing = (expr) =>
    (expr.type === "Identifier" && expr.name === "undefined") ||
    (expr.type === "Literal" && expr.value === null);

  const checkObject = (expr) => {
    for (const property of expr.properties) {
      const key = property.type === "Property" ? keyOf(property) : null;
      if (key === null || property.computed) {
        dynamic(property);
      } else {
        judge(key, property.value, property.value);
      }
    }
  };

  const checkName = (expr, at, seen) => {
    if (forwardedStyle(expr)) {
      return;
    }
    const b = bindingAt(model, expr.name, expr.start);
    if (b?.kind === "const" && b.init && !seen.has(b)) {
      check(b.init, at, new Set([...seen, b]));
    } else {
      dynamic(at);
    }
  };

  const BRANCHES = {
    ConditionalExpression(expr, _at, seen) {
      check(expr.consequent, expr.consequent, seen);
      check(expr.alternate, expr.alternate, seen);
    },
    LogicalExpression(expr, _at, seen) {
      if (expr.operator !== "&&") {
        check(expr.left, expr.left, seen);
      }
      check(expr.right, expr.right, seen);
    },
    Identifier: checkName,
    ObjectExpression: checkObject,
  };

  function check(raw, at, seen = new Set()) {
    const expr = unwrap(raw);
    if (!expr || nothing(expr)) {
      return;
    }
    if (expr.type === "CallExpression" && calleeName(expr) === "$derived") {
      check(expr.arguments[0], at, seen);
      return;
    }
    const css = textOf(expr);
    if (css !== null) {
      for (const { property, value } of declarationsIn(css)) {
        judge(property, at, null, value);
      }
      return;
    }
    const branch = BRANCHES[expr.type];
    if (branch) {
      branch(expr, at, seen);
    } else {
      dynamic(at);
    }
  }

  const partsOf = (value) => {
    if (value === true) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  };

  const styleAttribute = (attribute) => {
    const parts = partsOf(attribute.value);
    if (parts.length === 1 && parts[0].type === "ExpressionTag") {
      check(parts[0].expression, parts[0].expression);
      return;
    }
    // Text with values written into it: each declaration's property is
    // read; a value from an expression is no colour it can see.
    const css = parts
      .map((p) => (p.type === "Text" ? p.raw : "\u{fffc}"))
      .join("");
    for (const { property, value } of declarationsIn(css)) {
      judge(property, attribute, null, value);
    }
  };

  const styleDirective = (attribute) => {
    const parts = partsOf(attribute.value);
    const text =
      attribute.value !== true && parts.every((p) => p.type === "Text")
        ? parts.map((p) => p.raw).join("")
        : undefined;
    const expression =
      parts.length === 1 && parts[0].type === "ExpressionTag"
        ? parts[0].expression
        : null;
    judge(attribute.name, attribute, expression, text);
  };

  const spread = (attribute) => {
    const arg = unwrap(attribute.expression);
    const style =
      arg?.type === "ObjectExpression"
        ? arg.properties.find(
            (p) => p.type === "Property" && keyOf(p) === "style"
          )
        : null;
    if (style) {
      check(style.value, style.value);
    }
  };

  eachNode(model, (node) => {
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === "Attribute" && attribute.name === "style") {
        styleAttribute(attribute);
      } else if (attribute.type === "StyleDirective") {
        styleDirective(attribute);
      } else if (attribute.type === "SpreadAttribute") {
        spread(attribute);
      }
    }
  });
  return findings;
}
