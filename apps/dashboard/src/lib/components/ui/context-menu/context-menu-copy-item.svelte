<script lang="ts">
  /**
   * A menu item that copies. The copy goes through cawco/copy.ts, whose
   * toast says what was copied; on success the item's icon cross-fades to a
   * check over --dur-control and holds it for --dur-hold, and only then does
   * the menu close, so the check shows on the item that did it. The first
   * select keeps the menu open (preventDefault); closing is a second select
   * of the same item, which bits-ui handles as any other: it closes the menu
   * and returns focus. A copy the browser refused keeps the menu open and
   * says so under the item (RowFault, cawco/copy.ts `copyRefused`), with Try
   * again and the text under Show details to copy by hand; never a toast.
   * It is kept (cawco/refusals.svelte.ts): the same item says it again
   * whenever its menu opens, after a reload too, until a copy goes.
   */
  import type { Snippet } from "svelte";
  import { copyRefused, copyToClipboard } from "#lib/cawco/copy.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { refusals } from "#lib/cawco/refusals.svelte.js";
  import { IconCheck, IconCopy } from "#lib/icons.js";
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
  /** Where a refused copy of this text is said: under this item, kept. */
  const key = $derived(`copy:item:${what}:${text}`);
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
    await copy();
  }

  async function copy() {
    const at = key;
    copied = await copyToClipboard(what, text);
    if (copied) {
      refusals.delete(at);
      timer = setTimeout(close, dur("--dur-hold"));
    } else {
      refusals.set(at, { reason: copyRefused(what) });
    }
  }
</script>

<ContextMenuItem {disabled} onSelect={select} bind:ref>
  <span class="icon-swap" style="--icon-swap-dur: var(--dur-control)">
    <span data-active={!copied}><IconCopy /></span>
    <span data-active={copied}><IconCheck /></span>
  </span>
  <span class="mark-text">{@render children()}</span>
</ContextMenuItem>
<RowFault
  again={copy}
  data-copy-refused
  details={text}
  end="var(--space-2)"
  indent="var(--space-2)"
  reason={refusals.reason(key)}
/>
