// house/back-close-symbol: Back and Close in a bar are symbols, named by
// where they go, never words beside the glyph (DESIGN.md, The Title Bars
// Follow Liquid Glass Rule: "Back and Close are symbols, named by where they
// go, never the words Back or Close"). The phone's task and folder-file
// pages drew a ghost Button holding the back chevron and the project's name
// ("‹ Pantry rewrite"), which the rendered back-close check could not tell
// from any other button with words: it reads words, not which glyph stands
// beside them.
//
// What the rule reads, in a `.svelte` file's markup: a bar control holding
// a back or close glyph and words. A bar control is a BarItem anywhere, or
// a Button or `<button>` standing in a bar: under a `<header>`, a BarGlass,
// or an element whose `data-slot` names a bar. The glyphs are
// packages/icons' back and close marks, by the name they are imported as
// from #lib/icons.js or @cawco/icons (an alias followed): IconChevronLeft
// (Solar's alt-arrow-left), IconArrowLeft, IconClose and IconCloseTab;
// handed to BarItem's `icon` or drawn as a child. Words are any text or
// `{expression}` among the control's children outside the glyph.
import { eachNode, parentOf } from "./model.mjs";

const GLYPHS = new Set([
  "IconChevronLeft",
  "IconArrowLeft",
  "IconClose",
  "IconCloseTab",
]);
const ICON_SOURCES = new Set(["#lib/icons.js", "#lib/icons", "@cawco/icons"]);
const BAR_SLOTS = new Set([
  "bar",
  "view-bar",
  "page-head",
  "project-head",
  "side-head",
  "sheet-header",
  "drawer-header",
  "dialog-header",
  "foot",
  "page-foot",
  "sheet-footer",
  "drawer-footer",
  "dialog-footer",
]);

const MESSAGE =
  "Back and Close in a bar are symbols, named by where they go (never the words Back or Close): a BarItem with the glyph as its `icon` and the place in its `label` (commonWords.backTo, commonWords.close), no words beside the glyph.";

/** Each local name bound to a back or close glyph by the file's imports. */
function glyphNames(model) {
  const names = new Set();
  for (const script of [model.ast.module, model.ast.instance]) {
    for (const statement of script?.content?.body ?? []) {
      if (
        statement.type !== "ImportDeclaration" ||
        !ICON_SOURCES.has(statement.source.value)
      ) {
        continue;
      }
      for (const spec of statement.specifiers) {
        if (
          spec.type === "ImportSpecifier" &&
          GLYPHS.has(spec.imported.name ?? spec.imported.value)
        ) {
          names.add(spec.local.name);
        }
      }
    }
  }
  return names;
}

const attribute = (node, name) =>
  (node.attributes ?? []).find(
    (one) => one.type === "Attribute" && one.name === name
  );

/** Whether `node` carries a static `data-slot` naming a bar. */
function barSlot(node) {
  const slot = attribute(node, "data-slot");
  return (
    Array.isArray(slot?.value) &&
    slot.value.some((part) => BAR_SLOTS.has(part.data))
  );
}

/** Whether a markup node stands in a bar: under a header, a glass or a bar's slot. */
function inBar(model, node) {
  for (let at = parentOf(model, node); at; at = parentOf(model, at)) {
    if (
      (at.type === "RegularElement" && at.name === "header") ||
      (at.type === "Component" && at.name === "BarGlass") ||
      ((at.type === "RegularElement" || at.type === "Component") && barSlot(at))
    ) {
      return true;
    }
  }
  return false;
}

/** The identifiers an expression reads, a ternary's and a `||`'s arms included. */
function identifiersIn(expression, found = []) {
  if (!expression || typeof expression !== "object") {
    return found;
  }
  if (expression.type === "Identifier") {
    found.push(expression.name);
  } else if (expression.type === "ConditionalExpression") {
    identifiersIn(expression.consequent, found);
    identifiersIn(expression.alternate, found);
  } else if (expression.type === "LogicalExpression") {
    identifiersIn(expression.left, found);
    identifiersIn(expression.right, found);
  }
  return found;
}

/** The glyph a BarItem's `icon` hands it, if a back or close one. */
function iconGlyph(node, glyphs) {
  const icon = attribute(node, "icon");
  const tag = Array.isArray(icon?.value) ? icon.value[0] : icon?.value;
  return identifiersIn(tag?.expression).some((name) => glyphs.has(name));
}

/** What a control's children hold: a back or close glyph, and words outside it. */
function childrenOf(node, glyphs) {
  let glyph = false;
  let words = false;
  const visit = (nodes) => {
    for (const child of nodes ?? []) {
      if (child.type === "Component" && glyphs.has(child.name)) {
        glyph = true;
      } else if (child.type === "Text") {
        words ||= child.data.trim() !== "";
      } else if (child.type === "ExpressionTag") {
        words = true;
      } else {
        visit(child.fragment?.nodes);
        visit(child.consequent?.nodes);
        visit(child.alternate?.nodes);
        visit(child.body?.nodes);
      }
    }
  };
  visit(node.fragment?.nodes);
  return { glyph, words };
}

export function backCloseWords(model) {
  if (model.kind !== "svelte") {
    return [];
  }
  const glyphs = glyphNames(model);
  if (glyphs.size === 0) {
    return [];
  }
  const findings = [];
  eachNode(model, (node) => {
    const control =
      (node.type === "Component" &&
        (node.name === "BarItem" ||
          (node.name === "Button" && inBar(model, node)))) ||
      (node.type === "RegularElement" &&
        node.name === "button" &&
        inBar(model, node));
    if (!control) {
      return;
    }
    const held = childrenOf(node, glyphs);
    const glyph =
      held.glyph || (node.name === "BarItem" && iconGlyph(node, glyphs));
    if (glyph && held.words) {
      findings.push({ start: node.start, end: node.end, message: MESSAGE });
    }
  });
  return findings;
}
