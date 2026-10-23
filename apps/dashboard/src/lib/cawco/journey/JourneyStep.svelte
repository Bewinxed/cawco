<script lang="ts">
  /**
   * One step of a journey's ordered list: its mark, its label (what to do
   * while it stands, what was done once ticked, muted once done or while it
   * waits), and, for the one open step, its note and controls (`children`)
   * under the label, across the whole card in a narrow one.
   *
   * `moves`: the step is drawn live as the hub's ticks land, so its mark
   * swaps in its cell and its note and controls unfold as it opens and fold
   * as it closes (motion/fold `unfold`).
   */
  import type { Snippet } from "svelte";
  import { unfold } from "../motion/fold.svelte";
  import JourneyMark from "./JourneyMark.svelte";
  import type { JourneyMark as Mark } from "./journey";

  let {
    mark,
    n,
    label,
    said = "",
    open = false,
    body = true,
    moves = false,
    step,
    state,
    children,
  }: {
    mark: Mark;
    /** Its place in the list, from 1. */
    n: number;
    label: string;
    /** The state word a screen reader hears before the label ("Done:"). */
    said?: string;
    /** The one step whose note and controls are shown. */
    open?: boolean;
    /** The open step shows its note and controls; false for one whose mark says all it has. */
    body?: boolean;
    /** Its mark swaps and its body unfolds as it changes. */
    moves?: boolean;
    /** Which step, and where it stands, as the hub says: the probe kit's hooks. */
    step: string;
    state: string;
    /** The open step's note and controls. */
    children?: Snippet;
  } = $props();
</script>

<li
  class="mark-line grid grid-cols-mark-fluid items-start gap-x-space-2 gap-y-space-1 text-label"
  data-open={open || undefined}
  data-state={state}
  data-step={step}
>
  <JourneyMark {mark} {n} swap={moves} />
  <span
    class={[
      "min-w-0 text-label wrap-anywhere",
      mark === "done" || mark === "waiting"
        ? "text-ink-muted"
        : "text-ink-strong",
    ]}
    data-slot="step-label"
    >{#if said}<span class="sr-only">{said}{" "}</span>{/if}{label}</span
  >
  <!-- One block per form, so the block that toggles is the one that
       carries the fold: a transition plays only on its own block. -->
  {#if open && body && children && moves}
    <div
      class="col-start-2 flex min-w-0 flex-col gap-space-2 @max-field-group:col-span-2 @max-field-group:col-start-1"
      data-box
      data-slot="step-body"
      in:unfold
      out:unfold
    >
      {@render children()}
    </div>
  {:else if open && body && children}
    <div
      class="col-start-2 flex min-w-0 flex-col gap-space-2 @max-field-group:col-span-2 @max-field-group:col-start-1"
      data-box
      data-slot="step-body"
    >
      {@render children()}
    </div>
  {/if}
</li>
