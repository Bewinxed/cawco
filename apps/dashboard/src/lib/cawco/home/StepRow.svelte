<script lang="ts">
  /**
   * One step of a staged row: its mark (the step's number in a ring while
   * it stands, the success tick once it is taken), its label, muted once
   * done and read out with `doneWord` first, then what the row gives it
   * (`children`: its note and its control, in the label's column). The
   * tailnet HTTPS row (NeedsCard) and the first-run row (FirstRun) draw
   * their steps with it, in an `<ol role="list">` of their own.
   */
  import type { Snippet } from "svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconSuccess } from "#lib/icons.js";

  let {
    done,
    n,
    label,
    doneWord,
    step,
    live = false,
    children,
  }: {
    done: boolean;
    /** The step's place in the list, from 1. */
    n: number;
    label: string;
    /** What a screen reader says before a done step's label ("Done:"). */
    doneWord: string;
    /** The step's id, on `data-step`. */
    step: string;
    /** The step being worked on now: its mark breathes (the live dot). */
    live?: boolean;
    children?: Snippet;
  } = $props();
</script>

<li
  data-slot="step"
  class="group/step mark-line grid grid-cols-(--step-cols) items-box-start gap-x-space-2 gap-y-space-1 type-label"
  data-done={done || undefined}
  data-step={step}
  style:--step-cols="var(--spacing-icon-md) minmax(0, 1fr)"
>
  <span class="mark-cell">
    <span
      data-slot="step-mark"
      class="grid size-icon-md place-items-center text-ink-muted"
    >
      {#if done}
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        />
      {:else if live}
        <LiveDot />
      {:else}
        <!-- The step's place in the list, drawn from its attribute: the grid
             items are no list items, so the list's own counter stays at 0. -->
        <span
          data-slot="step-number"
          aria-hidden="true"
          class="box-border grid size-full place-items-center rounded-pill border border-border-control type-meta leading-none num before:content-data-n"
          data-n={n}
        ></span>
      {/if}
    </span>
  </span>
  <span
    data-slot="step-label"
    class="min-w-0 type-label wrap-anywhere text-ink-strong group-data-done/step:text-ink-muted"
    >{#if done}<span class="sr-only">{doneWord}{" "}</span>{/if}{label}</span
  >
  {@render children?.()}
</li>
