<script lang="ts">
  /**
   * The kit's segmented tabs: bits-ui's tab list drawn as the segmented
   * track, its lens over the chosen tab (ui/segmented), the same control as
   * the single ToggleGroup. A tap on a tab picks it, a press on the chosen
   * one swells the lens and can drag it to another, and the arrow keys move
   * the choice (bits-ui's automatic activation).
   */
  import { Tabs as TabsPrimitive } from "bits-ui";
  import {
    segmentedLens,
    segmentedVariants,
  } from "#lib/components/ui/segmented/index.js";
  import { cn } from "#lib/utils.js";

  const { group, lens: lensLook } = segmentedVariants();

  let {
    ref = $bindable(null),
    class: className,
    fill = false,
    children,
    ...restProps
  }: TabsPrimitive.ListProps & {
    /** The track runs its row's width, its tabs sharing it evenly. */
    fill?: boolean;
  } = $props();

  let lens = $state<HTMLSpanElement>();
  $effect(() => {
    if (ref && lens) {
      return segmentedLens(ref, lens, {
        picked: '[data-slot="tabs-trigger"][data-state="active"]',
        segments: '[data-slot="tabs-trigger"]:not(:disabled, [data-disabled])',
      });
    }
  });
</script>

<TabsPrimitive.List
  class={cn(group(), fill ? "flex w-full" : "w-max", className)}
  data-fill={fill ? "" : undefined}
  data-slot="tabs-list"
  bind:ref
  {...restProps}
>
  <span aria-hidden="true" class={lensLook()} bind:this={lens}></span>
  {@render children?.()}
</TabsPrimitive.List>
