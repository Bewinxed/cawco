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

<!-- literal: 8px -->
<!-- literal: 5px -->
<!-- literal: 10px -->
<div
  class="flex h-c-btn-h min-w-0 items-center gap-(--gap) rounded-md border border-border-control bg-surface-hover pr-(--pad-end) pl-(--pad-start)"
  style:--gap="8px"
  style:--pad-end="5px"
  style:--pad-start="10px"
>
  <span class="sr-only">{label}:</span>
  <!-- literal: 1.4 -->
  <code
    class="min-w-0 flex-1 truncate text-size-meta leading-(--lh) text-ink-strong"
    style:--lh="1.4"
    title={text}>{text}</code
  >
  <!-- literal: 5px -->
  <!-- literal: 26px -->
  <!-- literal: 8px -->
  <!-- literal: 13px -->
  <button
    class="pressable touch-hit inline-flex h-(--h) flex-none cursor-pointer items-center gap-(--gap) rounded-sm border border-border-control bg-surface-raised px-(--pad) type-label whitespace-nowrap text-ink-strong transition-control hover:bg-surface-hover"
    onclick={() => clipboard.copy(text)}
    style:--gap="5px"
    style:--glyph="13px"
    style:--h="26px"
    style:--hit-edge="1px"
    style:--pad="8px"
    type="button"
  >
    <Documents aria-hidden="true" class="size-(--glyph) text-ink-muted" />
    <span aria-live="polite">{said}</span>
  </button>
</div>
