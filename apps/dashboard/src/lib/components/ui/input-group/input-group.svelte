<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...props
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<div
  class={cn("relative flex h-9 w-full min-w-0 items-center rounded-md", "border border-[var(--border-control)]", "field-shell bg-[var(--surface-raised)] shadow-xs", "[transition:var(--transition-control)]","has-[>[data-align=block-end]]:h-auto", "has-[>[data-align=block-start]]:h-auto", "has-[>textarea]:h-auto", "has-[>[data-align=block-end]]:flex-col", "has-[>[data-align=block-start]]:flex-col", "has-[textarea]:rounded-[var(--radius-md)]", "has-data-[align=block-end]:rounded-[var(--radius-md)]", "has-data-[align=block-start]:rounded-[var(--radius-md)]", "has-[[data-slot][aria-invalid=true]]:border-destructive", "has-[>[data-align=block-end]]:[&>input]:pt-3", "has-[>[data-align=inline-end]]:[&>input]:pr-1.5", "has-[>[data-align=block-start]]:[&>input]:pb-3", "has-[>[data-align=inline-start]]:[&>input]:pl-1.5", className)}
  data-slot="input-group"
  role="group"
  bind:this={ref}
  {...props}
>
  {@render children?.()}
</div>
