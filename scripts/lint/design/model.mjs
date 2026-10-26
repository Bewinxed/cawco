// What the design rules read a file through (scripts/lint/design): its own
// text, parsed as it is written, and a way to report a place in that text.
//
// Golar hands a rule the TypeScript it checks, which for a `.svelte` file is
// svelte2tsx's output: markup is gone from it, and a class string stands in
// a generated call. So the rules read the file itself, with Svelte's own
// parser (`svelte/compiler` `parse`, the modern AST) and, for a `.ts` file,
// the parser Svelte reads `<script lang="ts">` with (acorn and
// @sveltejs/acorn-typescript). Positions are the file's UTF-16 offsets.
//
// A report goes to Golar as a range in that text (`sourceRange`, the Golar
// fork's report in the file as read from disk), so a place svelte2tsx writes
// no code for (a `class:x` name, a `style` attribute) is reported where it is.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../../..");
export const DASHBOARD = path.join(ROOT, "apps/dashboard");
export const SRC_LIB = path.join(DASHBOARD, "src/lib");

/** A module the dashboard depends on, resolved from it (svelte, tailwind). */
export const fromDashboard = createRequire(
  path.join(DASHBOARD, "package.json")
);
const fromSvelte = createRequire(fromDashboard.resolve("svelte/package.json"));
const load = (require, name) =>
  import(pathToFileURL(require.resolve(name)).href);

const svelteCompiler = await load(fromDashboard, "svelte/compiler");
const parseSvelte = svelteCompiler.parse ?? svelteCompiler.default.parse;
const acorn = await load(fromSvelte, "acorn");
const { tsPlugin } = await load(fromSvelte, "@sveltejs/acorn-typescript");
const TypeScript = acorn.Parser.extend(tsPlugin());

/** A script as ESTree, as Svelte parses a `<script lang="ts">`. */
export function parseScript(text) {
  return TypeScript.parse(text, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
  });
}

export { parseSvelte };

/** Reports `message` at `[start, end)` of the file's own text. */
export function reportAt(context, start, end, message) {
  context.report({
    message,
    sourceRange: { begin: start, end: Math.max(end, start + 1) },
  });
}

/* ------------------------------------------------------------------ models */

const models = new Map();

/** Every node under `node`, with its parent, depth first. */
function walk(node, visit, parent = null, key = null) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit, parent, key);
    }
    return;
  }
  if (!node || typeof node !== "object" || typeof node.type !== "string") {
    return;
  }
  visit(node, parent, key);
  for (const [k, value] of Object.entries(node)) {
    if (
      k !== "metadata" &&
      k !== "loc" &&
      k !== "name_loc" &&
      value &&
      typeof value === "object"
    ) {
      walk(value, visit, node, k);
    }
  }
}

const SCOPES = new Set([
  "Program",
  "BlockStatement",
  "StaticBlock",
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "SwitchStatement",
  "CatchClause",
  "ClassBody",
]);

/** The names a binding pattern declares. */
function patternNames(pattern, out = []) {
  if (!pattern) {
    return out;
  }
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern);
      break;
    case "ObjectPattern":
      for (const p of pattern.properties) {
        patternNames(p.type === "RestElement" ? p.argument : p.value, out);
      }
      break;
    case "ArrayPattern":
      for (const e of pattern.elements) {
        patternNames(e, out);
      }
      break;
    case "RestElement":
      patternNames(pattern.argument, out);
      break;
    case "AssignmentPattern":
      patternNames(pattern.left, out);
      break;
    default:
      break;
  }
  return out;
}

/**
 * The file's bindings: each name with the range it is seen in and what it
 * is (a `const` with its initialiser, an import, or anything else, which
 * stops a lookup). A script's top level is seen in the whole file, so its
 * names reach the markup.
 */
function bindingsOf(model) {
  const bindings = [];
  const add = (id, scope, kind, extra = {}) =>
    bindings.push({
      name: id.name,
      start: scope[0],
      end: scope[1],
      kind,
      ...extra,
    });
  const whole = [0, model.text.length];
  const scopeOf = (parents) => {
    for (let i = parents.length - 1; i >= 0; i -= 1) {
      const p = parents[i];
      if (SCOPES.has(p.type)) {
        return p.type === "Program" ? whole : [p.start, p.end];
      }
      if (
        p.type === "EachBlock" ||
        p.type === "SnippetBlock" ||
        p.type === "AwaitBlock" ||
        p.type === "IfBlock" ||
        p.type === "KeyBlock" ||
        p.type === "RegularElement" ||
        p.type === "Component"
      ) {
        return [p.start, p.end];
      }
    }
    return whole;
  };
  const stack = [];
  /** Every name in `patterns`, seen in the node's own range, as other. */
  const own = (node, patterns) => {
    for (const id of patterns.flatMap((p) => patternNames(p))) {
      add(id, [node.start, node.end], "other");
    }
  };
  const declare = (declarator, scope, isConst) => {
    const plain = declarator.id.type === "Identifier";
    for (const id of patternNames(declarator.id)) {
      add(id, scope, isConst && plain ? "const" : "other", {
        init: plain ? declarator.init : null,
        declarator,
      });
    }
  };
  const IMPORTED = {
    ImportDefaultSpecifier: () => "default",
    ImportNamespaceSpecifier: () => "*",
    ImportSpecifier: (s) => s.imported.name ?? s.imported.value,
  };
  const functionParams = (node) => own(node, node.params);
  const handlers = {
    ImportDeclaration(node) {
      for (const s of node.specifiers) {
        add(s.local, whole, "import", {
          source: node.source.value,
          imported: IMPORTED[s.type](s),
        });
      }
    },
    VariableDeclaration(node) {
      const scope = node.kind === "var" ? whole : scopeOf(stack.slice(0, -1));
      for (const d of node.declarations) {
        declare(d, scope, node.kind === "const");
      }
    },
    FunctionDeclaration(node) {
      if (node.id) {
        add(node.id, scopeOf(stack.slice(0, -1)), "other");
      }
      functionParams(node);
    },
    ClassDeclaration(node) {
      if (node.id) {
        add(node.id, scopeOf(stack.slice(0, -1)), "other");
      }
    },
    FunctionExpression: functionParams,
    ArrowFunctionExpression: functionParams,
    CatchClause(node) {
      own(node, [node.param]);
    },
    EachBlock(node) {
      own(node, [node.context]);
      if (node.index) {
        add({ name: node.index }, [node.start, node.end], "other");
      }
    },
    SnippetBlock(node) {
      add(node.expression, whole, "other");
      own(node, node.parameters ?? []);
    },
    AwaitBlock(node) {
      own(node, [node.value, node.error]);
    },
    ConstTag(node) {
      const parent = stack.at(-2);
      const [d] = node.declaration.declarations;
      declare(d, parent ? [parent.start, parent.end] : whole, true);
    },
  };
  const visit = (node) => handlers[node.type]?.(node);
  const roots =
    model.kind === "svelte"
      ? [model.ast.module, model.ast.instance, model.ast.fragment]
      : [model.ast];
  const descend = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) {
        descend(child);
      }
      return;
    }
    if (!node || typeof node !== "object" || typeof node.type !== "string") {
      return;
    }
    stack.push(node);
    visit(node);
    for (const [k, value] of Object.entries(node)) {
      if (k !== "metadata" && value && typeof value === "object") {
        descend(value);
      }
    }
    stack.pop();
  };
  for (const root of roots) {
    descend(root?.content ?? root);
  }
  return bindings;
}

/**
 * The binding `name` has at `at`: the innermost one whose range holds it.
 */
export function bindingAt(model, name, at) {
  let found = null;
  for (const b of model.bindings) {
    if (
      b.name === name &&
      b.start <= at &&
      at <= b.end &&
      (!found || b.end - b.start <= found.end - found.start)
    ) {
      found = b;
    }
  }
  return found;
}

/** The file `fileName` as the rules read it, parsed once. */
export function modelOf(fileName) {
  const known = models.get(fileName);
  if (known) {
    return known;
  }
  const text = fs.readFileSync(fileName, "utf8");
  const kind = fileName.endsWith(".svelte") ? "svelte" : "ts";
  let ast;
  try {
    ast =
      kind === "svelte"
        ? parseSvelte(text, { modern: true })
        : parseScript(text);
  } catch {
    // A file that does not parse is Golar's type check's to report (svelte2tsx
    // fails on it there); the rules read nothing of it.
    ast =
      kind === "svelte"
        ? {
            module: null,
            instance: null,
            fragment: { type: "Fragment", nodes: [] },
            css: null,
          }
        : { type: "Program", body: [], start: 0, end: 0 };
  }
  const parents = new WeakMap();
  const roots =
    kind === "svelte" ? [ast.module, ast.instance, ast.fragment] : [ast];
  for (const root of roots) {
    walk(root, (node, parent) => parents.set(node, parent));
  }
  const model = { file: fileName, text, kind, ast, parents, bindings: [] };
  model.bindings = bindingsOf(model);
  models.set(fileName, model);
  return model;
}

/** Every node of the file, with its parent. */
export function eachNode(model, visit) {
  const roots =
    model.kind === "svelte"
      ? [model.ast.module, model.ast.instance, model.ast.fragment]
      : [model.ast];
  for (const root of roots) {
    walk(root, visit);
  }
}

/** The parent of a node the file holds. */
export const parentOf = (model, node) => model.parents.get(node) ?? null;

/** The file's path from the repository's root. */
export const relative = (file) => path.relative(ROOT, file);

/** The 1-based line `at` stands on. */
export const lineOf = (text, at) => text.slice(0, at).split("\n").length;

const IGNORE =
  /golar-ignore-next-line\s+([\w/-]+(?:\s*,\s*[\w/-]+)*)\s+--\s+\S/u;

/**
 * Whether the line before `at` holds `golar-ignore-next-line <rule> -- why`
 * for `rule`, in any comment the file can hold there.
 */
export function ignored(model, rule, at) {
  const lineStart = model.text.lastIndexOf("\n", at - 1);
  const prevStart = model.text.lastIndexOf("\n", lineStart - 1);
  const previous = model.text.slice(prevStart + 1, lineStart);
  const said = previous.match(IGNORE);
  return Boolean(
    said?.[1]
      .split(",")
      .map((r) => r.trim())
      .includes(rule)
  );
}

export const readText = (file) => fs.readFileSync(file, "utf8");
export const isFile = (file) =>
  fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
