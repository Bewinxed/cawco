<script lang="ts">
  /**
   * One numbered step of the work path: its head, then what it sets. The
   * head is the step's boundary, the house section head one level up
   * (ui/section-header `sectionHeadVariants`): its mark and title over a
   * rule the width of its column, in the border ink where the parts inside
   * keep the hairline, so a step ends where the next one's rule begins and
   * no box is drawn round it.
   *
   * The mark is the house step's ring (home/StepRow: its number in a
   * control-edged ring, the live dot while something runs); a step that is
   * offline or needs fixing wears the status glyph in its status ink on
   * that ring, the words in the heading's accessible name.
   */
  import type { Snippet } from "svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
  import type { StageId, StageState } from "./changes";

  let {
    n,
    title,
    state,
    stateWords,
    id,
    announcement = "",
    place = "",
    children,
  }: {
    /** 1-based position along the work path. */
    n: number;
    title: string;
    state: StageState;
    /** Spoken in the heading's accessible name when state is not settled. */
    stateWords?: string;
    id: StageId;
    /** Polite live-region text announcing state changes for this step. */
    announcement?: string;
    /** Where it stands on the view's grid (HowItRuns `PLACES`). */
    place?: string;
    children: Snippet;
  } = $props();

  const headingId = $derived(`how-it-runs-stage-${id}`);
</script>

<section
  aria-labelledby={headingId}
  class={["flex min-w-0 flex-col gap-space-4", place]}
  data-slot="stage"
  data-stage={id}
  data-state={state}
>
  <header
    class="mark-line flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2 border-b border-border pb-space-2"
  >
    <span
      aria-hidden="true"
      class="mark-line grid size-icon-md flex-none place-items-center"
      data-box
    >
      {#if state === "busy"}
        <LiveDot />
      {:else if state === "away"}
        <IconWarningTriangle class="size-icon-md text-status-attn-glyph" />
      {:else if state === "fault"}
        <IconError class="size-icon-md text-status-fail-glyph" />
      {:else}
        <span
          class="box-border grid size-full place-items-center rounded-pill border border-border-control type-meta leading-none text-ink-muted num"
          data-box
          data-slot="step-number">{n}</span
        >
      {/if}
    </span>
    <h2
      class="m-0 min-w-0 type-body font-medium text-ink-strong"
      id={headingId}
    >
      {title}{#if stateWords}<span class="sr-only"> — {stateWords}</span>{/if}
    </h2>
  </header>

  <!-- Its own container: its parts fit the column it stands in, whether
       the view runs one column or two. -->
  <div class="@container min-w-0">
    {@render children()}
    <span aria-live="polite" class="sr-only" role="status">{announcement}</span>
  </div>
</section>
