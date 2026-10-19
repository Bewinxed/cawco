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

<!-- literal: 8px -->
<!-- literal: 5px -->
<!-- literal: 10px -->
<!-- literal: 1 1 20ch (the command's room for 20 characters a line) -->
<div
  class="flex h-c-btn-h min-w-0 items-center gap-(--gap) rounded-md border border-border-control bg-surface-hover pr-(--pad-end) pl-(--pad-start) data-wrap:h-auto data-wrap:min-h-c-btn-h data-wrap:flex-wrap data-wrap:gap-y-space-1 data-wrap:py-space-1"
  data-wrap={wrap || undefined}
  style:--gap="8px"
  style:--pad-end="5px"
  style:--pad-start="10px"
  style:--wrap-flex="1 1 20ch"
>
  <span class="sr-only">{label}:</span>
  <!-- literal: 1.4 -->
  {#if wrap}
    <!-- Read whole: a word breaks between words, never inside one, unless
         it alone is wider than the line. -->
    <code
      class="min-w-0 flex-(--wrap-flex) overflow-hidden text-size-meta leading-(--lh) text-ellipsis whitespace-normal text-ink-strong"
      style:--lh="1.4"
      title={text}
      >{#each words as word, index (index)}{#if index > 0}{" "}{/if}<span
          class="inline-block max-w-full wrap-anywhere">{word}</span
        >{/each}</code
    >
  {:else}
    <code
      class="min-w-0 flex-1 truncate text-size-meta leading-(--lh) text-ink-strong"
      style:--lh="1.4"
      title={text}>{text}</code
    >
  {/if}
  <!-- literal: 5px -->
  <!-- literal: 26px -->
  <!-- literal: 8px -->
  <!-- literal: 13px -->
  <button
    class="pressable touch-hit inline-flex h-(--h) flex-none cursor-pointer items-center gap-(--gap) rounded-sm border border-border-control bg-surface-raised px-(--pad) type-label whitespace-nowrap text-ink-strong transition-control hover-hover:[&:hover]:bg-surface-hover in-data-wrap:ms-auto"
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
