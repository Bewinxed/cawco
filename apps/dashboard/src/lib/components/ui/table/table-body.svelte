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

<tbody
  class={cn("[&_tr:last-child]:border-0", className)}
  data-slot="table-body"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</tbody>
