<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import { segmentedVariants } from "#lib/components/ui/tabs/thumb.js";
  import { cn } from "#lib/utils.js";

  const { segment } = segmentedVariants();

  let {
    ref = $bindable(null),
    value = $bindable(),
    fit = false,
    class: className,
    children,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps & {
    /**
     * The segment gives up its side room before its row scrolls: its
     * `c-segment-pad-x` each side is a grid track that grows to it and
     * counts nothing toward the segment's least width, its words between at
     * their own width (each track holds an empty cell, so the words, bare
     * text the mark line leaves as it was, fall in the middle one). A group
     * a little wider than its row fits whole; only a row narrower than the
     * words alone leaves the group to its caller's scroller. Words only.
     */
    fit?: boolean;
  } = $props();

  type Said = Parameters<
    NonNullable<ToggleGroupPrimitive.ItemProps["children"]>
  >[0];
</script>

{#snippet fitted(said: Said)}
  <span aria-hidden="true" data-box></span>
  {@render children?.(said)}
  <span aria-hidden="true" data-box></span>
{/snippet}

<ToggleGroupPrimitive.Item
  class={cn(
    segment(),
    "press-tint focus-inset touch-hit shrink-0 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    fit &&
      "grid shrink grid-cols-[minmax(0,var(--c-segment-pad-x))_max-content_minmax(0,var(--c-segment-pad-x))] gap-0 px-0",
    className
  )}
  children={fit ? fitted : children}
  data-slot="toggle-group-item"
  {value}
  bind:ref
  {...restProps}
/>
