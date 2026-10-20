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
  data-grid
  class={cn(
    "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center phone:group-data-[size=default]/alert-dialog-content:place-items-start phone:group-data-[size=default]/alert-dialog-content:text-left",
    className
  )}
  data-slot="alert-dialog-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
