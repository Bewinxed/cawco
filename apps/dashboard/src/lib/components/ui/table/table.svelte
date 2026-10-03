<script lang="ts">
  import type { HTMLTableAttributes } from "svelte/elements";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ghostRows,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    /** The rows that are targets: one hover ghost glides between them. */
    ghostRows?: string;
  } = $props();
</script>

<div
  class="relative w-full overflow-x-auto"
  data-slot="table-container"
  {@attach ghostRows ? highlight({ rows: ghostRows }) : undefined}
>
  <table
    class={cn("w-full caption-bottom text-body", className)}
    data-slot="table"
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </table>
</div>
