/**
 * A menu's surface (the dropdown menu's, the context menu's) and its
 * submenus': one ghost gliding from item to item under the pointer and
 * arrow keys (highlight). A menu takes no lock on the page (`preventScroll`
 * false, floating-presence), so a press outside closes it and lands on what
 * it was pressed on, the focus left there (`pressedAway`). A submenu keeps
 * the pages' gutter from the screen's edge, as the popover does. Each
 * stands in its layer's box on its anchor (anchored.svelte.ts), one step
 * above the surface it opens in (theme.css `surface`). Each is set up with
 * its content.
 */

import { numberOf } from "#lib/platform/motion/curves.svelte.js";
import { browser } from "$app/env";
import { layerProps, type Placement } from "./anchored.svelte.js";
import { rise } from "./elevated/index.js";
import { pressedAway } from "./floating-presence.js";
import { highlight } from "./highlight/highlight.svelte.js";
import { markMenuEnds } from "./menu-item/ends.js";

function ghost(content: () => HTMLElement | null): void {
  $effect(() => {
    const el = content();
    if (el) {
      return markMenuEnds(el);
    }
  });
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

export function menuSurface(
  site: Parameters<typeof pressedAway>[0],
  placement: () => Placement
) {
  const away = pressedAway(site);
  ghost(site.content);
  return { ...away, layer: layerProps(placement), level: rise() };
}

export function submenuSurface(content: () => HTMLElement | null) {
  const inset = browser ? numberOf("--spacing-space-4") : 0;
  ghost(content);
  return {
    /**
     * Beside the row that opens it, on whichever side holds it whole, or
     * hung from the row's foot where neither does (a phone's width), slid
     * along it to stay inside the screen.
     */
    layer: layerProps(() => ({
      side: "right",
      align: "start",
      collisionPadding: inset,
      below: true,
    })),
    level: rise(),
  };
}
