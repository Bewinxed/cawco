<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  export const drawerContentVariants = tv({
    variants: {
      /** Its foot: a sheet with a footer of its own height (`--sheet-foot`)
          and no other padding; or the safe area alone, on every sheet or a
          bottom sheet only. */
      pad: {
        "sheet-foot":
          "p-0 pb-(--sheet-foot) vaul-drawer-direction-bottom:pb-(--sheet-foot)",
        "safe-bottom": "pb-(--safe-bottom)",
        "sheet-safe-bottom": "vaul-drawer-direction-bottom:pb-(--safe-bottom)",
      },
      /** A sheet in a column that may shrink below its content. */
      height: { shrink: "min-h-0" },
      /** The new-session card: the dialog's theme, no outline or margin,
          and no motion of its own under reduced motion (over vaul's). */
      look: {
        "new-session":
          "ns-theme m-0 outline-none motion-reduce:animate-none! motion-reduce:transition-none!",
      },
    },
  });

  export type DrawerContentLooks = VariantProps<typeof drawerContentVariants>;
</script>

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
    hosted = false,
    modal = true,
    pad,
    height,
    look,
    children,
    ...restProps
  }: DrawerPrimitive.ContentProps &
    DrawerContentLooks & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
      /**
       * The sheet fills a host of its own (the preview standing on the
       * composer): the host places it, and the kit leaves its place alone.
       */
      hosted?: boolean;
      /** As its root's `modal`: false, the page under it stays live, to a screen reader too. */
      modal?: boolean;
    } = $props();

  /**
   * A sheet whose root is `modal={false}` is not modal to a screen reader
   * either: its content says `aria-modal="false"`, held there through every
   * redraw. vaul-svelte (1.0.0-next.7) does not forward `modal` to bits-ui's
   * Dialog.Root, and bits-ui (2.19.5) writes `aria-modal="true"` on every
   * dialog's content: the gap React vaul closed in emilkowalski/vaul#580,
   * unreleased per #647. Delete this once vaul-svelte forwards `modal`.
   */
  $effect(() => {
    const node = ref;
    if (modal || !node) {
      return;
    }
    const hold = () => {
      if (node.getAttribute("aria-modal") !== "false") {
        node.setAttribute("aria-modal", "false");
      }
    };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(node, { attributeFilter: ["aria-modal"] });
    return () => watch.disconnect();
  });

  /**
   * The visible area as the sheet's --visible-top and --visible-height,
   * from the one measurement of it (cawco/visible-viewport); app.css places
   * a bottom sheet the kit marks `data-placed` on the visible area from the
   * two. They reach the sheet through its `style` prop: a property written
   * on the node is lost whenever that attribute is redrawn.
   */
  const place = $derived(
    !hosted && visible.height > 0
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
      "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-ink-strong text-label before:absolute before:inset-2 before:-z-10 before:rounded-[var(--radius-lg)] before:border before:border-border before:bg-[var(--surface-raised)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:phone:max-w-96 data-[vaul-drawer-direction=right]:phone:max-w-96 data-[vaul-drawer-direction=bottom]:pb-[calc(1rem+var(--safe-bottom))] data-[vaul-drawer-direction=bottom]:before:inset-x-0 data-[vaul-drawer-direction=bottom]:before:bottom-0 data-[vaul-drawer-direction=bottom]:before:rounded-b-none data-[vaul-drawer-direction=bottom]:before:border-x-0 data-[vaul-drawer-direction=bottom]:before:border-b-0",
      drawerContentVariants({ pad, height, look }),
      className
    )}
    data-placed={hosted ? undefined : ""}
    data-safe-bottom
    data-slot="drawer-content"
    style={`${place}${style ?? ""}`}
    bind:ref
    {...restProps}
  >
    <div
      class="mx-auto mt-4 mb-3 hidden h-1.5 w-[100px] shrink-0 rounded-[var(--radius-pill)] bg-neutral-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
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
