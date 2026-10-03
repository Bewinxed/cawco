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
  class={cn("mt-auto flex flex-col gap-2 p-6", className)}
  data-slot="sheet-footer"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
