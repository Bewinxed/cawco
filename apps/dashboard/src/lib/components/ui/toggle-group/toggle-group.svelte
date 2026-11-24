<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import {
    segmentedLens,
    segmentedVariants,
  } from "#lib/components/ui/segmented/index.js";
  import { cn } from "#lib/utils.js";

  const { group, lens: lensLook } = segmentedVariants();

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    fill = false,
    children,
    ...restProps
  }: ToggleGroupPrimitive.RootProps & {
    /**
     * The track runs its row's width, its segments sharing the room (each
     * site's segments grow); else it is as wide as its segments.
     */
    fill?: boolean;
  } = $props();

  let lens = $state<HTMLSpanElement>();
  $effect(() => {
    if (ref && lens) {
      return segmentedLens(ref, lens, {
        picked: '[data-slot="toggle-group-item"][data-state="on"]',
        segments:
          '[data-slot="toggle-group-item"]:not(:disabled, [inert], [data-disabled])',
      });
    }
  });
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
One track, one row: it never wraps, its track holds every segment (as wide
as they are), and a group wider than its row stands in its caller's
scroller. Its pick stays picked under a press (segmentedLens: bits-ui
would clear it, and the lens with it).
-->
<ToggleGroupPrimitive.Root
  class={cn(group(), fill ? "flex w-full" : "w-max", className)}
  data-slot="toggle-group"
  bind:ref
  bind:value={value as never}
  {...restProps}
>
  <span aria-hidden="true" class={lensLook()} bind:this={lens}></span>
  {@render children?.()}
</ToggleGroupPrimitive.Root>
