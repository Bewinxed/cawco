<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a root that draws no well of its own (no
      background, as `background: none` writes it, and no padding), the
      host's surface showing through.
      `strip="session"`, a pane's session tabs (PaneTabs): a row standing
      its tabs on its floor, on the shelf (`surface-shelf`, two steps below
      the transcript, one below an unchosen tab, so the chosen tab, in the
      transcript's own surface, reads as the page it opens), padded in to the
      transcript's start edge, with the size ladder its track and the "+"
      after it share: a tab's height, its inner pad and its flared foot's
      room. Its tab controls' touch areas reach past the row's foot, so on a
      coarse pointer the row stacks above the transcript beneath it. In a
      narrow leaf it pads in less; on a phone it is the app's only bar: the
      bar's height, its two ends left to the sidebar toggle and Caw's glass.
      `strip="hosted"`, the same tabs in a host's row: the same ladder, filling
      the host's row and drawing nothing of its own. */
  export const tabsVariants = tv({
    variants: {
      fill: { none: "background-none p-0" },
      strip: {
        session:
          "coarse:relative coarse:z-1 flex min-w-0 flex-none items-end bg-surface-shelf desk:@max-leaf/leaf:ps-space-4 ps-space-7 pe-space-4 pt-space-1 pb-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)] max-desk:min-h-c-top-bar-h max-desk:ps-[calc(var(--c-bar-phone-edge)_+_var(--c-bar-toggle-glyph))] max-desk:pe-[calc(var(--c-bar-phone-gap)_+_var(--c-bar-caw-glass-phone))] max-desk:pt-0 max-desk:[--strip-flare:var(--radius-lg)] max-desk:[--strip-item:var(--c-tab-row-h)]",
        hosted:
          "coarse:relative coarse:z-1 flex min-w-0 flex-[1_1_0] items-end self-stretch bg-transparent p-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)]",
        work: "",
      },
    },
  });

  export type TabsLooks = VariantProps<typeof tabsVariants>;
</script>

<script lang="ts">
  /**
   * Fluid Functionalism's Tabs, the root: a segmented control with a sliding
   * active indicator, the kit hover ghost and a weight that animates. Controlled
   * by `value` or `selectedIndex`, uncontrolled by `defaultValue`; without
   * either, the first item is chosen so the indicator has somewhere to be
   * from the first paint.
   */
  import { type Snippet, untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";
  import {
    provideTabs,
    type TabsSize,
    TabsState,
    type TabsTravel,
    type TabsVariant,
  } from "./context.svelte";
  import type { FoldMeasure } from "./fold-memory";

  let {
    value,
    onValueChange,
    selectedIndex,
    onSelect,
    defaultValue,
    size = "default",
    variant = "segmented",
    travel = null,
    values,
    boxes,
    fill,
    strip,
    class: className,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "onselect"> &
    TabsLooks & {
      value?: string;
      /**
       * The items' values in the order they stand, when the host knows them:
       * the chosen item and a folder track's stack are drawn from the first
       * render, the server's included, before the track has measured its
       * items. The track's own order replaces it once it has.
       */
      values?: readonly string[];
      /**
       * Each folder tab's shape as last measured, by value (fold-memory.ts,
       * from its cookie): the server draws each tab to it, true from the
       * first paint.
       */
      boxes?: Readonly<Record<string, FoldMeasure>>;
      onValueChange?: (value: string) => void;
      selectedIndex?: number;
      onSelect?: (index: number) => void;
      defaultValue?: string;
      /** One step of the size ladder: 36px outer by default, 28px compact. */
      size?: TabsSize;
      /** A segmented control in a well (default), or folder tabs on a shelf. */
      variant?: TabsVariant;
      /**
       * The indicator part-way from the chosen item toward another — a swipe
       * between panels, say — so it follows the hand and lands with the value
       * rather than jumping after it. Null at rest.
       */
      travel?: TabsTravel | null;
      children: Snippet;
    } = $props();

  // defaultValue is read once, the starting tab.
  const state = new TabsState(untrack(() => defaultValue));
  const sync = () => {
    state.controlled = value;
    state.selectedIndex = selectedIndex;
    state.size = size;
    state.variant = variant;
    state.strip = strip;
    state.boxes = boxes ?? {};
    state.travel = travel;
    state.onValueChange = onValueChange;
    state.onSelect = onSelect;
    // The host's order when it changes, never in answer to the track's own.
    const order = values ? [...values] : null;
    if (order) {
      untrack(() => state.setOrder(order));
    }
  };
  // Once now, so the first render (the server's, where no effect runs)
  // draws the chosen item; then before every update after.
  sync();
  $effect.pre(sync);
  provideTabs(state);
</script>

<div
  class={cn(tabsVariants({ fill, strip }), className)}
  data-size={size}
  data-slot="tabs"
  data-variant={variant}
  {...rest}
>
  {@render children()}
</div>
