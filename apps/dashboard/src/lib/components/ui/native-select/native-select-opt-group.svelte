<script lang="ts">
  import type { HTMLOptgroupAttributes } from "svelte/elements";
  import type { WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    children,
    ...restProps
  }: WithElementRef<HTMLOptgroupAttributes> = $props();
</script>

<optgroup data-slot="native-select-opt-group" bind:this={ref} {...restProps}>
  {@render children?.()}
</optgroup>
