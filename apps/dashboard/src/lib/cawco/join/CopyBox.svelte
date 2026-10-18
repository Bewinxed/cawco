<script lang="ts">
  /**
   * One line of something to paste elsewhere — the install command, the hub's
   * SSH key — in a code box with a Copy button. The single command box every
   * join surface uses (the dialog's Command tab, the machines popover's
   * pairing panel, the SSH key disclosure), so the command reads and copies
   * the same wherever it is offered.
   *
   * The line truncates to fit; what is copied is always the whole of it, and
   * the whole of it is the box's title. A command the person reads before
   * running it (`wrap`) wraps between its words instead, never inside one
   * (`--operator=name` stays whole), and the box grows; where the box is too
   * narrow for both, Copy stands under the command.
   */
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import Documents from "~icons/solar/documents-bold-duotone";

  let {
    text,
    label,
    wrap = false,
  }: { text: string; label: string; wrap?: boolean } = $props();

  /** The command's words, for `wrap`: each one breaks only where it alone is wider than the box. */
  const words = $derived(text.split(" "));

  const clipboard = new UseClipboard();
  const said = $derived.by(() => {
    if (clipboard.status === "success") {
      return "Copied";
    }
    return clipboard.status === "failure" ? "Copy failed" : "Copy";
  });
</script>

<div class="box" data-wrap={wrap || undefined}>
  <span class="sr-only">{label}:</span>
  {#if wrap}
    <code title={text}
      >{#each words as word, index (index)}{#if index > 0}{" "}{/if}<span
          class="word">{word}</span
        >{/each}</code
    >
  {:else}
    <code title={text}>{text}</code>
  {/if}
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
  /* Read whole: the box keeps its height for one line and grows for more,
     the Copy button centred on whatever it holds. The command keeps room
     for 20 characters a line (`--operator=` and a name, whole); narrower
     than that and Copy, Copy wraps under the command at the box's end. */
  .box[data-wrap] {
    flex-wrap: wrap;
    row-gap: var(--space-1);
    height: auto;
    min-height: var(--c-btn-h);
    padding-block: var(--space-1);
  }
  .box[data-wrap] code {
    flex: 1 1 20ch;
    white-space: normal;
  }
  .box[data-wrap] .copy {
    margin-inline-start: auto;
  }
  /* A word breaks between words, never inside one, unless it alone is
     wider than the line. */
  .word {
    display: inline-block;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
  }
  .copy {
    --hit-edge: 1px;
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
