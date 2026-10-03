<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant = "legend",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLLegendElement>> & {
    variant?: "legend" | "label";
  } = $props();
</script>

<legend
  class={cn(
    "mb-3 font-medium data-[variant=label]:text-label data-[variant=legend]:text-label",
    className
  )}
  data-slot="field-legend"
  data-variant={variant}
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</legend>
