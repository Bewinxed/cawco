<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import type { WithoutChildrenOrChild } from "$lib/utils.js";
  import { cn } from "$lib/utils.js";
  import DrawerOverlay from "./drawer-overlay.svelte";
  import DrawerPortal from "./drawer-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    ...restProps
  }: DrawerPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
  } = $props();
</script>

<DrawerPortal {...portalProps}>
  <DrawerOverlay />
  <DrawerPrimitive.Content
    class={cn("group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-foreground text-label before:absolute before:inset-2 before:-z-10 before:rounded-[var(--radius-lg)] before:border before:border-border before:bg-[var(--surface-raised)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm", className)}
    data-slot="drawer-content"
    bind:ref
    {...restProps}
  >
    <div
      class="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-[var(--radius-pill)] bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
    ></div>
    <!-- vaul takes pointer capture on every press in the sheet, which leaves
         a text field without iOS's hold-to-select and Paste callout: a press
         that starts in a field never reaches it. -->
    <div
      class="contents"
      role="presentation"
      onpointerdown={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) {
          event.stopPropagation();
        }
      }}
    >
      {@render children?.()}
    </div>
  </DrawerPrimitive.Content>
</DrawerPortal>
