<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<thead
  class={cn("[&_tr]:border-b", className)}
  data-slot="table-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</thead>
