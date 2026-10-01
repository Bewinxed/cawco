<script lang="ts">
  /**
   * A menu item that copies. The copy goes through cawco/copy.ts, whose
   * toast says what was copied; on success the item's icon cross-fades to a
   * check over --dur-control and holds it for --dur-hold, and only then does
   * the menu close, so the check shows on the item that did it. The first
   * select keeps the menu open (preventDefault); closing is a second select
   * of the same item, which bits-ui handles as any other: it closes the menu
   * and returns focus. A failed copy closes it at once, the toast saying why.
   */
  import type { Snippet } from "svelte";
  import { copyToClipboard } from "$lib/cawco/copy";
  import { dur } from "$lib/cawco/motion/curves.svelte";
  import { IconCheck, IconCopy } from "$lib/icons";
  import ContextMenuItem from "./context-menu-item.svelte";

  let {
    what,
    text,
    disabled = false,
    children,
  }: {
    /** What is copied, for the toast: "Session id". */
    what: string;
    text: string;
    disabled?: boolean;
    children: Snippet;
  } = $props();

  let ref = $state<HTMLElement | null>(null);
  let copied = $state(false);
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  function close() {
    closing = true;
    ref?.click();
  }

  async function select(event: Event) {
    if (closing) {
      return;
    }
    event.preventDefault();
    copied = await copyToClipboard(what, text);
    timer = setTimeout(close, copied ? dur("--dur-hold") : 0);
  }
</script>

<ContextMenuItem {disabled} onSelect={select} bind:ref>
  <span class="icon-swap" style="--icon-swap-dur: var(--dur-control)">
    <span data-active={!copied}><IconCopy /></span>
    <span data-active={copied}><IconCheck /></span>
  </span>
  {@render children()}
</ContextMenuItem>
