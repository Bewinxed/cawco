<script lang="ts">
  /**
   * The kit's DropdownMenu in a frame of its own (its states file's): open
   * under its trigger, drawn in place (the portal off) in a box with room
   * for it, standing on its trigger as anywhere (anchored.svelte.ts), holding
   * its items, a checkbox item and a separator: the floating surface round
   * the menu item recipe (DESIGN.md, Popover, dropdown; Menu item).
   */
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

  let {
    items,
    checked,
    height,
  }: {
    /** The menu's items, each its words. */
    items: string[];
    /** A checkbox item's words, under a separator. */
    checked: string;
    /** The frame's least height, px: room for the menu under its trigger. */
    height: number;
  } = $props();

  let on = $state(true);
</script>

<div
  class="relative min-h-(--frame-h) p-space-4"
  style:--frame-h={`${height}px`}
>
  <DropdownMenu.Root open>
    <DropdownMenu.Trigger variant="outline">Open</DropdownMenu.Trigger>
    <DropdownMenu.Content
      forceMount
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      trapFocus={false}
      width="regular"
    >
      {#each items as item (item)}
        <DropdownMenu.Item>{item}</DropdownMenu.Item>
      {/each}
      <DropdownMenu.Separator />
      <DropdownMenu.CheckboxItem bind:checked={on}
        >{checked}</DropdownMenu.CheckboxItem
      >
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</div>
