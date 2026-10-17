<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a least width over the kit's; or a card of its
      own (a width, the card's corner and high shadow, its padding). */
  export const contextMenuSubContentVariants = tv({
    variants: {
      min: { standard: "min-w-52" },
      width: { wide: "w-64" },
      frame: { "panel-high": "rounded-lg shadow-xl" },
      pad: { card: "p-3" },
    },
  });

  export type ContextMenuSubContentLooks = VariantProps<
    typeof contextMenuSubContentVariants
  >;
</script>

<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { submenuSide } from "#lib/components/ui/submenu-side.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { browser } from "$app/env";
  import ContextMenuPortal from "./context-menu-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    min,
    width,
    frame,
    pad,
    ...restProps
  }: Omit<ContextMenuPrimitive.SubContentProps, "side" | "collisionPadding"> &
    ContextMenuSubContentLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof ContextMenuPortal>
      >;
    } = $props();

  // The pages' gutter from the screen's edge, as the popover keeps it.
  const inset = browser ? numberOf("--space-5") : 0;
  // Beside its row, or hung from it where neither side holds it (submenu-side).
  let side = $state<"right" | "bottom">("right");
  $effect(() => {
    if (ref) {
      side = submenuSide(ref, inset);
    }
  });

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({ rows: ".kit-item", hovered: "[data-highlighted]" })(
        ref
      );
    }
  });
</script>

<!-- In the top layer's portal, as every kit floating surface is: inside its
     menu it was cut by the menu's scroll box (and a hanging menu's clip) and
     placed in the menu's coordinates. -->
<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.SubContent
    class={cn(
      "kit-pop relative z-50 max-h-(--bits-menu-content-available-height) min-w-32 origin-(--bits-menu-content-transform-origin) overflow-y-auto overflow-x-hidden",
      contextMenuSubContentVariants({ min, width, frame, pad }),
      className
    )}
    collisionPadding={inset}
    data-slot="context-menu-sub-content"
    {side}
    bind:ref
    {...restProps}
  />
</ContextMenuPortal>
