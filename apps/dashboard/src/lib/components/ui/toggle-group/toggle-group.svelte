<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import {
    segmentedVariants,
    slideThumb,
  } from "#lib/components/ui/fluid-tabs/thumb.js";
  import { cn } from "#lib/utils.js";

  const { group, thumb: thumbLook } = segmentedVariants();

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    fill = false,
    children,
    ...restProps
  }: ToggleGroupPrimitive.RootProps & {
    /**
     * The groove runs its row's width, its segments sharing the room (each
     * site's segments grow); else it is as wide as its segments.
     */
    fill?: boolean;
  } = $props();

  let thumb = $state<HTMLSpanElement>();
  $effect(() => {
    if (ref && thumb) {
      return slideThumb(
        ref,
        thumb,
        '[data-slot="toggle-group-item"][data-state="on"]'
      );
    }
  });
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
One groove, one row (DESIGN.md, Segmented controls and tabs): it never
wraps, its groove holds every segment (as wide as they are), and a group
wider than its row stands in its caller's scroller.
-->
<ToggleGroupPrimitive.Root
  class={cn(group(), fill ? "flex w-full" : "w-max", className)}
  data-slot="toggle-group"
  bind:ref
  bind:value={value as never}
  {...restProps}
>
  <span aria-hidden="true" class={thumbLook()} bind:this={thumb}></span>
  {@render children?.()}
</ToggleGroupPrimitive.Root>
