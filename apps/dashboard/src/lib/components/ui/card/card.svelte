<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = "default",
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    size?: "default" | "sm";
  } = $props();
</script>

<!-- A card inside a card is a section of it, not a second raised card
     (DESIGN.md, The Frame Recesses Rule: content never recesses or stacks;
     the stat tile's well is the one card-in-card): no fill, shadow or
     corner of its own, and its parts on the outer card's own inset. -->
<div
  class={cn(
    "group/card flex flex-col gap-(--card-spacing) in-data-[slot=card]:rounded-none rounded-lg bg-surface-raised in-data-[slot=card]:bg-transparent in-data-[slot=card]:py-0 py-(--card-spacing) text-body text-ink-strong in-data-[slot=card]:shadow-none shadow-tile [--card-spacing:18px] in-data-[slot=card]:*:px-0 data-[size=sm]:[--card-spacing:12px]",
    className
  )}
  data-size={size}
  data-slot="card"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
