<script lang="ts">
  /**
   * A state said glyph first, then word, then hue (DESIGN.md, The Glyph,
   * Word, Hue Rule): the glyph in its status ink, breathing while it stands
   * for live work, and its word beside it, or only in its accessible name
   * where the column it stands in already says it.
   */
  import { cn } from "#lib/utils.js";
  import type { Mark } from "./marks";

  let {
    mark,
    wordShown = true,
    size = "md",
  }: {
    mark: Mark;
    /** The word drawn beside the glyph; off, it is the glyph's name and tooltip. */
    wordShown?: boolean;
    size?: "sm" | "md";
  } = $props();

  const Glyph = $derived(mark.glyph);
</script>

<span
  class={cn(
    "mark-line inline-flex min-w-0 items-center gap-space-1 text-label",
    mark.tone === "live" && "text-status-live-ink",
    mark.tone === "attn" && "text-status-attn-ink",
    mark.tone === "done" && "text-status-done-ink",
    mark.tone === "fail" && "text-status-fail-ink",
    mark.tone === "muted" && "text-ink-muted"
  )}
  title={wordShown ? undefined : mark.word}
>
  <Glyph
    aria-hidden={wordShown ? "true" : undefined}
    aria-label={wordShown ? undefined : mark.word}
    class={cn(
      "flex-none",
      size === "sm" ? "size-icon-sm" : "size-icon-md",
      mark.live && "breathe loops",
      mark.tone === "live" && "text-status-live-glyph",
      mark.tone === "attn" && "text-status-attn-glyph",
      mark.tone === "done" && "text-status-done-glyph",
      mark.tone === "fail" && "text-status-fail-glyph"
    )}
    data-box
    role={wordShown ? undefined : "img"}
  />
  {#if wordShown}
    <span class="overflow-clip text-ellipsis whitespace-nowrap"
      >{mark.word}</span
    >
  {/if}
</span>
