<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  import { slideThumb } from "./thumb.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: TabsPrimitive.ListProps = $props();

  let thumb = $state<HTMLSpanElement>();
  $effect(() => {
    if (ref && thumb) {
      return slideThumb(
        ref,
        thumb,
        '[data-slot="tabs-trigger"][data-state="active"]'
      );
    }
  });
</script>

<TabsPrimitive.List
  class={cn("kit-segmented", className)}
  data-slot="tabs-list"
  bind:ref
  {...restProps}
>
  <span aria-hidden="true" class="kit-thumb" bind:this={thumb}></span>
  {@render children?.()}
</TabsPrimitive.List>
