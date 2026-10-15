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
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "onselect"> & {
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

  // svelte-ignore state_referenced_locally — defaultValue is a one-time initial
  const state = new TabsState(defaultValue);
  const sync = () => {
    state.controlled = value;
    state.selectedIndex = selectedIndex;
    state.size = size;
    state.variant = variant;
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

<div data-size={size} data-slot="tabs" data-variant={variant} {...rest}>
  {@render children()}
</div>
