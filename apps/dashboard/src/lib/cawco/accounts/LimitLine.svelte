<script lang="ts">
  /**
   * A picker row's limit line, under its name: what CawCo last read of the
   * limit the pick would meet and how old that reading is, or what asking
   * again found, its hourglass the status glyph (DESIGN.md: status reads by
   * glyph, then word, then hue); or, while a pick on the row asks the
   * provider again, the live dot and who is asked. It wraps rather than cut
   * the reading's age off. The words are the caller's (core
   * words/limit-picks).
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconHourglass } from "#lib/icons.js";

  let {
    words,
    checking = false,
  }: {
    words: string;
    /** The provider is being asked now. */
    checking?: boolean;
  } = $props();
</script>

<span
  data-slot="limit"
  class="mark-line flex min-w-0 items-start gap-space-1 type-meta text-ink-muted"
  data-box
  role={checking ? "status" : undefined}
>
  <span class="mark-cell" data-box>
    {#if checking}
      <span class="grid size-icon-sm place-items-center" data-box
        ><LiveDot size="row" /></span
      >
    {:else}
      <IconHourglass
        aria-hidden="true"
        class="size-icon-sm text-status-attn-glyph"
      />
    {/if}
  </span>
  <span class="min-w-0 text-pretty">{words}</span>
</span>
