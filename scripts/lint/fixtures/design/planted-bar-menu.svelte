<!--
  Planted mistakes for house/no-detached-bar-menu (scripts/lint/fixtures/
  expected.txt): a menu drawn detached from an item of a bar's glass, inside
  the glass and from a glass item's Root; beside each, the connected shape
  the rule leaves alone, and a menu on no bar.
-->
<script lang="ts">
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the rule reads the kit's names as product code writes them (DropdownMenu.Content)
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
</script>

<BarGlass form="group">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>More</DropdownMenu.Trigger>
    <DropdownMenu.Content>Detached</DropdownMenu.Content>
  </DropdownMenu.Root>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>More</DropdownMenu.Trigger>
    <BarMenu label="More">Connected</BarMenu>
  </DropdownMenu.Root>
</BarGlass>
<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <BarItem label="Sort" {props} />
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>Detached</DropdownMenu.Content>
</DropdownMenu.Root>
<DropdownMenu.Root>
  <DropdownMenu.Trigger>On no bar</DropdownMenu.Trigger>
  <DropdownMenu.Content>Free</DropdownMenu.Content>
</DropdownMenu.Root>
