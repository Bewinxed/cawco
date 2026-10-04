<script lang="ts">
  import { type ComponentProps, tick } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
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
   * The part of the layout viewport the reader can see, as the sheet's
   * --visible-top and --visible-height: a software keyboard takes the bottom
   * of it and iOS Safari pans it. app.css (the rule for bottom sheets) places
   * the sheet from the two. They are read from `visualViewport` on each of
   * its events and nothing is kept between events, so no keyboard state can
   * leave a sheet small. They reach the sheet through its `style` prop: a
   * property written on the node is lost whenever that attribute is redrawn.
   */
  let visible = $state("");

  /** Lives on the sheet's own child, so it listens only while the sheet is open. */
  const followVisibleViewport: Attachment = () => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const place = async () => {
      visible = `--visible-top:${viewport.offsetTop}px;--visible-height:${viewport.height}px;`;
      // Once the sheet is laid out in what is now visible, the field being
      // typed in stays in view inside whatever scrolls it.
      await tick();
      const field = document.activeElement;
      if (
        field?.matches("input, textarea, [contenteditable]") &&
        ref?.contains(field)
      ) {
        field.scrollIntoView({ block: "nearest" });
      }
    };
    place();
    // A keyboard resizes the visual viewport; a pan only scrolls it.
    const stops = [
      on(viewport, "resize", place),
      on(viewport, "scroll", place),
    ];
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  };
</script>

<DrawerPortal {...portalProps}>
  <DrawerOverlay />
  <DrawerPrimitive.Content
    class={cn(
      "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-foreground text-label before:absolute before:inset-2 before:-z-10 before:rounded-[var(--radius-lg)] before:border before:border-border before:bg-[var(--surface-raised)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
      className
    )}
    data-slot="drawer-content"
    style={`${visible}${style ?? ""}`}
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
      {@attach followVisibleViewport}
    >
      {@render children?.()}
    </div>
  </DrawerPrimitive.Content>
</DrawerPortal>
