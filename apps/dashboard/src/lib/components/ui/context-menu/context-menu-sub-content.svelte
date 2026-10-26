<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a least width over the kit's; or a card of its
      own (a width, the card's corner and high shadow, its padding). */
  const contextMenuSubContentVariants = tv({
    variants: {
      min: { standard: "min-w-52" },
      width: { wide: "w-64" },
      frame: { "panel-high": "rounded-lg shadow-xl" },
      pad: { card: "p-3" },
    },
  });

  type ContextMenuSubContentLooks = VariantProps<
    typeof contextMenuSubContentVariants
  >;
</script>

<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { submenuSurface } from "#lib/components/ui/menu-surface.svelte.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
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

  const surface = submenuSurface(() => ref);
</script>

<!-- In the top layer's portal, as every kit floating surface is: inside its
     menu it was cut by the menu's scroll box (and a hanging menu's clip) and
     placed in the menu's coordinates. -->
<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.SubContent
    class={cn(
      floatingSurface(),
      "relative z-(--layer-float) max-h-(--bits-menu-content-available-height) min-w-32 origin-(--bits-menu-content-transform-origin) overflow-y-auto overflow-x-hidden",
      contextMenuSubContentVariants({ min, width, frame, pad }),
      className
    )}
    collisionPadding={surface.inset}
    data-slot="context-menu-sub-content"
    side={surface.side}
    bind:ref
    {...restProps}
  />
</ContextMenuPortal>
