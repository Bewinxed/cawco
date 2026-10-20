<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  export const drawerContentVariants = tv({
    variants: {
      /** Its foot: none at all, a bottom sheet's safe-area foot included (its
          content keeps the safe area clear itself); a sheet with a footer of
          its own height (`--sheet-foot`) and no other padding; or the safe
          area alone, on every sheet or a bottom sheet only. */
      pad: {
        none: "p-0 vaul-drawer-direction-bottom:pb-0",
        "sheet-foot":
          "p-0 pb-(--sheet-foot) vaul-drawer-direction-bottom:pb-(--sheet-foot)",
        "safe-bottom":
          "pb-(--safe-bottom) vaul-drawer-direction-bottom:pb-(--safe-bottom)",
        "sheet-safe-bottom": "vaul-drawer-direction-bottom:pb-(--safe-bottom)",
      },
      /** A sheet in a column that may shrink below its content; or a bottom
          sheet that stands at its cap from the first frame (its own
          --drawer-max-height, else the recipe's 85vh), whatever it holds, so
          vaul's stops, shares of the screen's height, each hold one height
          (Files, Caw's sheet, the peek on a touch screen). The placed sheet's
          max-height keeps it inside the visible area (app.css). */
      height: {
        shrink: "min-h-0",
        cap: "vaul-drawer-direction-bottom:h-[var(--drawer-max-height,var(--c-sheet-max-h))]",
      },
      /** The new-session card: the dialog's theme, no outline or margin,
          and under reduced motion none of vaul's settling transform (its
          fade is the base's). `!`: vaul writes that transition inline
          (use-drawer-root.svelte.js), which only an important
          declaration outranks;
          https://tailwindcss.com/docs/styling-with-utility-classes#using-the-important-modifier */
      look: {
        "new-session":
          "ns-theme m-0 outline-off motion-reduce:transition-none!",
      },
    },
  });

  export type DrawerContentLooks = VariantProps<typeof drawerContentVariants>;
</script>

<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { mirror } from "#lib/cawco/page-marks.js";
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
       * It fills the host whole and draws no surface or grabber of its own
       * (the host draws both); closed, it is not seen.
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
   * What the sheet is, said for the page around it (page-marks): a bottom
   * sheet the kit places on the screen's foot is the bottom edge
   * (ScreenEdges), and while one closes the body takes presses again
   * (app.css).
   */
  $effect(() => {
    const node = ref;
    if (!node) {
      return;
    }
    const foot = mirror(
      node,
      "root",
      "data-kit-sheet",
      ["data-placed", "data-vaul-drawer-direction"],
      (sheet) =>
        sheet.hasAttribute("data-placed") &&
        sheet.dataset.vaulDrawerDirection === "bottom"
          ? ["bottom"]
          : []
    );
    const closing = mirror(
      node,
      "body",
      "data-drawer",
      ["data-state"],
      (sheet) => (sheet.dataset.state === "closed" ? ["closed"] : [])
    );
    return () => {
      foot();
      closing();
    };
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
       Its foot keeps the safe area clear, the same for every sheet. Under
       reduced motion it fades in and out over --dur-control instead of
       sliding (DESIGN.md, Sheet: "with reduced motion it fades over
       120ms"); vaul's slide stands in the `vendor` layer under it
       (vite.config.ts, vendorComponentSheets). -->
  <DrawerPrimitive.Content
    class={cn(
      "motion-reduce:sheet-fade group/drawer-content fixed z-(--layer-float) flex h-auto flex-col bg-transparent p-4 text-ink-strong text-label before:absolute before:inset-2 before:-z-1 before:rounded-[var(--radius-lg)] before:border before:border-border before:bg-[var(--surface-raised)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:phone:max-w-96 data-[vaul-drawer-direction=right]:phone:max-w-96 data-[vaul-drawer-direction=bottom]:pb-[calc(1rem+var(--safe-bottom))] data-[vaul-drawer-direction=bottom]:before:inset-x-0 data-[vaul-drawer-direction=bottom]:before:bottom-0 data-[vaul-drawer-direction=bottom]:before:rounded-b-none data-[vaul-drawer-direction=bottom]:before:border-x-0 data-[vaul-drawer-direction=bottom]:before:border-b-0",
      drawerContentVariants({ pad, height, look }),
      hosted &&
        "absolute inset-0 z-1 m-0 h-full max-h-none w-full p-0 outline-off before:hidden data-closed:invisible data-[vaul-drawer-direction=bottom]:pb-0",
      className
    )}
    data-placed={hosted ? undefined : ""}
    data-safe-bottom
    data-slot="drawer-content"
    style={`${place}${style ?? ""}`}
    bind:ref
    {...restProps}
  >
    {#if !hosted}
      <div
        class="mx-auto mt-4 mb-3 hidden h-1.5 w-[100px] shrink-0 rounded-[var(--radius-pill)] bg-neutral-2 group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
      ></div>
    {/if}
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
