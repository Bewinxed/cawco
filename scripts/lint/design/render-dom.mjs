// house/no-render-dom-read: a server render has no document. A page's
// markup, its component scripts' top level, a `$derived`, a class field and
// a module's top level all run on the server as a page is rendered for a
// document request (a reload, a shared link), and a function that reads the
// page (the root's computed style, an element, `window`) throws there:
// `ReferenceError: document is not defined`, and the page is a 500. The
// project page's view swap read --dur-exit in its markup
// (`ListSwap.leaveEnd()`, 1e4064081) and every reload of a project 500'd.
//
// A function that reads the page says so with `@browser` in its JSDoc
// (motion/curves.svelte.ts `dur`, list-swap.svelte.ts `ListSwap.enterAt`).
// The rule reports a call of one, imported or the file's own, made where a
// server render runs it. A call inside a function is left: it runs when
// called (an event handler, an effect, a transition, an attachment, a
// timer), except a `$derived.by` body, which runs at render. A directive a
// server render never runs (`on:`, `in:`/`out:`/`transition:`, `animate:`,
// `use:`, `{@attach}`) is left too, as is a call behind SvelteKit's
// `browser` (`browser ? …`, `browser && …`, `if (browser)`, `{#if browser}`)
// and any call in a route that renders on no server (`export const ssr =
// false` in its own or an enclosing folder's `+page.ts` or `+layout.ts`).
import path from "node:path";
import { moduleFile } from "./classes.mjs";
import {
  bindingAt,
  DASHBOARD,
  eachNode,
  isFile,
  modelOf,
  parentOf,
  readText,
} from "./model.mjs";

const BROWSER_TAG = /@browser\b/u;
const FUNCTIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);
/** Markup a server render never runs. */
const BROWSER_ONLY = new Set([
  "OnDirective",
  "TransitionDirective",
  "AnimateDirective",
  "UseDirective",
  "AttachTag",
]);

/** Whether the JSDoc right before `start` in `text` carries `@browser`. */
function tagged(text, start) {
  const before = text.slice(0, start).trimEnd();
  if (!before.endsWith("*/")) {
    return false;
  }
  const open = before.lastIndexOf("/**");
  return open >= 0 && BROWSER_TAG.test(before.slice(open));
}

const browserNames = new Map();
/**
 * The names a module's `@browser` functions are called by: an exported or
 * top-level function or const by its name, a class's static method as
 * `Class.method`.
 */
function browserNamesOf(model) {
  const known = browserNames.get(model.file);
  if (known) {
    return known;
  }
  const names = new Set();
  const body =
    model.kind === "svelte"
      ? [
          ...(model.ast.module?.content.body ?? []),
          ...(model.ast.instance?.content.body ?? []),
        ]
      : model.ast.body;
  for (const statement of body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" && statement.declaration
        ? statement.declaration
        : statement;
    const doc = tagged(model.text, statement.start);
    if (declaration.type === "FunctionDeclaration" && doc && declaration.id) {
      names.add(declaration.id.name);
    } else if (declaration.type === "VariableDeclaration" && doc) {
      for (const d of declaration.declarations) {
        if (d.id.type === "Identifier") {
          names.add(d.id.name);
        }
      }
    } else if (declaration.type === "ClassDeclaration" && declaration.id) {
      for (const member of declaration.body.body) {
        if (
          member.type === "MethodDefinition" &&
          member.static &&
          member.key.type === "Identifier" &&
          tagged(model.text, member.start)
        ) {
          names.add(`${declaration.id.name}.${member.key.name}`);
        }
      }
    }
  }
  browserNames.set(model.file, names);
  return names;
}

/** The `@browser` name a call calls, as its module names it, or null. */
function calledName(model, callee) {
  const [head, member] =
    callee.type === "Identifier"
      ? [callee, null]
      : callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.property.type === "Identifier"
        ? [callee.object, callee.property.name]
        : [null, null];
  if (!head) {
    return null;
  }
  const binding = bindingAt(model, head.name, head.start);
  let names;
  let name;
  if (binding?.kind === "import") {
    const file = moduleFile(binding.source, model.file);
    if (!file || binding.imported === "*" || binding.imported === "default") {
      return null;
    }
    names = browserNamesOf(modelOf(file));
    name = binding.imported;
  } else if (binding?.start === 0 && binding.end === model.text.length) {
    // The file's own top level.
    names = browserNamesOf(model);
    name = head.name;
  } else {
    return null;
  }
  const full = member ? `${name}.${member}` : name;
  return names.has(full) ? full : null;
}

const ROUTES = path.join(DASHBOARD, "src/routes");
const NO_SSR = /^export const ssr = false;/mu;
const clientRoutes = new Map();
/** Whether `file` is a route's own and its route renders on no server. */
function inClientRoute(file) {
  let dir = path.dirname(file);
  while (dir.startsWith(ROUTES)) {
    if (!clientRoutes.has(dir)) {
      clientRoutes.set(
        dir,
        ["+page.ts", "+layout.ts"].some((name) => {
          const at = path.join(dir, name);
          return isFile(at) && NO_SSR.test(readText(at));
        })
      );
    }
    if (clientRoutes.get(dir)) {
      return true;
    }
    dir = path.dirname(dir);
  }
  return false;
}

const APP_ENV = /^\$app\/env(?:ironment)?$/u;
/** Whether `test` is SvelteKit's `browser`, as the file imports it. */
const isBrowser = (model, test) =>
  test?.type === "Identifier" &&
  test.name === "browser" &&
  APP_ENV.test(bindingAt(model, test.name, test.start)?.source ?? "");

/** Whether `parent` runs `child` only where `browser` holds. */
function behindBrowser(model, parent, child) {
  switch (parent.type) {
    case "ConditionalExpression":
    case "IfStatement":
    case "IfBlock":
      return isBrowser(model, parent.test) && parent.consequent === child;
    case "LogicalExpression":
      return (
        parent.operator === "&&" &&
        isBrowser(model, parent.left) &&
        parent.right === child
      );
    default:
      return false;
  }
}

/** Whether `$derived.by` is what `call` calls. */
const isDerivedBy = (call) =>
  call?.type === "CallExpression" &&
  call.callee.type === "MemberExpression" &&
  call.callee.object.type === "Identifier" &&
  call.callee.object.name === "$derived" &&
  call.callee.property.name === "by";

/** Whether a server render runs `node`, from what holds it. */
function runsAtRender(model, node) {
  let child = node;
  let parent = parentOf(model, node);
  while (parent) {
    if (BROWSER_ONLY.has(parent.type) || behindBrowser(model, parent, child)) {
      return false;
    }
    if (FUNCTIONS.has(child.type) && !isDerivedBy(parent)) {
      return false;
    }
    child = parent;
    parent = parentOf(model, parent);
  }
  return !FUNCTIONS.has(child.type);
}

export function renderDomReads(model) {
  const findings = [];
  if (inClientRoute(model.file)) {
    return findings;
  }
  eachNode(model, (node) => {
    if (node.type !== "CallExpression") {
      return;
    }
    const name = calledName(model, node.callee);
    if (name && runsAtRender(model, node)) {
      findings.push({
        start: node.start,
        end: node.end,
        message: `${name} reads the page (@browser), and a server render runs this call, where there is no document: the page answers 500. Call it where only a browser runs it: in an event handler, an effect, a transition or an attachment.`,
      });
    }
  });
  return findings;
}
