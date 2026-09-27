<script lang="ts">
  /**
   * Fluid Functionalism's Tabs, the root: a segmented control with a sliding
   * active indicator, the kit hover ghost and a weight that animates. Controlled
   * by `value` or `selectedIndex`, uncontrolled by `defaultValue`; without
   * either, the first item is chosen so the indicator has somewhere to be
   * from the first paint.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import {
    provideTabs,
    type TabsSize,
    TabsState,
    type TabsTravel,
    type TabsVariant,
  } from "./context.svelte";

  let {
    value,
    onValueChange,
    selectedIndex,
    onSelect,
    defaultValue,
    size = "default",
    variant = "segmented",
    travel = null,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "onselect"> & {
    value?: string;
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
  // $effect.pre runs before the first paint and on every subsequent change,
  // so there is no need for a separate synchronous assignment.
  $effect.pre(() => {
    state.controlled = value;
    state.selectedIndex = selectedIndex;
    state.size = size;
    state.travel = travel;
    state.onValueChange = onValueChange;
    state.onSelect = onSelect;
  });
  provideTabs(state);
</script>

<div data-size={size} data-slot="tabs" data-variant={variant} {...rest}>
  {@render children()}
</div>
