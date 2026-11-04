<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: SelectPrimitive.GroupHeadingProps = $props();
</script>

<!-- A group's name in the list, as the menus' group heading draws it
     (dropdown-menu-group-heading), muted under the items' ink. -->
<SelectPrimitive.GroupHeading
  class={cn("px-2.5 pt-space-2 pb-space-1 type-meta text-ink-muted", className)}
  data-slot="select-group-heading"
  bind:ref
  {...restProps}
/>
