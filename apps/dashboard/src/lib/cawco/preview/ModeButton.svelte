<script lang="ts">
  /**
   * The preview's mode as one button, where the tools over the drawing's
   * foot have no room for its three segments (a phone, a narrow card): the
   * chosen mode's glyph in a glass of its own, opening the three as a menu
   * above it, as a bottom toolbar's menus open (HIG, Toolbars).
   */
  import type { Component, Snippet } from "svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

  let {
    glyph: Glyph,
    word,
    keys,
    menu,
  }: {
    /** The chosen mode's glyph. */
    glyph: Component<Record<string, unknown>>;
    /** The chosen mode's name. */
    word: string;
    /** The modes' keys, as the tooltip draws them. */
    keys?: string;
    /** The three modes, as the menu's items. */
    menu: Snippet;
  } = $props();
</script>

<BarGlass form="group">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <BarItem icon={Glyph} {keys} label={`Mode: ${word}`} {props} />
      {/snippet}
    </DropdownMenu.Trigger>
    <BarMenu label="Mode" rises width="compact">
      {@render menu()}
    </BarMenu>
  </DropdownMenu.Root>
</BarGlass>
