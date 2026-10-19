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
  import { Button } from "#lib/components/ui/button/index.js";
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

<div
  class="flex h-c-btn-h min-w-0 items-center gap-space-2 rounded-md border border-border-control bg-surface-hover pe-space-1 ps-space-3 data-wrap:h-auto data-wrap:min-h-c-btn-h data-wrap:flex-wrap data-wrap:gap-y-space-1 data-wrap:py-space-1"
  data-wrap={wrap || undefined}
>
  <span class="sr-only">{label}:</span>
  {#if wrap}
    <!-- Read whole: a word breaks between words, never inside one, unless
         it alone is wider than the line. -->
    <code
      class="min-w-0 grow basis-c-copy-box-line overflow-hidden text-meta text-ellipsis whitespace-normal text-ink-strong"
      title={text}
      >{#each words as word, index (index)}{#if index > 0}{" "}{/if}<span
          data-slot="word"
          class="inline-block max-w-full wrap-anywhere">{word}</span
        >{/each}</code
    >
  {:else}
    <code
      class="min-w-0 flex-1 truncate text-meta text-ink-strong"
      title={text}>{text}</code
    >
  {/if}
  <Button
    class="flex-none in-data-wrap:ms-auto"
    onclick={() => clipboard.copy(text)}
    press="pressable"
    size="xs"
    type="button"
    variant="outline"
  >
    <Documents aria-hidden="true" class="size-icon-sm text-ink-muted" />
    <span aria-live="polite">{said}</span>
  </Button>
</div>
