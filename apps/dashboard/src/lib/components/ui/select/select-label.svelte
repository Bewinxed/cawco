<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {} = $props();
</script>

<div
  class={cn("px-3 py-2.5 text-meta text-muted-foreground", className)}
  data-slot="select-label"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
