/**
 * What differs between two stands of the live column, read off their DOM
 * (the design graph's washes, Projects spec §5.10): each card by its task,
 * the count by its figure, the column by what it says of itself (taking a
 * drop, closed, picking). A value that came in or changed is marked on the
 * stand that shows it; one that went is marked where it stood on the other.
 */

export interface Mark {
  h: number;
  kind: "came" | "went";
  radius: number;
  w: number;
  x: number;
  y: number;
}

/** Each value a stand shows, keyed, with what it says. */
function valuesOf(
  root: HTMLElement
): Map<string, { el: Element; said: string }> {
  const out = new Map<string, { el: Element; said: string }>();
  const column = root.querySelector("[data-slot=column]");
  if (column) {
    const said = ["data-over", "data-closed"]
      .map((one) => `${one}:${column.hasAttribute(one)}`)
      .join(" ");
    out.set("column", { el: column, said });
  }
  const count = root.querySelector("[data-slot=count]");
  if (count) {
    out.set("count", { el: count, said: count.textContent?.trim() ?? "" });
  }
  for (const item of root.querySelectorAll("li[data-flip]")) {
    const id = item.querySelector("[data-task]")?.getAttribute("data-task");
    if (id) {
      const said = [
        item.hasAttribute("data-picked"),
        item.hasAttribute("data-moving"),
        item.textContent?.replace(/\s+/gu, " ").trim(),
      ].join("|");
      out.set(`card:${id}`, { el: item, said });
    }
  }
  return out;
}

/** An element's box in its stand's own coordinates (unscaled). */
function boxIn(root: HTMLElement, el: Element) {
  const origin = root.getBoundingClientRect();
  const scale = origin.width / (root.offsetWidth || origin.width || 1);
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left - origin.left) / scale,
    y: (rect.top - origin.top) / scale,
    w: rect.width / scale,
    h: rect.height / scale,
    radius: Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
  };
}

/**
 * The marks on `mine` against `other`: as `came`, `mine` is the state
 * arriving and every value it shows that `other` lacks or says otherwise is
 * marked; as `went`, `mine` is the state left and every value `other` lacks
 * is marked where it stood.
 */
export function marksOf(
  mine: HTMLElement,
  other: HTMLElement,
  kind: "came" | "went"
): Mark[] {
  const here = valuesOf(mine);
  const there = valuesOf(other);
  const marks: Mark[] = [];
  for (const [key, value] of here) {
    const was = there.get(key);
    const differs = kind === "came" ? !was || was.said !== value.said : !was;
    if (differs) {
      marks.push({ kind, ...boxIn(mine, value.el) });
    }
  }
  return marks;
}
