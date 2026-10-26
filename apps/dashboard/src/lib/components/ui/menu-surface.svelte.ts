/**
 * A menu's surface (the dropdown menu's, the context menu's) and its
 * submenus': one ghost gliding from item to item under the pointer and
 * arrow keys (highlight). A menu takes no lock on the page (`preventScroll`
 * false, floating-presence), so a press outside closes it and lands on what
 * it was pressed on, the focus left there (`pressedAway`). A submenu keeps
 * the pages' gutter from the screen's edge, as the popover does, and stands
 * beside its row, or hangs from it where neither side holds it
 * (submenu-side). Each is set up with its content.
 */

import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
import { browser } from "$app/env";
import { pressedAway } from "./floating-presence.js";
import { highlight } from "./highlight/highlight.svelte.js";
import { submenuSide } from "./submenu-side.js";

function ghost(content: () => HTMLElement | null): void {
  $effect(() => {
    const el = content();
    if (el) {
      return highlight({
        rows: "[data-menu-item]",
        hovered: "[data-highlighted]",
      })(el);
    }
  });
}

export function menuSurface(site: Parameters<typeof pressedAway>[0]) {
  const away = pressedAway(site);
  ghost(site.content);
  return away;
}

export function submenuSurface(content: () => HTMLElement | null): {
  readonly inset: number;
  readonly side: "right" | "bottom";
} {
  const inset = browser ? numberOf("--space-5") : 0;
  let side = $state<"right" | "bottom">("right");
  $effect(() => {
    const el = content();
    if (el) {
      side = submenuSide(el, inset);
    }
  });
  ghost(content);
  return {
    inset,
    get side() {
      return side;
    },
  };
}
