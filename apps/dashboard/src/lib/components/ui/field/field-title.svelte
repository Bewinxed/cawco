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
  class={cn("flex w-fit items-center gap-2 font-medium text-label leading-snug leading-snug group-data-[disabled=true]/field:opacity-50", className)}
  data-slot="field-label"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
