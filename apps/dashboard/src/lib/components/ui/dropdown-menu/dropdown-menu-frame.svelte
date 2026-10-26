<script lang="ts">
  /**
   * The kit's DropdownMenu in a frame of its own (its states file's): open
   * under its trigger, drawn in place (the portal off) in a box that holds
   * it (`contain: layout`, so floating-ui places it in the frame), holding
   * its items, a checkbox item and a separator: the floating surface round
   * the menu item recipe (DESIGN.md, Popover, dropdown; Menu item).
   */
  import { buttonVariants } from "#lib/components/ui/button/index.js";
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
  class="relative min-h-(--frame-h) p-space-5 contain-layout"
  style:--frame-h={`${height}px`}
>
  <DropdownMenu.Root open>
    <DropdownMenu.Trigger class={buttonVariants({ variant: "outline" })}
      >Open</DropdownMenu.Trigger
    >
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
