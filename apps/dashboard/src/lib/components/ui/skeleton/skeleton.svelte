<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();
</script>

<!-- The one loading placeholder: the kit-skeleton recipe in app.css. The
     caller sizes it to exactly what it stands for, so the swap moves nothing. -->
<div
  class={cn("kit-skeleton", className)}
  data-slot="skeleton"
  bind:this={ref}
  {...restProps}
></div>
