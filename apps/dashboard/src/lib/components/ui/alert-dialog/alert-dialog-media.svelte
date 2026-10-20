<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  class={cn(
    "mb-2 inline-flex size-16 items-center justify-center rounded-[var(--radius-pill)] bg-neutral-2 phone:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-space-8",
    className
  )}
  data-slot="alert-dialog-media"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
