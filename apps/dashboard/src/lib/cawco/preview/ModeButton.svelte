<script lang="ts">
  /**
   * The preview's mode as one button, where the head has no room for its
   * three segments (head.ts, the mode's one-button form): the chosen mode's
   * glyph, an item of the head's trailing glass beside More (HIG, Toolbars,
   * Item groupings: on iPhone, "controls for tool selection and the More menu
   * grouped on the trailing edge"), opening the three as a menu hung from
   * that glass (BarMenu).
   */
  import type { Component, Snippet } from "svelte";
  import { BarItem, BarMenu } from "#lib/components/ui/bar-glass/index.js";
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

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <BarItem icon={Glyph} {keys} label={`Mode: ${word}`} {props} />
    {/snippet}
  </DropdownMenu.Trigger>
  <BarMenu label="Mode" width="compact">
    {@render menu()}
  </BarMenu>
</DropdownMenu.Root>
