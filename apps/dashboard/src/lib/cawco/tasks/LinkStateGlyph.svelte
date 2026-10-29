<script lang="ts" module>
  import type { ExternalState } from "@cawco/core/external-items";

  /** What a link's glyph draws: the source's state once read, else why it has none. */
  export type LinkGlyph = ExternalState | "failed" | "pending";
</script>

<script lang="ts">
  /**
   * A linked item's state as a glyph, drawn for CawCo on a 20px box with a
   * 1.75px stroke (design 03-requirements, State glyphs): a ring for open, a
   * dashed ring for a draft, a filled disc with the check cut out for
   * finished work (merged in the done tint, closed in muted ink: the
   * source's word tells them apart), a struck ring for canceled, a ring
   * with an exclamation for a read that failed, and a dotted ring that
   * breathes for one not read yet. None is traced from a source's own icon.
   * Its name is the state's word, said by the row beside it, so it is
   * hidden from a screen reader.
   */
  let { glyph }: { glyph: LinkGlyph } = $props();

  const TONE: Record<LinkGlyph, string> = {
    open: "text-status-live-glyph",
    draft: "text-status-idle-glyph",
    merged: "text-status-done-glyph",
    closed: "text-ink-muted",
    canceled: "text-ink-subtle",
    failed: "text-status-fail-glyph",
    pending: "text-ink-subtle motion-safe:animate-breath",
  };
</script>

<svg
  aria-hidden="true"
  class="size-icon-lg flex-none {TONE[glyph]}"
  data-glyph={glyph}
  fill="none"
  viewBox="0 0 20 20"
>
  {#if glyph === "open"}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-width="1.75"
    />
  {:else if glyph === "draft"}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-dasharray="3.2 2.5"
      stroke-width="1.75"
    />
  {:else if glyph === "merged" || glyph === "closed"}
    <!-- A disc with the check cut out (even-odd): the row's own surface shows through it, hovered or not. -->
    <path
      d="M1.9 10a8.1 8.1 0 1 0 16.2 0a8.1 8.1 0 1 0-16.2 0ZM5.728 10.972 8.128 13.372A.95 .95 0 0 0 9.485 13.358L14.285 8.358A.95 .95 0 0 0 12.915 7.042L8.787 11.342 7.072 9.628A.95 .95 0 0 0 5.728 10.972Z"
      fill="currentColor"
      fill-rule="evenodd"
    />
  {:else if glyph === "canceled"}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-width="1.75"
    />
    <path
      d="M5.1 14.9 14.9 5.1"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.75"
    />
  {:else if glyph === "failed"}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-width="1.75"
    />
    <path
      d="M10 6.3v4.4"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-width="1.9"
    />
    <circle cx="10" cy="13.5" fill="currentColor" r="1.1" />
  {:else}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-dasharray="0.01 3.8"
      stroke-linecap="round"
      stroke-width="1.75"
    />
  {/if}
</svg>
