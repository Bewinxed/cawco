<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.SubContentProps = $props();

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({ rows: ".kit-item", hovered: "[data-highlighted]" })(
        ref
      );
    }
  });
</script>

<DropdownMenuPrimitive.SubContent
  class={cn(
    "kit-pop relative w-auto min-w-36 origin-(--bits-dropdown-menu-content-transform-origin)",
    className
  )}
  data-slot="dropdown-menu-sub-content"
  bind:ref
  {...restProps}
/>
