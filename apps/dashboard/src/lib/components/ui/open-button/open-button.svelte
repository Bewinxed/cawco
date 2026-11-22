<script lang="ts">
  /**
   * The one control that opens an item of a list: its row's trailing cell,
   * an edged 24px square holding the Maximize glyph, named "Open <its
   * name>" for a screen reader and in its tooltip. The row itself, its name
   * included, opens nothing: a press on words reads them (the owner's rule,
   * 2026-11-22: "an open icon like the regular design system pattern").
   * Edged at rest, so it reads as a control before any hover.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";

  let {
    name,
    label,
    onopen,
    href,
    current = false,
  }: {
    /** What it opens, as the row names it. */
    name: string;
    /** Its tooltip and accessible name; default "Open <name>". */
    label?: string;
    /** Opens it in place; with `href` too, a plain press stays here and a modified one follows the link. */
    onopen?: () => void;
    /** Its own address, where it has one. */
    href?: string;
    /** What it opens stands open now. */
    current?: boolean;
  } = $props();

  const said = $derived(label ?? `Open ${name}`);
  const look =
    "touch-hit focus-inset grid size-c-btn-h-xs flex-none place-items-center rounded-xs border border-border-row-outline bg-surface-raised p-0 text-ink-muted no-underline transition-tint-press not-data-current:hover:bg-surface-hover not-data-current:hover:text-ink-strong motion-safe:active:scale-(--press-scale) data-current:border-selected-ink data-current:bg-selected-bg data-current:text-selected-ink";

  function press(event: MouseEvent) {
    if (!onopen) {
      return;
    }
    if (href && (event.metaKey || event.ctrlKey || event.shiftKey)) {
      return;
    }
    event.preventDefault();
    onopen();
  }
</script>

<Tip label={said}>
  {#snippet children(tip)}
    {#if href}
      <a
        {...tip}
        data-box
        data-open-button
        data-current={current || undefined}
        aria-current={current || undefined}
        aria-label={said}
        class={look}
        {href}
        onclick={press}
        ><IconMaximize aria-hidden="true" class="size-icon-sm" /><span
          class="sr-only">{said}</span
        ></a
      >
    {:else}
      <button
        {...tip}
        data-box
        data-open-button
        data-current={current || undefined}
        aria-label={said}
        aria-pressed={current}
        class={look}
        onclick={press}
        type="button"
        ><IconMaximize aria-hidden="true" class="size-icon-sm" /></button
      >
    {/if}
  {/snippet}
</Tip>
