<script lang="ts">
  /**
   * One section of the project's settings: its heading on the page's
   * ground, then its settings on one card (section-card `SECTION_CARD`).
   * The heading is the first step of the view's four-step type scale (the
   * row size at 600, in strong ink), with no number and no rule. A section
   * that is offline or needs fixing leads its heading with the status
   * glyph in its status ink, the words in the heading's accessible name; a
   * running one with the live dot. What acts on the whole section
   * (`actions`) stands at the heading's end.
   */
  import type { Snippet } from "svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
  import type { SectionId, StageState } from "./changes";
  import { SECTION_CARD } from "./section-card";

  let {
    id,
    title,
    state,
    stateWords,
    announcement = "",
    actions,
    children,
  }: {
    id: SectionId;
    title: string;
    state: StageState;
    /** Spoken in the heading's accessible name when state is not settled. */
    stateWords?: string;
    /** Polite live-region text announcing what the section starts or stops. */
    announcement?: string;
    /** What acts on the whole section, at the heading's end. */
    actions?: Snippet;
    children: Snippet;
  } = $props();

  const headingId = $derived(`work-path-section-${id}`);
</script>

<section
  aria-labelledby={headingId}
  class={["@container break-inside-avoid", SECTION_CARD]}
  data-section={id}
  data-slot="settings-section"
  data-state={state}
>
  <header
    class="mark-line flex min-h-c-btn-h-xs min-w-0 items-center gap-space-2"
  >
    {#if state !== "settled"}
      <span
        aria-hidden="true"
        class="mark-line grid size-icon-md flex-none place-items-center"
        data-box
      >
        {#if state === "busy"}
          <LiveDot />
        {:else if state === "away"}
          <IconWarningTriangle class="size-icon-md text-status-attn-glyph" />
        {:else}
          <IconError class="size-icon-md text-status-fail-glyph" />
        {/if}
      </span>
    {/if}
    <h2 class="m-0 min-w-0 type-row text-ink-strong" id={headingId}>
      {title}{#if stateWords}<span class="sr-only"> — {stateWords}</span>{/if}
    </h2>
    {#if actions}
      <span class="ms-auto flex flex-none items-center gap-space-1" data-box>
        {@render actions()}
      </span>
    {/if}
  </header>

  {@render children()}
  <span aria-live="polite" class="sr-only" role="status">{announcement}</span>
</section>
