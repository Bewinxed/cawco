<script lang="ts">
  /**
   * One line of something to paste elsewhere — the install command, the hub's
   * SSH key — in a code box with a Copy button. The single command box every
   * join surface uses (the dialog's Command tab, the machines popover's
   * pairing panel, the SSH key disclosure), so the command reads and copies
   * the same wherever it is offered.
   *
   * The line truncates to fit; what is copied is always the whole of it, and
   * the whole of it is the box's title.
   */
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import Documents from "~icons/solar/documents-bold-duotone";

  let { text, label }: { text: string; label: string } = $props();

  const clipboard = new UseClipboard();
  const said = $derived.by(() => {
    if (clipboard.status === "success") {
      return "Copied";
    }
    return clipboard.status === "failure" ? "Copy failed" : "Copy";
  });
</script>

<div class="box">
  <span class="sr-only">{label}:</span>
  <code title={text}>{text}</code>
  <button
    class="copy pressable touch-hit"
    onclick={() => clipboard.copy(text)}
    type="button"
  >
    <Documents aria-hidden="true" />
    <span aria-live="polite">{said}</span>
  </button>
</div>

<style>
  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 36px;
    padding: 0 5px 0 10px;
    background: var(--surface-hover);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
  }
  code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: var(--text-meta);
    line-height: 1.4;
    color: var(--ink-strong);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .copy {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    white-space: nowrap;
    cursor: pointer;
    transition: var(--transition-control);
  }
  .copy :global(svg) {
    width: 13px;
    height: 13px;
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .copy:hover {
      background: var(--surface-hover);
    }
  }
</style>
