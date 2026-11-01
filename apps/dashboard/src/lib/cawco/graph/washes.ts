/**
 * The change marks (the owner's pick "Diff washes"): while a hover previews
 * a state that differs from the kept one, a wash stands behind every value
 * that came in or changed, and one where a value went, at its old box.
 *
 * A value is an element's own words or a field's value, keyed by its place
 * among its kind (its tag and its `data-slot`, `id` or `name` up the tree,
 * and which of those it is), not by its index, so a line put in above
 * doesn't mark everything after it as changed.
 */

interface Value {
  box: { height: number; width: number; x: number; y: number };
  text: string;
}
export interface Wash extends Value {
  kind: "in" | "gone";
}

const own = (element: Element): string => {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    }
  }
  return text.replace(/\s+/gu, " ").trim();
};

const mark = (element: Element): string => {
  const name =
    element.getAttribute("data-slot") ??
    element.getAttribute("name") ??
    element.id;
  return name ? `${element.tagName}[${name}]` : element.tagName;
};

/** Every value under `root`, keyed by its place, its box relative to `root`. */
export function readValues(root: HTMLElement): Map<string, Value> {
  const origin = root.getBoundingClientRect();
  const seen = new Map<string, number>();
  const values = new Map<string, Value>();
  const walk = (element: Element, trail: string) => {
    const here = `${trail}/${mark(element)}`;
    const text = own(element);
    if (text) {
      const count = seen.get(here) ?? 0;
      seen.set(here, count + 1);
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        values.set(`${here}#${count}`, {
          text,
          box: {
            x: box.left - origin.left,
            y: box.top - origin.top,
            width: box.width,
            height: box.height,
          },
        });
      }
    }
    for (const child of element.children) {
      walk(child, here);
    }
  };
  for (const child of root.children) {
    walk(child, "");
  }
  return values;
}

/** What came in or changed between `kept` and `shown`, and what went. */
export function washesOf(
  kept: Map<string, Value>,
  shown: Map<string, Value>
): Wash[] {
  const washes: Wash[] = [];
  for (const [key, value] of shown) {
    if (kept.get(key)?.text !== value.text) {
      washes.push({ ...value, kind: "in" });
    }
  }
  for (const [key, value] of kept) {
    if (!shown.has(key)) {
      washes.push({ ...value, kind: "gone" });
    }
  }
  return washes;
}
