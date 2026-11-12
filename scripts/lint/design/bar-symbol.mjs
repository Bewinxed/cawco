// house/bar-symbol-linear: a symbol standing in a bar's glass is Solar's
// linear cut (the owner's pick on the artifact panel's decision page, Solar
// Linear: "Solar's thin line cut in every bar, the duotone kept for status,
// tiles and rows"; DESIGN.md, The Solar Duotone Rule). The duotone cut came
// back into bars each time a caller handed BarItem the product icon of the
// name it wanted, which is the duotone one.
//
// What the rule reads, in a `.svelte` file's markup: the product icons
// (`Icon…`) named in a BarItem's `icon` (a ternary's both arms included),
// a product icon drawn as a bar's symbol (`data-slot="bar-symbol"`), and
// a mark drawn anywhere inside a BarItem's children, whatever its slot:
// Jump's lens and a project's machine mark stood in a bar item's children
// outside the symbol slot, where the rule did not look, and a filled OS mark
// stood beside the linear symbols. Each product icon is a `…Linear` twin
// (packages/icons), or one of the glyphs already drawn in the linear
// grammar: the local Close, Plus, Tick and Check, and Solar's linear
// chevrons and lens; an OsMark in a bar item is drawn in its linear face
// (`face="linear"`).
import { eachNode, parentOf } from "./model.mjs";

const ICON = /^Icon[A-Z]\w*$/u;
const LINE_GLYPHS = new Set([
  "IconClose",
  "IconPlus",
  "IconTick",
  "IconCheck",
  "IconSearch",
  "IconChevronLeft",
  "IconChevronRight",
  "IconChevronDown",
  "IconChevronUp",
]);

const MESSAGE =
  "A bar's symbol is Solar's linear cut (the owner's pick, Solar Linear): hand BarItem the icon's `…Linear` twin from #lib/icons.js (packages/icons), adding one there where it has none.";

const OS_MESSAGE =
  "A bar's symbol is Solar's linear cut: an OsMark standing in a BarItem is drawn in its linear face, `face=\"linear\"`.";

const linear = (name) => name.endsWith("Linear") || LINE_GLYPHS.has(name);

/** Whether a node of the markup stands inside a BarItem's children. */
function inBarItem(model, node) {
  for (let up = parentOf(model, node); up; up = parentOf(model, up)) {
    if (up.type === "Component" && up.name === "BarItem") {
      return true;
    }
  }
  return false;
}

/** The static value of a node's attribute, or null. */
const attributeText = (node, name) => {
  const attribute = (node.attributes ?? []).find(
    (one) => one.type === "Attribute" && one.name === name
  );
  return Array.isArray(attribute?.value)
    ? attribute.value.map((part) => part.data ?? "").join("")
    : null;
};

/** The icon names an expression reads (an identifier, a ternary's arms). */
function iconsIn(expression, found = []) {
  if (!expression || typeof expression !== "object") {
    return found;
  }
  if (expression.type === "Identifier" && ICON.test(expression.name)) {
    found.push(expression);
  } else if (expression.type === "ConditionalExpression") {
    iconsIn(expression.consequent, found);
    iconsIn(expression.alternate, found);
  } else if (expression.type === "LogicalExpression") {
    iconsIn(expression.left, found);
    iconsIn(expression.right, found);
  }
  return found;
}

/** Whether a node of the markup carries `data-slot="bar-symbol"`. */
const barSymbol = (node) =>
  (node.attributes ?? []).some(
    (attribute) =>
      attribute.type === "Attribute" &&
      attribute.name === "data-slot" &&
      Array.isArray(attribute.value) &&
      attribute.value.some((part) => part.data === "bar-symbol")
  );

/** The icons a BarItem's `icon` names. */
function iconsOfBarItem(node) {
  return (node.attributes ?? [])
    .filter(
      (attribute) => attribute.type === "Attribute" && attribute.name === "icon"
    )
    .flatMap((attribute) => {
      const tag = Array.isArray(attribute.value)
        ? attribute.value[0]
        : attribute.value;
      return iconsIn(tag?.expression);
    });
}

export function barSymbols(model) {
  const findings = [];
  const report = (node) =>
    findings.push({ start: node.start, end: node.end, message: MESSAGE });
  eachNode(model, (node) => {
    if (node.type !== "Component") {
      return;
    }
    if (node.name === "BarItem") {
      for (const icon of iconsOfBarItem(node)) {
        if (!linear(icon.name)) {
          report(icon);
        }
      }
    } else if (
      ICON.test(node.name) &&
      !linear(node.name) &&
      (barSymbol(node) || inBarItem(model, node))
    ) {
      report(node);
    } else if (
      node.name === "OsMark" &&
      attributeText(node, "face") !== "linear" &&
      (barSymbol(node) || inBarItem(model, node))
    ) {
      findings.push({ start: node.start, end: node.end, message: OS_MESSAGE });
    }
  });
  return findings;
}
