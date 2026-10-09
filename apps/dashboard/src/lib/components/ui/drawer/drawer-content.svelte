<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { visible } from "#lib/cawco/visible-viewport.svelte.js";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import DrawerOverlay from "./drawer-overlay.svelte";
  import DrawerPortal from "./drawer-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    style,
    portalProps,
    children,
    ...restProps
  }: DrawerPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
  } = $props();

  /**
   * The visible area as the sheet's --visible-top and --visible-height,
   * from the one measurement of it (cawco/visible-viewport); app.css rests a
   * bottom sheet on the keyboard from the two. They reach the sheet through
   * its `style` prop: a property written on the node is lost whenever that
   * attribute is redrawn.
   */
  const place = $derived(
    visible.height > 0
      ? `--visible-top:${visible.top}px;--visible-height:${visible.height}px;`
      : ""
  );
</script>

<DrawerPortal {...portalProps}>
  <DrawerOverlay />
  <!-- The surface is drawn on ::before, inset from the sheet's box. A bottom
       sheet's is full-bleed: edge to edge and flush on the screen's foot,
       its corners rounded and its hairline drawn along the top edge only.
       Its foot keeps the safe area clear, the same for every sheet. -->
  <DrawerPrimitive.Content
    class={cn(
      "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-foreground text-label before:absolute before:inset-2 before:-z-10 before:rounded-[var(--radius-lg)] before:border before:border-border before:bg-[var(--surface-raised)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=bottom]:pb-[calc(1rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:before:inset-x-0 data-[vaul-drawer-direction=bottom]:before:bottom-0 data-[vaul-drawer-direction=bottom]:before:rounded-b-none data-[vaul-drawer-direction=bottom]:before:border-x-0 data-[vaul-drawer-direction=bottom]:before:border-b-0 data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
      className
    )}
    data-slot="drawer-content"
    style={`${place}${style ?? ""}`}
    bind:ref
    {...restProps}
  >
    <div
      class="mx-auto mt-4 mb-3 hidden h-1.5 w-[100px] shrink-0 rounded-[var(--radius-pill)] bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
    ></div>
    <!-- vaul takes pointer capture on every press in the sheet, which leaves
         a text field without iOS's hold-to-select and Paste callout: a press
         that starts in a field never reaches it. -->
    <div
      class="contents"
      onpointerdown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "input, textarea, select, [contenteditable]"
          )
        ) {
          event.stopPropagation();
        }
      }}
      role="presentation"
    >
      {@render children?.()}
    </div>
  </DrawerPrimitive.Content>
</DrawerPortal>
