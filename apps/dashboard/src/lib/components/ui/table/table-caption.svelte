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

<caption
  class={cn("mt-4 text-label text-muted-foreground", className)}
  data-slot="table-caption"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</caption>
