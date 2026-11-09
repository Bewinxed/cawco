/**
 * Where each item of a bar's glass stands (BarGlass): leading, middle,
 * trailing, or the only one, written on the item as `data-glass-at`, so its
 * corners follow (design.css `concentric-row`). An item is the outermost
 * control or control group the glass holds: a BarItem (a BarSegments'
 * segment among them, its glass the list), a kit Button, Toggle or menu
 * trigger. What hangs from the glass in
 * its markup (a card, a menu, a dialog) is no item of it. Only the items
 * drawn are counted: a wrapper's `hidden`, a breakpoint's `display: none`
 * and an item an `{#if}` took away all move the ends, read again on every
 * change of the glass's markup and, in the next frame (frameObserver), of
 * any item's size.
 */
import { frameObserver } from "#lib/platform/frame-observer.js";

const PART =
  '[data-bar-item], button, a[href], [role="button"], [role="tablist"], [role="radiogroup"], [role="group"]';
const HUNG =
  '[data-hang], [role="menu"], [role="listbox"], [role="dialog"], [data-popover]';

type GlassAt = "leading" | "middle" | "trailing" | "only";

/** The items of `glass`, in their order, each the outermost part between it and the glass, none inside what hangs from it. */
function partsOf(glass: HTMLElement): HTMLElement[] {
  return [...glass.querySelectorAll<HTMLElement>(PART)].filter((el) => {
    for (let up = el.parentElement; up && up !== glass; up = up.parentElement) {
      if (up.matches(PART) || up.matches(HUNG)) {
        return false;
      }
    }
    return true;
  });
}

/** Each drawn item's place among `count`. */
function placeOf(index: number, count: number): GlassAt {
  if (count === 1) {
    return "only";
  }
  if (index === 0) {
    return "leading";
  }
  return index === count - 1 ? "trailing" : "middle";
}

/** Marks every item of `glass` with its place, and again on each change; the returned function stops it. */
export function placeItems(glass: HTMLElement): () => void {
  let parts: HTMLElement[] = [];
  const sizes = frameObserver(() => mark());
  const mark = () => {
    const now = partsOf(glass);
    for (const gone of parts.filter((el) => !now.includes(el))) {
      sizes.unobserve(gone);
      gone.removeAttribute("data-glass-at");
    }
    for (const added of now.filter((el) => !parts.includes(el))) {
      sizes.observe(added);
    }
    parts = now;
    const drawn = now.filter((el) => el.checkVisibility());
    for (const el of now) {
      const at = drawn.includes(el)
        ? placeOf(drawn.indexOf(el), drawn.length)
        : null;
      if (at === null) {
        el.removeAttribute("data-glass-at");
      } else if (el.dataset.glassAt !== at) {
        el.dataset.glassAt = at;
      }
    }
  };
  const changes = new MutationObserver(mark);
  changes.observe(glass, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"],
  });
  sizes.observe(glass);
  mark();
  return () => {
    changes.disconnect();
    sizes.disconnect();
    for (const el of parts) {
      el.removeAttribute("data-glass-at");
    }
  };
}
