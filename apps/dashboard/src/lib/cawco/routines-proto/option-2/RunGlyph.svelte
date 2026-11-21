<script lang="ts" module>
  import type { Ending } from "./day";

  /** What a mark draws: how a run ended, or a run still to come. */
  export type Mark = Ending | "coming" | "wontRun";
</script>

<script lang="ts">
  /**
   * How a run ended, as a glyph on a 20px box with a 1.75px stroke, in the
   * house's state glyphs' grammar (LinkStateGlyph): a disc with a check cut
   * out for what delivered or was met, a disc with a cross cut out for a
   * failure, a disc with an exclamation for a look that could not check, a
   * live disc that breathes while it runs, a dotted ring for not yet, a
   * plain ring for nothing to report, a struck ring for a skip; a hollow
   * ring for a run to come, struck where it won't happen. The word is said
   * by what stands beside it, so it is hidden from a screen reader.
   */
  let { mark, size = "md" }: { mark: Mark; size?: "sm" | "md" } = $props();

  const TONE: Record<Mark, string> = {
    delivered: "text-status-done-glyph",
    met: "text-status-done-glyph",
    failed: "text-status-fail-glyph",
    couldNotCheck: "text-status-fail-glyph",
    running:
      "text-status-live-glyph breathe loops [animation-delay:var(--loop-at)]",
    notYet: "text-ink-subtle",
    nothing: "text-ink-subtle",
    skipped: "text-ink-subtle",
    coming: "text-ink-muted",
    wontRun: "text-ink-subtle",
  };
</script>

<svg
  aria-hidden="true"
  class={[
    "flex-none",
    size === "sm" ? "size-icon-sm" : "size-icon-md",
    TONE[mark],
  ]}
  data-mark={mark}
  fill="none"
  viewBox="0 0 20 20"
>
  {#if mark === "delivered" || mark === "met"}
    <path
      d="M1.9 10a8.1 8.1 0 1 0 16.2 0a8.1 8.1 0 1 0-16.2 0ZM5.728 10.972 8.128 13.372A.95 .95 0 0 0 9.485 13.358L14.285 8.358A.95 .95 0 0 0 12.915 7.042L8.787 11.342 7.072 9.628A.95 .95 0 0 0 5.728 10.972Z"
      fill="currentColor"
      fill-rule="evenodd"
    />
  {:else if mark === "failed"}
    <path
      d="M1.9 10a8.1 8.1 0 1 0 16.2 0a8.1 8.1 0 1 0-16.2 0ZM6.72 7.95 8.77 10 6.72 12.05A.87 .87 0 0 0 7.95 13.28L10 11.23 12.05 13.28A.87 .87 0 0 0 13.28 12.05L11.23 10 13.28 7.95A.87 .87 0 0 0 12.05 6.72L10 8.77 7.95 6.72A.87 .87 0 0 0 6.72 7.95Z"
      fill="currentColor"
      fill-rule="evenodd"
    />
  {:else if mark === "couldNotCheck"}
    <path
      d="M1.9 10a8.1 8.1 0 1 0 16.2 0a8.1 8.1 0 1 0-16.2 0ZM9.1 5.9v4.9a.9 .9 0 0 0 1.8 0V5.9a.9 .9 0 0 0-1.8 0ZM8.95 13.85a1.05 1.05 0 1 0 2.1 0a1.05 1.05 0 1 0-2.1 0Z"
      fill="currentColor"
      fill-rule="evenodd"
    />
  {:else if mark === "running"}
    <circle cx="10" cy="10" fill="currentColor" r="5" />
    <circle
      cx="10"
      cy="10"
      r="7.75"
      stroke="currentColor"
      stroke-opacity="0.4"
      stroke-width="1.5"
    />
  {:else if mark === "notYet"}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-dasharray="0.1 3.6"
      stroke-linecap="round"
      stroke-width="2"
    />
  {:else if mark === "skipped" || mark === "wontRun"}
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
  {:else}
    <circle
      cx="10"
      cy="10"
      r="7.25"
      stroke="currentColor"
      stroke-width="1.75"
    />
  {/if}
</svg>
