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
    "group/field-content flex flex-1 flex-col gap-1 leading-snug",
    className
  )}
  data-slot="field-content"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
