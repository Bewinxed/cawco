// house/bar-item-in-kit: a bar's item is the kit's BarItem
// (src/lib/components/ui/bar-glass/bar-item.svelte), which draws every state
// of it on one box: hover, pressed, selected and focus share one contour,
// concentric with the glass. A raw `<button data-bar-item>` outside the kit
// wrote its own selected or pressed fill (a design graph's Compare, a
// project head's Full size), each its own way, and the glass's items drew
// four shapes between them. So the mark is written only inside
// ui/bar-glass; a caller mounts BarItem (`pressed`, `marked`, `expanded`,
// `count`, `tone`, or `children` for what it draws), and a reader outside
// the kit finds the items by the kit's `BAR_ITEM` (bar-glass/marks.ts).
import { eachNode } from "./model.mjs";

const MARK = "data-bar-item";
const ELEMENTS = new Set(["RegularElement", "SvelteElement"]);

/** Whether a string the file writes names the mark (a selector, a class). */
const names = (value) => typeof value === "string" && value.includes(MARK);

export function barItemsOutsideKit(model) {
  const findings = [];
  const report = (node, message) =>
    findings.push({ start: node.start, end: node.end, message });
  eachNode(model, (node, parent) => {
    if (
      node.type === "Attribute" &&
      node.name === MARK &&
      ELEMENTS.has(parent?.type)
    ) {
      report(
        node,
        "A bar's item is the kit's BarItem (ui/bar-glass): it draws hover, pressed, selected and focus on one box, concentric with the glass. Mount BarItem with `pressed`, `marked`, `expanded`, `count` or `tone`, and what it draws as `icon` or `children`, rather than writing the mark on your own button."
      );
    } else if (
      (node.type === "Literal" && names(node.value)) ||
      (node.type === "TemplateElement" && names(node.value?.cooked))
    ) {
      report(
        node,
        "Only the kit writes the bar item's mark: find its items by `BAR_ITEM` (ui/bar-glass/marks.ts)."
      );
    }
  });
  return findings;
}
