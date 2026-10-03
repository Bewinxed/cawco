<script lang="ts">
  import type { HTMLOptionAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLOptionAttributes> = $props();
</script>

<option
  class={cn("bg-[Canvas] text-[CanvasText]", className)}
  data-slot="native-select-option"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</option>
