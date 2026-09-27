<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CommandPrimitive.ListProps = $props();

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({ rows: ".kit-item", hovered: "[data-selected]" })(ref);
    }
  });
</script>

<CommandPrimitive.List
  class={cn("no-scrollbar max-h-72 scroll-py-1 overflow-y-auto overflow-x-hidden outline-none", className)}
  data-slot="command-list"
  bind:ref
  {...restProps}
/>
