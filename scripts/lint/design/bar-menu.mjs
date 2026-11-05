// house/no-detached-bar-menu: a menu or popover opened from a bar's glass
// hangs from that glass, connected, never detached under its trigger.
//
// The owner, on the artifact panel's title menu (2026-11-05): "the popover
// should open same as the caw icon on the top right of the web app,
// connected, why do we keep repeating this mistake". Caw's card hangs from
// the top bar's glass as one shape with it (GlassCard, HangCard); a head's
// glass does the same for its menus (BarMenu, the kit's
// ui/bar-glass/bar-menu.svelte, in a `DropdownMenu.Root` in the Content's
// place) and its popovers (HangCard on the glass, as DesignGraph's view).
//
// What the rule reads, in a `.svelte` file's markup: the kit's floating
// content (`DropdownMenu.Content`, `Popover.Content`, `ContextMenu.Content`)
// standing inside a `BarGlass` or a bar (a `<header>`), or inside a
// primitive's Root whose trigger is an item of a glass (`data-bar-item`).
// Each is a menu opened from a bar control drawn detached; it is reported
// on the Content.
import { eachNode, parentOf } from "./model.mjs";

const DETACHED = /^(?:DropdownMenu|Popover|ContextMenu)\.Content$/u;
const ROOT = /^(?:DropdownMenu|Popover|ContextMenu)\.Root$/u;

const MESSAGE =
  "A menu or popover opened from a bar's glass hangs from it, connected, as Caw's card hangs from the top bar's glass: put BarMenu (ui/bar-glass) in this Content's place, or a HangCard anchored on the glass (DesignGraph's view), never a detached Content (scripts/lint/design/bar-menu.mjs).";

/** Whether a node of the markup carries the attribute `name`. */
const carries = (node, name) =>
  (node.attributes ?? []).some(
    (attribute) => attribute.type === "Attribute" && attribute.name === name
  );

/** Whether anything under `root` is an item of a glass. */
function holdsBarItem(root) {
  let found = false;
  const visit = (node) => {
    if (found || !node || typeof node !== "object") {
      return;
    }
    if (carries(node, "data-bar-item")) {
      found = true;
      return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        visit(value);
      }
    }
  };
  visit(root.fragment);
  return found;
}

export function detachedBarMenus(model) {
  if (model.kind !== "svelte") {
    return [];
  }
  const findings = [];
  eachNode(model, (node) => {
    if (node.type !== "Component" || !DETACHED.test(node.name)) {
      return;
    }
    let at = parentOf(model, node);
    while (at) {
      const inGlass =
        (at.type === "Component" && at.name === "BarGlass") ||
        (at.type === "RegularElement" && at.name === "header");
      const fromBarItem =
        at.type === "Component" && ROOT.test(at.name) && holdsBarItem(at);
      if (inGlass || fromBarItem) {
        findings.push({ start: node.start, end: node.end, message: MESSAGE });
        return;
      }
      at = parentOf(model, at);
    }
  });
  return findings;
}
