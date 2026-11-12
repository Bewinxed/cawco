// house/no-render-dom-read: a server render has no document. A page's
// markup, its component scripts' top level, a `$derived`, a class field and
// a module's top level all run on the server as a page is rendered for a
// document request (a reload, a shared link), and a function that reads the
// page (the root's computed style, an element, `window`) throws there:
// `ReferenceError: document is not defined`, and the page is a 500. The
// project page's view swap read --duration-exit in its markup
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

/** The names one top-level statement gives `@browser` functions, by `text`. */
function taggedNames(text, statement) {
  const declaration =
    statement.type === "ExportNamedDeclaration" && statement.declaration
      ? statement.declaration
      : statement;
  const doc = tagged(text, statement.start);
  switch (declaration.type) {
    case "FunctionDeclaration":
      return doc && declaration.id ? [declaration.id.name] : [];
    case "VariableDeclaration":
      return doc
        ? declaration.declarations
            .filter((d) => d.id.type === "Identifier")
            .map((d) => d.id.name)
        : [];
    case "ClassDeclaration":
      return declaration.id
        ? declaration.body.body
            .filter(
              (member) =>
                member.type === "MethodDefinition" &&
                member.static &&
                member.key.type === "Identifier" &&
                tagged(text, member.start)
            )
            .map((member) => `${declaration.id.name}.${member.key.name}`)
        : [];
    default:
      return [];
  }
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
  const body =
    model.kind === "svelte"
      ? [
          ...(model.ast.module?.content.body ?? []),
          ...(model.ast.instance?.content.body ?? []),
        ]
      : model.ast.body;
  const names = new Set(
    body.flatMap((statement) => taggedNames(model.text, statement))
  );
  browserNames.set(model.file, names);
  return names;
}

/** The name a call is made by and the member it calls on it: `dur(…)`, `ListSwap.enterAt(…)`. */
function calleeParts(callee) {
  if (callee.type === "Identifier") {
    return { head: callee, member: null };
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.property.type === "Identifier"
  ) {
    return { head: callee.object, member: callee.property.name };
  }
  return null;
}

/** The module's `@browser` names and the head's name in it, or null. */
function namesFor(model, head) {
  const binding = bindingAt(model, head.name, head.start);
  if (binding?.kind === "import") {
    const file = moduleFile(binding.source, model.file);
    if (!file || binding.imported === "*" || binding.imported === "default") {
      return null;
    }
    return { names: browserNamesOf(modelOf(file)), name: binding.imported };
  }
  // The file's own top level.
  if (binding?.start === 0 && binding.end === model.text.length) {
    return { names: browserNamesOf(model), name: head.name };
  }
  return null;
}

/** The `@browser` name a call calls, as its module names it, or null. */
function calledName(model, callee) {
  const parts = calleeParts(callee);
  const found = parts && namesFor(model, parts.head);
  if (!found) {
    return null;
  }
  const full = parts.member ? `${found.name}.${parts.member}` : found.name;
  return found.names.has(full) ? full : null;
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
