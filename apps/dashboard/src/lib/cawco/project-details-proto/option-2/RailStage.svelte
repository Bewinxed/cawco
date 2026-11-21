<script lang="ts">
  /**
   * One numbered stage on Option 2's vertical work-path rail: its decorative
   * node on the leading axis (neutral ring with numeral when settled, blue
   * breathing LiveDot when busy, yellow warning glyph when away, crimson
   * alert glyph when faulted), its title and optional trailing meta, the
   * hairline vertical connector down to the next stage (omitted after the
   * last stage), and its content indented to the title's start edge.
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
    meta,
    last = false,
    id,
    announcement = "",
    children,
  }: {
    /** 1-based position along the pipeline rail. */
    n: number;
    title: string;
    state: StageState;
    /** Spoken in the heading's accessible name when state is not settled. */
    stateWords?: string;
    /** Optional trailing summary aligned with the stage title. */
    meta?: Snippet;
    /** True on the final stage (Stage 4 for code projects, Stage 3 otherwise). */
    last?: boolean;
    id: StageId;
    /** Polite live-region text announcing state changes for this stage. */
    announcement?: string;
    children: Snippet;
  } = $props();

  const headingId = $derived(`how-it-runs-stage-${id}`);
</script>

<section
  aria-labelledby={headingId}
  class="grid grid-cols-auto-fluid gap-x-space-2 @field-group:gap-x-space-3"
  data-slot="stage"
  data-stage={id}
  data-state={state}
>
  <!-- Row 1, Col 1: decorative rail node (state words live in the heading). -->
  <span
    aria-hidden="true"
    class={[
      "mark-line inline-grid size-icon-lg flex-none place-items-center self-center justify-self-center rounded-pill border transition-control",
      state === "settled" &&
        "border-border-control bg-surface-raised text-ink-muted",
      state === "busy" && "border-status-live-glyph bg-status-live-bg",
      state === "away" &&
        "border-status-attn-glyph bg-status-attn-bg text-status-attn-glyph",
      state === "fault" &&
        "border-status-fail-glyph bg-status-fail-bg text-status-fail-glyph",
    ]}
    data-box
    data-slot="step-number"
  >
    {#if state === "busy"}
      <LiveDot size="row" tone="live" />
    {:else if state === "away"}
      <IconWarningTriangle class="size-icon-sm" />
    {:else if state === "fault"}
      <IconError class="size-icon-sm" />
    {:else}
      <span class="type-meta font-medium leading-none num">{n}</span>
    {/if}
  </span>

  <!-- Row 1, Col 2: stage title + optional trailing standing summary. -->
  <header
    class="flex min-w-0 flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1"
  >
    <h2 id={headingId} class="m-0 type-body font-medium text-ink-strong">
      {title}{#if stateWords}<span class="sr-only"> — {stateWords}</span>{/if}
    </h2>
    {#if meta}
      <div
        class="flex min-w-0 items-center gap-space-2 type-meta text-ink-muted"
      >
        {@render meta()}
      </div>
    {/if}
  </header>

  <!-- Row 2, Col 1: hairline connector down to the next node (none after last). -->
  <div aria-hidden="true" class="flex flex-col items-center">
    {#if !last}
      <span class="my-space-1 w-px flex-1 bg-border-hairline"></span>
    {/if}
  </div>

  <!-- Row 2, Col 2: stage body aligned to the title's leading edge. -->
  <div class={["min-w-0 pt-space-3", !last && "pb-space-7"]}>
    {@render children()}
    <span class="sr-only" aria-live="polite" role="status">{announcement}</span>
  </div>
</section>
