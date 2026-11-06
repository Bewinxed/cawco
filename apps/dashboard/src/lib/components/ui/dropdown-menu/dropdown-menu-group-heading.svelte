<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    ...restProps
  }: ComponentProps<typeof DropdownMenuPrimitive.GroupHeading> & {
    inset?: boolean;
  } = $props();
</script>

<!-- A group's heading, never read as one of its options: the meta role in
     muted ink (as the menu's Label), its words on the items' own inset
     (`px-2.5`, the item's), so it stands over them and not among them (HIG,
     Menus: a section's title is set apart from its items). -->
<DropdownMenuPrimitive.GroupHeading
  class={cn(
    "px-2.5 pt-space-2 pb-space-1 text-ink-muted type-meta data-[inset]:ps-space-8",
    className
  )}
  data-inset={inset}
  data-slot="dropdown-menu-group-heading"
  bind:ref
  {...restProps}
/>
