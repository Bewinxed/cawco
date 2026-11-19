// house/typed-property-read: a custom property script reads as a number is
// registered with a typed `@property` (`<length>`, `<number>`, `<integer>`)
// in a sheet app.css loads.
//
// An unregistered custom property computes to its text as written: read
// with `getPropertyValue("--x")` and parsed (`parseFloat`, `parseInt`,
// `Number`, unary `+`), `12px` gives 12, but `calc(var(--spacing) * 37)`
// gives NaN and `0.75rem` gives 0.75, silently. Files' cards fell to
// one-pixel slivers so when a codemod rewrote `--card-min` as a calc()
// (75970b99ad). A typed registration computes to px (or a plain number)
// however the value is written.
//
// The rule follows the value read and the name asked for within the file:
//
// - the read's text through `.trim()`, a `const` and a helper that returns
//   it (`const px = (name) => parseFloat(style.getPropertyValue(name))`), to
//   a numeric parse;
// - the name back from a literal, a `const`, a `for … of` or an array
//   method's callback over an array of literals, and a parameter of a helper
//   the file names to every call of it in the file.
//
// A name it cannot follow to its literals is reported: an exported helper's
// parameter is its callers', in other files, unless {@link READERS} lists the
// helper, whose callers the rule checks wherever they import it, and an
// in-file helper's argument no literal holds is let stand only where
// {@link UNFOLLOWED_ARGUMENTS} lists the helper with why. A standard property
// (`border-top-width`) computes to px already, and stands. The planted reads
// are scripts/lint/fixtures/design/planted-typed-read.ts.
import fs from "node:fs";
import path from "node:path";
import { bindingAt, DASHBOARD, eachNode, parentOf } from "./model.mjs";

const APP_CSS = path.join(DASHBOARD, "src/app.css");
/** The syntaxes whose computed value is one plain number, in px for a length. */
const NUMERIC_SYNTAX = /^\s*["']<(?:length|number|integer)>["']\s*$/u;
const PROPERTY_RULE = /@property\s+(--[\w-]+)\s*\{([^}]*)\}/gu;
const SYNTAX = /(?:^|;)\s*syntax\s*:\s*([^;]+)/u;
const IMPORT = /@import\s+["'](\.[^"']+\.css)["']/gu;
/** A module's script extension, which an import may name or leave out. */
const SCRIPT_EXTENSION = /\.(?:ts|js)$/u;
const COMMENT = /\/\*[\s\S]*?\*\//gu;
/** The array methods whose callback is handed each element first. */
const EACH = new Set([
  "map",
  "flatMap",
  "forEach",
  "filter",
  "some",
  "every",
  "find",
]);
/** The calls that parse a string as a number. */
const PARSERS = new Set(["parseFloat", "parseInt", "Number"]);
/** Wrappers an expression's value passes through unchanged. */
const SAME = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "ParenthesizedExpression",
]);

/**
 * Exported helpers whose parameter is a custom property's name the helper
 * parses as a number, so the read is checked at each caller's literal
 * instead of the helper's parameter. File from apps/dashboard, helper name,
 * the parameter's index, and why the helper reads a name it is handed.
 */
const READERS = [
  {
    file: "src/lib/platform/motion/curves.svelte.ts",
    name: "numberOf",
    index: 0,
    why: "the house's one reader of a numeric token off the token root (an HTML page's dials read theirs off their own shadow root, tokensOn), each caller naming its token",
  },
];

/**
 * In-file helpers whose parameter is handed a name no literal holds, each
 * with why the names it can be are all registered: a call whose argument
 * the rule cannot follow is let stand there, and its literal calls are still
 * checked. File from apps/dashboard, helper name, the parameter's index.
 */
const UNFOLLOWED_ARGUMENTS = [
  {
    file: "src/lib/cawco/blocks/BlockPage.svelte",
    name: "lengthOf",
    index: 1,
    why: "a block's `measure`, typed BlockMeasure: the union of the block measure tokens design.css types as lengths",
  },
];

let registry = null;
/** The custom properties a sheet app.css loads registers with a numeric syntax. */
function typedProperties() {
  if (registry) {
    return registry;
  }
  registry = new Set();
  const seen = new Set();
  const read = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) {
      return;
    }
    seen.add(file);
    const text = fs.readFileSync(file, "utf8").replace(COMMENT, "");
    for (const [, name, body] of text.matchAll(PROPERTY_RULE)) {
      const syntax = body.match(SYNTAX)?.[1];
      if (syntax && NUMERIC_SYNTAX.test(syntax)) {
        registry.add(name);
      }
    }
    for (const [, sheet] of text.matchAll(IMPORT)) {
      read(path.resolve(path.dirname(file), sheet));
    }
  };
  read(APP_CSS);
  return registry;
}

const isCall = (node, name) =>
  node?.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.name === name;

/** The node `node`'s value stands in, through wrappers and `.trim()`. */
function carried(model, node) {
  let at = node;
  for (;;) {
    const parent = parentOf(model, at);
    if (parent && SAME.has(parent.type)) {
      at = parent;
    } else if (
      parent?.type === "MemberExpression" &&
      parent.object === at &&
      isCall(parentOf(model, parent), "trim")
    ) {
      at = parentOf(model, parent);
    } else {
      return at;
    }
  }
}

/** Whether `parent` parses `node` as a number. */
function parses(parent, node) {
  if (parent?.type === "UnaryExpression") {
    return parent.operator === "+" || parent.operator === "-";
  }
  if (parent?.type !== "CallExpression" || parent.arguments[0] !== node) {
    return false;
  }
  const { callee } = parent;
  if (callee.type === "Identifier") {
    return PARSERS.has(callee.name);
  }
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Number" &&
    (callee.property.name === "parseFloat" ||
      callee.property.name === "parseInt")
  );
}

/** The function a node stands directly in (its body or a return in it). */
function functionOf(model, node) {
  let at = parentOf(model, node);
  while (at) {
    if (
      at.type === "ArrowFunctionExpression" ||
      at.type === "FunctionExpression" ||
      at.type === "FunctionDeclaration"
    ) {
      return at;
    }
    at = parentOf(model, at);
  }
  return null;
}

/** The name the file calls a function by, and whether it is exported. */
function nameOf(model, fn) {
  if (fn.type === "FunctionDeclaration" && fn.id) {
    return {
      name: fn.id.name,
      exported: parentOf(model, fn)?.type === "ExportNamedDeclaration",
    };
  }
  const declarator = parentOf(model, fn);
  if (
    declarator?.type === "VariableDeclarator" &&
    declarator.init === fn &&
    declarator.id.type === "Identifier"
  ) {
    return {
      name: declarator.id.name,
      exported:
        parentOf(model, parentOf(model, declarator))?.type ===
        "ExportNamedDeclaration",
    };
  }
  return null;
}

/** Every reference in the file to the binding `name` has at `at`. */
function referencesOf(model, name, binding) {
  const refs = [];
  eachNode(model, (node, parent, key) => {
    if (
      node.type === "Identifier" &&
      node.name === name &&
      !(parent?.type === "MemberExpression" && key === "property") &&
      !(parent?.type === "Property" && key === "key" && !parent.shorthand) &&
      !(parent?.type === "VariableDeclarator" && key === "id") &&
      bindingAt(model, name, node.start) === binding
    ) {
      refs.push(node);
    }
  });
  return refs;
}

/** The calls of the function `fn` in the file, or null when it escapes. */
function callsOf(model, fn) {
  const named = nameOf(model, fn);
  if (!named) {
    return null;
  }
  const declared = bindingAt(model, named.name, fn.start);
  const calls = [];
  for (const ref of referencesOf(model, named.name, declared)) {
    const parent = parentOf(model, ref);
    if (parent?.type === "CallExpression" && parent.callee === ref) {
      calls.push(parent);
    } else if (parent?.type !== "FunctionDeclaration") {
      return null;
    }
  }
  return calls;
}

/** The elements of an array a literal writes out, spreads included, or null. */
function itemsOf(model, node, depth) {
  if (depth > 8 || !node) {
    return null;
  }
  if (SAME.has(node.type)) {
    return itemsOf(model, node.expression, depth + 1);
  }
  if (node.type === "ConditionalExpression") {
    const a = itemsOf(model, node.consequent, depth + 1);
    const b = itemsOf(model, node.alternate, depth + 1);
    return a && b ? [...a, ...b] : null;
  }
  if (node.type === "Identifier") {
    const binding = bindingAt(model, node.name, node.start);
    return binding?.kind === "const"
      ? itemsOf(model, binding.init, depth + 1)
      : null;
  }
  if (node.type !== "ArrayExpression") {
    return null;
  }
  const items = [];
  for (const element of node.elements) {
    if (element?.type === "SpreadElement") {
      const spread = itemsOf(model, element.argument, depth + 1);
      if (!spread) {
        return null;
      }
      items.push(...spread);
    } else if (element) {
      items.push(element);
    }
  }
  return items;
}

/** The fixed names a list of expressions can be, or null. */
function namesOfAll(model, nodes, depth) {
  const names = [];
  for (const node of nodes) {
    const found = namesOf(model, node, depth + 1);
    if (!found) {
      return null;
    }
    names.push(...found);
  }
  return names;
}

/**
 * The names `node` can be: the literals it is followed back to, or null
 * when it leads somewhere the file cannot say. An exported reader's
 * parameter is its callers' (READERS), and gives no names here.
 */
function namesOf(model, node, depth = 0) {
  if (depth > 12 || !node) {
    return null;
  }
  if (SAME.has(node.type)) {
    return namesOf(model, node.expression, depth + 1);
  }
  if (node.type === "Literal") {
    return typeof node.value === "string" ? [node.value] : null;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return [node.quasis[0].value.cooked];
  }
  if (node.type === "ConditionalExpression") {
    return namesOfAll(model, [node.consequent, node.alternate], depth);
  }
  if (node.type !== "Identifier") {
    return null;
  }
  const binding = bindingAt(model, node.name, node.start);
  if (binding?.kind === "const" && binding.init) {
    return namesOf(model, binding.init, depth + 1);
  }
  return boundNames(model, node, depth);
}

/**
 * The names an identifier no `const` holds can be: a `for (const name of
 * [...])`'s elements, or what its function's parameter is handed.
 */
function boundNames(model, node, depth) {
  for (let at = parentOf(model, node); at; at = parentOf(model, at)) {
    if (
      at.type === "ForOfStatement" &&
      at.left.type === "VariableDeclaration" &&
      at.left.declarations.some(
        (d) => d.id.type === "Identifier" && d.id.name === node.name
      )
    ) {
      const items = itemsOf(model, at.right, depth + 1);
      return items ? namesOfAll(model, items, depth) : null;
    }
    if (
      (at.type === "ArrowFunctionExpression" ||
        at.type === "FunctionExpression" ||
        at.type === "FunctionDeclaration") &&
      at.params.some((p) => p.type === "Identifier" && p.name === node.name)
    ) {
      return parameterNames(model, at, node.name, depth);
    }
  }
  return null;
}

/** The names a function's parameter `name` is handed, or null. */
function parameterNames(model, fn, name, depth) {
  const index = fn.params.findIndex(
    (p) => p.type === "Identifier" && p.name === name
  );
  const parent = parentOf(model, fn);
  // An array method's callback over an array of literals: its first
  // parameter is each element.
  if (
    index === 0 &&
    parent?.type === "CallExpression" &&
    parent.arguments[0] === fn &&
    parent.callee.type === "MemberExpression" &&
    !parent.callee.computed &&
    EACH.has(parent.callee.property.name)
  ) {
    const items = itemsOf(model, parent.callee.object, depth + 1);
    return items ? namesOfAll(model, items, depth) : null;
  }
  const named = nameOf(model, fn);
  if (named?.exported) {
    const reader = READERS.find(
      (r) =>
        r.name === named.name &&
        r.index === index &&
        model.file === path.join(DASHBOARD, r.file)
    );
    return reader ? [] : null;
  }
  const calls = callsOf(model, fn);
  if (!calls) {
    return null;
  }
  const unfollowed = UNFOLLOWED_ARGUMENTS.some(
    (u) =>
      u.name === named?.name &&
      u.index === index &&
      model.file === path.join(DASHBOARD, u.file)
  );
  const names = [];
  for (const call of calls) {
    const found = namesOf(model, call.arguments[index], depth + 1);
    if (found) {
      names.push(...found);
    } else if (!unfollowed) {
      return null;
    }
  }
  return names;
}

/**
 * Whether the property text `node` produces reaches a numeric parse: at
 * once, through a `const`, or as a helper's return, each call of which is
 * followed in turn. `sites` collects each helper call with the name
 * expression it reads, for the caller to check.
 */
function parsedFrom(model, node, nameNode, sites, depth = 0) {
  if (depth > 8) {
    return false;
  }
  const at = carried(model, node);
  const parent = parentOf(model, at);
  if (parses(parent, at)) {
    return true;
  }
  if (
    parent?.type === "VariableDeclarator" &&
    parent.init === at &&
    parent.id.type === "Identifier"
  ) {
    const binding = bindingAt(model, parent.id.name, parent.id.start);
    if (binding?.kind !== "const") {
      return false;
    }
    return referencesOf(model, parent.id.name, binding).some((ref) =>
      parsedFrom(model, ref, nameNode, sites, depth + 1)
    );
  }
  const returned =
    parent?.type === "ReturnStatement" ||
    (parent?.type === "ArrowFunctionExpression" && parent.body === at);
  if (!returned) {
    return false;
  }
  const fn = parent.type === "ReturnStatement" ? functionOf(model, at) : parent;
  const calls = fn ? callsOf(model, fn) : null;
  if (!calls) {
    return false;
  }
  const index =
    nameNode.type === "Identifier"
      ? fn.params.findIndex(
          (p) => p.type === "Identifier" && p.name === nameNode.name
        )
      : -1;
  for (const call of calls) {
    const name = index === -1 ? nameNode : call.arguments[index];
    if (parsedFrom(model, call, name, sites, depth + 1)) {
      sites.push({ node: call, name });
    }
  }
  return false;
}

/** The file a module specifier names, from the file importing it. */
function resolveImport(file, source) {
  const bare = source.replace(SCRIPT_EXTENSION, "");
  if (bare.startsWith("$lib/") || bare.startsWith("#lib/")) {
    return path.join(DASHBOARD, "src/lib", bare.slice(5));
  }
  if (bare.startsWith(".")) {
    return path.resolve(path.dirname(file), bare);
  }
  return null;
}

const message = (name) =>
  `${name} is read as a number but has no typed @property: an untyped custom property computes to its text, so a calc() or rem value parses to NaN or the wrong number. Register it in a sheet app.css loads (\`@property ${name} { syntax: "<length>"; … }\`, or "<number>").`;
const UNFOLLOWED =
  "A custom property read as a number whose name this rule cannot follow to its literals. Name it with a literal, or list the helper in scripts/lint/design/typed-property-read.mjs (READERS for an exported one, UNFOLLOWED_ARGUMENTS for a name no literal holds) with why.";

export function typedPropertyReads(model) {
  const typed = typedProperties();
  const findings = [];
  const check = (site, nameNode) => {
    const names = namesOf(model, nameNode);
    if (!names) {
      findings.push({ start: site.start, end: site.end, message: UNFOLLOWED });
      return;
    }
    for (const name of new Set(names)) {
      if (name.startsWith("--") && !typed.has(name)) {
        findings.push({
          start: site.start,
          end: site.end,
          message: message(name),
        });
      }
    }
  };
  const readers = READERS.filter(
    (r) => model.file !== path.join(DASHBOARD, r.file)
  );
  eachNode(model, (node) => {
    if (node.type !== "CallExpression") {
      return;
    }
    if (isCall(node, "getPropertyValue") && node.arguments[0]) {
      const sites = [];
      if (parsedFrom(model, node, node.arguments[0], sites)) {
        check(node, node.arguments[0]);
      }
      for (const site of sites) {
        check(site.node, site.name);
      }
      return;
    }
    // A call of an exported reader, imported from its file.
    if (node.callee.type !== "Identifier" || readers.length === 0) {
      return;
    }
    const binding = bindingAt(model, node.callee.name, node.start);
    if (binding?.kind !== "import") {
      return;
    }
    const from = resolveImport(model.file, binding.source);
    const reader = readers.find(
      (r) =>
        r.name === binding.imported &&
        from !== null &&
        path.join(DASHBOARD, r.file).replace(SCRIPT_EXTENSION, "") === from
    );
    if (reader && node.arguments[reader.index]) {
      check(node, node.arguments[reader.index]);
    }
  });
  return findings;
}
