<script lang="ts">
  /**
   * More in a glass of its own (BarGlass `form="group"`), its menu hung from
   * that glass as one shape with it (BarMenu), as a head's menus hang
   * (house/no-detached-bar-menu): a card's or a column's head that holds
   * no other glass (a block's, an editor's, a draft column's).
   */
  import type { Snippet } from "svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconMore } from "#lib/icons.js";
  import BarGlass from "./bar-glass.svelte";
  import BarItem from "./bar-item.svelte";
  import BarMenu from "./bar-menu.svelte";

  let {
    label,
    width = "regular",
    onOpenChange,
    children,
  }: {
    /** What it opens, read out: More for what it acts on. */
    label: string;
    /** The menu's width, the kit menu's. */
    width?: "compact" | "regular" | "wide" | "tiles";
    onOpenChange?: (open: boolean) => void;
    /** The menu's items. */
    children: Snippet;
  } = $props();
</script>

<BarGlass form="group">
  <DropdownMenu.Root {onOpenChange}>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <BarItem icon={IconMore} {label} {props} />
      {/snippet}
    </DropdownMenu.Trigger>
    <BarMenu {label} {width}>
      {@render children()}
    </BarMenu>
  </DropdownMenu.Root>
</BarGlass>
