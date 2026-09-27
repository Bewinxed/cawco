<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
  class={cn("pointer-events-none inline-flex h-5 w-fit min-w-5", "select-none items-center justify-center gap-1 rounded-xs", "bg-[var(--surface-recess)]", "in-data-[slot=tooltip-content]:bg-[var(--on-brand)]/20 px-1", "font-medium font-sans", "in-data-[slot=tooltip-content]:text-[var(--on-brand)]", "text-meta text-muted-foreground", "dark:in-data-[slot=tooltip-content]:bg-background/10", "[&_svg:not([class*='size-'])]:size-3", className)}
  data-slot="kbd"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</kbd>
