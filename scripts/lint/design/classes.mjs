// Where a file writes classes, and which classes it writes there: the class
// sites every design rule reads (apps/dashboard's former
// eslint-plugin-house.mjs reader, and @shadcn/lint's class sites, on Svelte's
// own AST).
//
// A site is one place that hands an element its classes: a `class` (or any
// `*class*`) attribute, a `class:x` directive, or a class helper call in a
// script (`cn`, `clsx`, …, and the `tv`/`cva` recipes) that no markup class
// site holds. Each class read there is an entry with its place in the file
// and the branches it is on: two entries whose `tags` give one axis
// different values never stand together (the two sides of a ternary, two
// values of one recipe variant, two recipe slots). What a site holds that
// cannot be read as classes (a value from a call, a `let`, a prop, an import)
// is `unresolved`.
//
// A site on a component names it when the component is the design system's:
// imported from `#lib/components/` (@shadcn/lint's `componentImports`
// setting this dashboard gave it), or a component of the dashboard's own that
// hands its `class` prop to one of those (a wrapper).
import path from "node:path";
import {
  bindingAt,
  eachNode,
  isFile,
  modelOf,
  parentOf,
  parseScript,
  readText,
  SRC_LIB,
} from "./model.mjs";

const MERGERS = new Set([
  "cn",
  "cx",
  "clsx",
  "twMerge",
  "twJoin",
  "classNames",
]);
const RECIPES = new Set(["tv", "cva"]);
const WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
  "ChainExpression",
]);
const WORD = /\S+/gu;
const LEADING_SPACE = /^\s/u;
const TRAILING_SPACE = /\s$/u;
const LEADING_WORD = /^\S+/u;
const TRAILING_WORD = /\S+$/u;
const CLASS_ATTRIBUTE = /class/iu;
const KIT_IMPORT = /^#lib\/components\//u;

export function calleeName(call) {
  return call.callee?.type === "Identifier" ? call.callee.name : null;
}

export function unwrap(node) {
  let n = node;
  while (n && WRAPPERS.has(n.type)) {
    n = n.expression;
  }
  return n;
}

export function keyOf(property) {
  if (property.computed) {
    return property.key?.type === "Literal" ? String(property.key.value) : null;
  }
  return property.key?.type === "Identifier"
    ? property.key.name
    : String(property.key?.value ?? "");
}

function memberKey(node) {
  if (!node.computed) {
    return node.property.name;
  }
  return node.property.type === "Literal" ? String(node.property.value) : null;
}

const blank = (word) => " ".repeat(word.length);

/* -------------------------------------------------- other modules' values */

const LIB_ALIAS = /^[#$]lib\//u;
const SCRIPT_MODULE = /\.(?:ts|js)$/u;
const JS_EXTENSION = /\.js$/u;
const SVELTE_FILE = /\.svelte$/u;

/** The `.ts`/`.js` module a specifier names, in this repo, or null. */
export function moduleFile(specifier, from) {
  let base = null;
  if (LIB_ALIAS.test(specifier)) {
    base = path.join(SRC_LIB, specifier.slice(5));
  } else if (specifier === "#lib" || specifier === "$lib") {
    base = path.join(SRC_LIB, "index");
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(from), specifier);
  }
  if (!base) {
    return null;
  }
  const stem = base.replace(JS_EXTENSION, "");
  const found = [`${stem}.ts`, `${stem}.js`, `${base}/index.ts`].find(isFile);
  return found && SCRIPT_MODULE.test(found) ? found : null;
}

/** The `.svelte` file a specifier names, in this repo, or null. */
export function svelteFile(specifier, from) {
  if (!SVELTE_FILE.test(specifier)) {
    return null;
  }
  const file = LIB_ALIAS.test(specifier)
    ? path.join(SRC_LIB, specifier.slice(5))
    : path.resolve(path.dirname(from), specifier);
  return isFile(file) ? file : null;
}

const moduleExports = new Map();
/** A module's `export const name = …` initialisers, by name. */
function exportedConsts(file) {
  if (!moduleExports.has(file)) {
    const consts = new Map();
    for (const statement of parseScript(readText(file)).body) {
      const declaration =
        statement.type === "ExportNamedDeclaration"
          ? statement.declaration
          : null;
      if (
        declaration?.type === "VariableDeclaration" &&
        declaration.kind === "const"
      ) {
        for (const d of declaration.declarations) {
          if (d.id.type === "Identifier" && d.init) {
            consts.set(d.id.name, d.init);
          }
        }
      }
    }
    moduleExports.set(file, consts);
  }
  return moduleExports.get(file);
}

/* ------------------------------------------------------------- the reader */

/**
 * Reads the class strings an expression can produce in `model`. `follow`
 * also reads another module's `export const` a named import is bound to;
 * without it such a value is unresolved. Returns the entries, and the nodes
 * that could not be read as classes.
 */
export function readerFor(model, { follow = true } = {}) {
  const axes = new WeakMap();
  let next = 0;
  const axis = (node) => {
    if (!axes.has(node)) {
      next += 1;
      axes.set(node, `b${next}`);
    }
    return axes.get(node);
  };

  const words = (text, start, tags, out) => {
    for (const m of text.matchAll(WORD)) {
      const from = start + m.index;
      out.entries.push({
        name: m[0],
        start: from,
        end: from + m[0].length,
        tags,
      });
    }
  };

  /** What a name is bound to here: a `const`'s value or another module's `export const`. */
  const resolve = (identifier, seen, local) => {
    const binding = bindingAt(local, identifier.name, identifier.start);
    if (!binding || seen.has(binding)) {
      return null;
    }
    if (binding.kind === "const" && binding.init) {
      return { init: binding.init, binding, model: local, foreign: false };
    }
    if (binding.kind === "import" && follow && local === model) {
      const file = moduleFile(binding.source, local.file);
      const init = file ? exportedConsts(file).get(binding.imported) : null;
      return init ? { init, binding, model: null, foreign: true } : null;
    }
    return null;
  };

  /** Whether an identifier is a class prop the component received (forwarded). */
  const forwarded = (identifier, local) => {
    const binding = bindingAt(local, identifier.name, identifier.start);
    const d = binding?.declarator;
    const init = unwrap(d?.init);
    if (
      d?.id.type !== "ObjectPattern" ||
      init?.type !== "CallExpression" ||
      calleeName(init) !== "$props"
    ) {
      return false;
    }
    return d.id.properties.some((p) => {
      if (p.type === "RestElement") {
        return false;
      }
      const value =
        p.value?.type === "AssignmentPattern" ? p.value.left : p.value;
      return value?.name === identifier.name && CLASS_ATTRIBUTE.test(keyOf(p));
    });
  };

  const visitors = {
    Literal(node, tags, out) {
      if (typeof node.value === "string") {
        words(node.value, node.start + 1, tags, out);
      } else if (node.value !== null && typeof node.value !== "boolean") {
        out.unresolved.push(node);
      }
    },
    TemplateLiteral(node, tags, out, seen, local) {
      node.quasis.forEach((quasi, i) => {
        let text = quasi.value.cooked ?? "";
        // A word glued to an expression is not a whole class.
        if (i > 0 && !LEADING_SPACE.test(text) && LEADING_WORD.test(text)) {
          text = text.replace(LEADING_WORD, blank);
          out.unresolved.push(node.expressions[i - 1]);
        }
        if (
          i < node.expressions.length &&
          !TRAILING_SPACE.test(text) &&
          TRAILING_WORD.test(text)
        ) {
          text = text.replace(TRAILING_WORD, blank);
          out.unresolved.push(node.expressions[i]);
        }
        words(text, quasi.start, tags, out);
      });
      for (const expression of node.expressions) {
        visit(expression, tags, out, seen, local);
      }
    },
    ConditionalExpression(node, tags, out, seen, local) {
      visit(
        node.consequent,
        { ...tags, [axis(node)]: "then" },
        out,
        seen,
        local
      );
      visit(
        node.alternate,
        { ...tags, [axis(node)]: "else" },
        out,
        seen,
        local
      );
    },
    LogicalExpression(node, tags, out, seen, local) {
      if (node.operator === "&&") {
        visit(node.right, tags, out, seen, local);
        return;
      }
      visit(node.left, { ...tags, [axis(node)]: "left" }, out, seen, local);
      visit(node.right, { ...tags, [axis(node)]: "right" }, out, seen, local);
    },
    ArrayExpression(node, tags, out, seen, local) {
      for (const element of node.elements) {
        if (element?.type === "SpreadElement") {
          visit(element.argument, tags, out, seen, local);
        } else {
          visit(element, tags, out, seen, local);
        }
      }
    },
    ObjectExpression(node, tags, out) {
      for (const property of node.properties) {
        const key = property.type === "Property" ? keyOf(property) : null;
        if (key) {
          const quoted = property.key.type === "Literal" ? 1 : 0;
          words(key, property.key.start + quoted, tags, out);
        } else {
          out.unresolved.push(property);
        }
      }
    },
    CallExpression(node, tags, out, seen, local) {
      const name = calleeName(node);
      if (MERGERS.has(name)) {
        for (const argument of node.arguments) {
          visit(argument, tags, out, seen, local);
        }
      } else if (RECIPES.has(name)) {
        visitRecipe(node, name, tags, out, seen, local);
      } else if (name === "$derived") {
        visit(node.arguments[0], tags, out, seen, local);
      } else {
        out.unresolved.push(node);
      }
    },
    Identifier(node, tags, out, seen, local) {
      if (node.name === "undefined") {
        return;
      }
      // A node read from another module has no bindings here.
      if (!local) {
        out.unresolved.push(node);
        return;
      }
      const found = resolve(node, seen, local);
      if (!found) {
        if (!forwarded(node, local)) {
          out.unresolved.push(node);
        }
        return;
      }
      const followed = new Set([...seen, found.binding]);
      if (!found.foreign) {
        visit(found.init, tags, out, followed, found.model);
        return;
      }
      // Another module's classes stand where this file names them.
      const imported = { entries: [], unresolved: [] };
      visit(found.init, tags, imported, followed, null);
      for (const entry of imported.entries) {
        out.entries.push({ ...entry, start: node.start, end: node.end });
      }
      if (imported.unresolved.length > 0) {
        out.unresolved.push(node);
      }
    },
    MemberExpression(node, tags, out, seen, local) {
      const object = unwrap(node.object);
      const key = memberKey(node);
      const found =
        object?.type === "Identifier" && local
          ? resolve(object, seen, local)
          : null;
      const init = unwrap(found?.init);
      const property =
        key && init?.type === "ObjectExpression"
          ? init.properties.findLast(
              (p) => p.type === "Property" && keyOf(p) === key
            )
          : null;
      if (!property) {
        out.unresolved.push(node);
        return;
      }
      const inner = found.foreign ? { entries: [], unresolved: [] } : out;
      visit(
        property.value,
        tags,
        inner,
        new Set([...seen, found.binding]),
        found.model
      );
      if (found.foreign) {
        for (const entry of inner.entries) {
          out.entries.push({ ...entry, start: node.start, end: node.end });
        }
        if (inner.unresolved.length > 0) {
          out.unresolved.push(node);
        }
      }
    },
  };

  const visit = (raw, tags, out, seen, local) => {
    const node = unwrap(raw);
    if (!node) {
      return;
    }
    const visitor = visitors[node.type];
    if (visitor) {
      visitor(node, tags, out, seen, local);
    } else if (local) {
      out.unresolved.push(node);
    }
  };

  const slotted = (value, tags, out, seen, slots, local) => {
    const v = unwrap(value);
    if (!(slots && v?.type === "ObjectExpression")) {
      visit(value, { ...tags, slot: "base" }, out, seen, local);
      return;
    }
    for (const property of v.properties) {
      if (property.type === "Property") {
        visit(
          property.value,
          { ...tags, slot: keyOf(property) },
          out,
          seen,
          local
        );
      }
    }
  };

  const visitVariants = (variants, tags, out, seen, slots, local) => {
    for (const group of variants?.properties ?? []) {
      const values = group.type === "Property" ? unwrap(group.value) : null;
      for (const value of values?.properties ?? []) {
        if (value.type === "Property") {
          const when = { ...tags, [`v:${keyOf(group)}`]: keyOf(value) };
          slotted(value.value, when, out, seen, slots, local);
        }
      }
    }
  };

  const compoundOf = (entry, tags) => {
    const when = { ...tags };
    let classValue = null;
    for (const property of entry.properties) {
      const key = property.type === "Property" ? keyOf(property) : null;
      const value = key ? unwrap(property.value) : null;
      if (key === "class" || key === "className") {
        classValue = property.value;
      } else if (value?.type === "Literal") {
        when[`v:${key}`] = String(value.value);
      }
    }
    return { when, classValue };
  };

  const visitCompounds = (compoundVariants, tags, out, seen, slots, local) => {
    for (const entry of compoundVariants?.elements ?? []) {
      if (entry?.type === "ObjectExpression") {
        const { when, classValue } = compoundOf(entry, tags);
        slotted(classValue, when, out, seen, slots, local);
      }
    }
  };

  const visitRecipe = (node, name, tags, out, seen, local) => {
    const config = unwrap(node.arguments[name === "tv" ? 0 : 1]);
    if (name === "cva") {
      visit(node.arguments[0], { ...tags, slot: "base" }, out, seen, local);
    }
    if (config?.type !== "ObjectExpression") {
      return;
    }
    const props = new Map(
      config.properties
        .filter((p) => p.type === "Property")
        .map((p) => [keyOf(p), unwrap(p.value)])
    );
    const slots = props.get("slots")?.type === "ObjectExpression";
    visit(props.get("base"), { ...tags, slot: "base" }, out, seen, local);
    if (slots) {
      slotted(props.get("slots"), tags, out, seen, true, local);
    }
    visitVariants(props.get("variants"), tags, out, seen, slots, local);
    visitCompounds(
      props.get("compoundVariants"),
      tags,
      out,
      seen,
      slots,
      local
    );
  };

  return (node) => {
    const out = { entries: [], unresolved: [] };
    visit(node, {}, out, new Set(), model);
    return out;
  };
}

/** Whether two entries stand on branches that never hold together. */
export function separated(a, b) {
  return Object.keys(a.tags).some(
    (k) => k in b.tags && a.tags[k] !== b.tags[k]
  );
}

/* -------------------------------------------------------------- markup */

const TAGS = new Set([
  "RegularElement",
  "SvelteElement",
  "Component",
  "SvelteComponent",
  "SvelteSelf",
  "SlotElement",
  "TitleElement",
  "SvelteFragment",
  "SvelteBoundary",
]);
export const isTag = (node) => TAGS.has(node?.type);

/** A markup attribute value as the reader reads it: its text and expressions. */
function readAttributeValue(value, read) {
  const out = { entries: [], unresolved: [] };
  if (value === true || !value) {
    return out;
  }
  const parts = Array.isArray(value) ? value : [value];
  parts.forEach((part, i) => {
    if (part.type === "Text") {
      let text = part.raw;
      const before = parts[i - 1];
      const after = parts[i + 1];
      if (before?.type === "ExpressionTag" && LEADING_WORD.test(text)) {
        text = text.replace(LEADING_WORD, blank);
        out.unresolved.push(before.expression);
      }
      if (after?.type === "ExpressionTag" && TRAILING_WORD.test(text)) {
        text = text.replace(TRAILING_WORD, blank);
        out.unresolved.push(after.expression);
      }
      for (const m of text.matchAll(WORD)) {
        const from = part.start + m.index;
        out.entries.push({
          name: m[0],
          start: from,
          end: from + m[0].length,
          tags: {},
        });
      }
    } else if (part.type === "ExpressionTag") {
      const read1 = read(part.expression);
      out.entries.push(...read1.entries);
      out.unresolved.push(...read1.unresolved);
    }
  });
  return out;
}

/** The tag name, `Table.Cell` for a member. */
export const tagName = (tag) => tag?.name ?? "";

/** A file's imports, by local name. */
const IMPORT_KINDS = { default: "default", "*": "namespace" };

function importsOf(model) {
  if (!model.imports) {
    model.imports = new Map();
    for (const b of model.bindings) {
      if (b.kind === "import") {
        model.imports.set(b.name, {
          source: b.source,
          kind: IMPORT_KINDS[b.imported] ?? "named",
          imported: b.imported,
        });
      }
    }
  }
  return model.imports;
}

const barrels = new Map();
/** The components one `export { … } from "…"` names, into `found`. */
function reExports(statement, file, found) {
  const source = statement.source.value;
  const component = svelteFile(source, file);
  const module = component ? null : moduleFile(source, file);
  for (const specifier of statement.specifiers) {
    const local = specifier.local.name ?? specifier.local.value;
    const exported = specifier.exported.name ?? specifier.exported.value;
    const target =
      component && local === "default"
        ? component
        : module && barrelComponents(module).get(local);
    if (target) {
      found.set(exported, target);
    }
  }
}

/** A barrel's components by exported name (`export { default as X } from "./x.svelte"`). */
function barrelComponents(file) {
  if (!barrels.has(file)) {
    const found = new Map();
    barrels.set(file, found);
    for (const statement of parseScript(readText(file)).body) {
      if (statement.type === "ExportNamedDeclaration" && statement.source) {
        reExports(statement, file, found);
      }
    }
  }
  return barrels.get(file);
}

/** The component file a tag name (`Button`, `Table.Cell`) stands for. */
export function componentFile(name, imports, from) {
  const [first, member] = name.split(".");
  const binding = imports.get(first);
  if (!binding) {
    return null;
  }
  if (binding.kind === "default" && !member) {
    return svelteFile(binding.source, from);
  }
  const barrel = moduleFile(binding.source, from);
  if (!barrel) {
    return null;
  }
  const exported = binding.kind === "namespace" ? member : binding.imported;
  return (binding.kind === "namespace") === Boolean(member)
    ? (barrelComponents(barrel).get(exported) ?? null)
    : null;
}

const PROPS_BINDING = /let\s*\{([\s\S]*?)\}\s*(?::[^=]*)?=\s*\$props\(\)/u;
const CLASS_PROP = /\bclass\s*:\s*(\w+)/u;

const wrappers = new Map();
/**
 * Whether a component file hands its `class` prop to a design-system
 * component, itself or through another of the dashboard's: what makes a
 * tag of it a design-system component's for @shadcn/lint ("Only recognized
 * components and their forwarding wrappers are checked").
 */
function wrapsKit(file, depth = 0) {
  if (wrappers.has(file)) {
    return wrappers.get(file);
  }
  wrappers.set(file, false);
  const text = readText(file);
  const binding = text.match(PROPS_BINDING)?.[1].match(CLASS_PROP)?.[1];
  let wraps = false;
  if (binding && depth < 4) {
    const model = modelOf(file);
    const imports = importsOf(model);
    const uses = new RegExp(`\\b${binding.replace("$", "\\$")}\\b`, "u");
    eachNode(model, (node) => {
      if (wraps || node.type !== "Component") {
        return;
      }
      const attribute = node.attributes.find(
        (a) => a.type === "Attribute" && a.name === "class"
      );
      if (!(
        attribute && uses.test(text.slice(attribute.start, attribute.end))
      )) {
        return;
      }
      const [first] = tagName(node).split(".");
      const source = imports.get(first)?.source ?? "";
      const inner = componentFile(tagName(node), imports, file);
      wraps =
        KIT_IMPORT.test(source) || Boolean(inner && wrapsKit(inner, depth + 1));
    });
  }
  wrappers.set(file, wraps);
  return wraps;
}

/** The design-system component a tag is, or null: `{ name, file }`. */
function kitComponent(model, tag) {
  if (tag?.type !== "Component") {
    return null;
  }
  const imports = importsOf(model);
  const [first] = tagName(tag).split(".");
  const source = imports.get(first)?.source;
  if (!source) {
    return null;
  }
  const file = componentFile(tagName(tag), imports, model.file);
  if (KIT_IMPORT.test(source)) {
    return { name: tagName(tag), file, wrapper: false };
  }
  return file && wrapsKit(file)
    ? { name: tagName(tag), file, wrapper: true }
    : null;
}

/** The class lists of a tag: `class` with every `class:x` (one element), and each other `*class*` on its own. */
export function tagSites(tag, read) {
  const own = {
    tag,
    attribute: "class",
    entries: [],
    unresolved: [],
    nodes: [],
  };
  const sites = [own];
  for (const attribute of tag.attributes ?? []) {
    if (attribute.type === "ClassDirective") {
      const start = attribute.start + "class:".length;
      own.entries.push({
        name: attribute.name,
        start,
        end: start + attribute.name.length,
        tags: {},
        directive: true,
      });
    } else if (
      attribute.type === "Attribute" &&
      CLASS_ATTRIBUTE.test(attribute.name)
    ) {
      const value = readAttributeValue(attribute.value, read);
      if (attribute.name === "class") {
        own.entries.push(...value.entries);
        own.unresolved.push(...value.unresolved);
        own.nodes.push(attribute);
      } else {
        sites.push({
          tag,
          attribute: attribute.name,
          ...value,
          nodes: [attribute],
        });
      }
    }
  }
  return sites;
}

const isClassCall = (node) =>
  node?.type === "CallExpression" &&
  (MERGERS.has(calleeName(node)) || RECIPES.has(calleeName(node)));

/** Whether a node stands inside a class helper call or a class attribute. */
function insideClassSite(model, node) {
  for (let n = parentOf(model, node); n; n = parentOf(model, n)) {
    if (isClassCall(n)) {
      return true;
    }
    if (n.type === "Attribute" && CLASS_ATTRIBUTE.test(n.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Every class site of the file: each tag's class lists, and each class
 * helper call no other site holds. A site on a design-system component
 * carries `component`.
 */
export function sitesOf(model, options = {}) {
  const key = options.follow === false ? "sitesStrict" : "sites";
  if (model[key]) {
    return model[key];
  }
  const read = readerFor(model, options);
  const sites = [];
  eachNode(model, (node) => {
    if (isTag(node)) {
      const component = kitComponent(model, node);
      for (const site of tagSites(node, read)) {
        sites.push({ ...site, component });
      }
    } else if (isClassCall(node) && !insideClassSite(model, node)) {
      sites.push({
        tag: null,
        attribute: null,
        component: null,
        nodes: [node],
        ...read(node),
      });
    }
  });
  model[key] = sites;
  return sites;
}
