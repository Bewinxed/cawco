<script lang="ts">
  /**
   * The preview's mode as one button, where the head has no room for its
   * three segments (head.ts, the mode's one-button form): the chosen mode's
   * glyph in a glass of its own, opening the three as a menu hung from that
   * glass (BarMenu).
   */
  import type { Component, Snippet } from "svelte";
  import { BarGlass, BarMenu } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

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
        <Tip {keys} label={`Mode: ${word}`}>
          {#snippet children(tip)}
            <button
              {...tip}
              {...props}
              aria-label={`Mode: ${word}`}
              class="select-none touch-hit press-tint"
              data-bar-item
              data-box
              type="button"
            >
              <Glyph aria-hidden="true" data-slot="bar-symbol" />
            </button>
          {/snippet}
        </Tip>
      {/snippet}
    </DropdownMenu.Trigger>
    <BarMenu label="Mode" width="compact">
      {@render menu()}
    </BarMenu>
  </DropdownMenu.Root>
</BarGlass>
