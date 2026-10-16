<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
  class={cn(
    "pointer-events-none inline-flex h-icon-lg w-fit min-w-5",
    "select-none items-center justify-center gap-space-1 rounded-xs",
    "bg-[var(--surface-recess)]",
    "in-data-[slot=tooltip-content]:bg-[var(--on-brand)]/20 px-space-1",
    "font-body",
    "in-data-[slot=tooltip-content]:text-[var(--on-brand)]",
    "text-ink-muted text-meta",
    "dark:in-data-[slot=tooltip-content]:bg-surface-page/10",
    "[&_svg:not([class*='size-'])]:size-icon-sm",
    className
  )}
  data-slot="kbd"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</kbd>
