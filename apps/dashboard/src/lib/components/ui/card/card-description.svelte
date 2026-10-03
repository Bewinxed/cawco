<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
  class={cn("text-meta text-muted-foreground", className)}
  data-slot="card-description"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</p>
