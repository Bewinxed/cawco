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
  class={cn("absolute top-2.5 right-3", className)}
  data-slot="alert-action"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
