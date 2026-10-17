<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a width of its own, or a least width over the kit's. */
  export const dropdownMenuSubContentVariants = tv({
    variants: {
      width: { wide: "w-72" },
      min: { compact: "min-w-40" },
    },
  });

  export type DropdownMenuSubContentLooks = VariantProps<
    typeof dropdownMenuSubContentVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { submenuSide } from "#lib/components/ui/submenu-side.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { browser } from "$app/env";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    width,
    min,
    ...restProps
  }: Omit<DropdownMenuPrimitive.SubContentProps, "side" | "collisionPadding"> &
    DropdownMenuSubContentLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof DropdownMenuPortal>
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
     menu it was cut by the menu's scroll box and placed in the menu's
     coordinates. -->
<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.SubContent
    class={cn(
      "kit-pop relative z-50 max-h-(--bits-menu-content-available-height) w-auto min-w-36 origin-(--bits-menu-content-transform-origin) overflow-y-auto overflow-x-hidden",
      dropdownMenuSubContentVariants({ width, min }),
      className
    )}
    collisionPadding={inset}
    data-slot="dropdown-menu-sub-content"
    {side}
    bind:ref
    {...restProps}
  />
</DropdownMenuPortal>
