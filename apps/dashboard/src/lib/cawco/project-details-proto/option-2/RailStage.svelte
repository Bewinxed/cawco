<script lang="ts">
  /**
   * One numbered step of the work path: its head on the page's ground,
   * then what it sets standing raised on it, as Configure's sections stand
   * (config/SectionFrame: the recessed ground holding one raised body). A
   * step whose parts are cards of their own (Who decides' members, as its
   * page draws them) takes `cards`: they stand on the ground under the head
   * with no body round them, so no card stands inside another.
   *
   * The mark is the house step's ring (home/StepRow: its number in a
   * control-edged ring, the live dot while something runs); a step that is
   * offline or needs fixing wears the status glyph in its status ink on
   * that ring, the words in the heading's accessible name. What acts on
   * the whole step (`actions`) stands at the head's end.
   */
  import type { Snippet } from "svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
  import type { StageId, StageState } from "./changes";
  import { STEP_BODY } from "./step-body";

  let {
    n,
    title,
    state,
    stateWords,
    id,
    announcement = "",
    actions,
    cards = false,
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
    /** What acts on the whole step, at the head's end. */
    actions?: Snippet;
    /** Its parts are cards of their own, standing on the ground: no body round them. */
    cards?: boolean;
    children: Snippet;
  } = $props();

  const headingId = $derived(`how-it-runs-stage-${id}`);
</script>

<section
  aria-labelledby={headingId}
  class="flex min-w-0 flex-col gap-space-3"
  data-slot="stage"
  data-stage={id}
  data-state={state}
>
  <header
    class="mark-line flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2"
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
    {#if actions}
      <span class="ms-auto flex flex-none items-center gap-space-1" data-box>
        {@render actions()}
      </span>
    {/if}
  </header>

  <!-- Its own container: its parts fit the column it stands in, whether
       the view runs one column or two. -->
  <div class={["@container min-w-0", !cards && STEP_BODY]}>
    {@render children()}
    <span aria-live="polite" class="sr-only" role="status">{announcement}</span>
  </div>
</section>
