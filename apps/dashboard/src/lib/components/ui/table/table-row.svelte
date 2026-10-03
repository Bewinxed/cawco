<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
  class={cn("border-b transition-colors data-[state=selected]:bg-muted", className)}
  data-slot="table-row"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</tr>
