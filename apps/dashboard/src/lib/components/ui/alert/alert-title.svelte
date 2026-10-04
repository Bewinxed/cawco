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
    "font-medium [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [svg~&]:col-start-2",
    className
  )}
  data-slot="alert-title"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
