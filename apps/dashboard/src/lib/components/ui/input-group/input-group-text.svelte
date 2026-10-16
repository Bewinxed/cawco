<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
  class={cn(
    "flex items-center gap-2 text-ink-muted text-label [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none",
    className
  )}
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</span>
