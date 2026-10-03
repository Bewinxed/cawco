<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: ContextMenuPrimitive.SubContentProps = $props();

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({ rows: ".kit-item", hovered: "[data-highlighted]" })(
        ref
      );
    }
  });
</script>

<ContextMenuPrimitive.SubContent
  class={cn("kit-pop relative min-w-32 origin-(--bits-context-menu-content-transform-origin)", className)}
  data-slot="context-menu-sub-content"
  bind:ref
  {...restProps}
/>
