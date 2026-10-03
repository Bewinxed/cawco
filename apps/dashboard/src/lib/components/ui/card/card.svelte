<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    size = "default",
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    size?: "default" | "sm";
  } = $props();
</script>

<div
  class={cn(
    "group/card flex flex-col gap-(--card-spacing) rounded-lg bg-[var(--surface-raised)] py-(--card-spacing) text-body text-card-foreground shadow-[var(--shadow-tile)] [--card-spacing:18px] data-[size=sm]:[--card-spacing:12px]",
    className
  )}
  data-size={size}
  data-slot="card"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
