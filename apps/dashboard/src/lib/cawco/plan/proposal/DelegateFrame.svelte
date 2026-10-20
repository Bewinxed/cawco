<script lang="ts">
  /**
   * A working delegate's pulse in three stills: its row as every way draws
   * it, on the side card's surface at its 360px, at the start, the middle
   * and the end of one run of the sweep across its progress line, each
   * named. The line is drawn large (the row's whole width, the story's
   * weight) and its band is the raised surface in full, so its place along
   * the fill reads in a still. Each still stands its band where the run
   * puts it at that share (ProgressLine `held`: its sweep runs from -100%
   * to 100% of its box), drawn there with no animation: a capture that
   * stops animations can't take it back to its start.
   */
  import { ROWS } from "./classes";
  import DelegateRow from "./DelegateRow.svelte";
  import { livePlan } from "./fixtures";
  import { frameView } from "./view.svelte";

  /** The live plan's second beat: the deposit's delegate two steps in, its line two thirds full. */
  const plan = livePlan(1);
  frameView({ loaded: Date.now(), phone: false, plan: () => plan });
  const working = plan.delegates.filter((one) => one.status === "live");
  /**
   * At a share of its run the band's centre stands at twice the share, less
   * half, of the fill: these three put it at 10%, 50% and 90% of the fill.
   */
  const MOMENTS = [
    { label: "Start", at: 0.3 },
    { label: "Middle", at: 0.5 },
    { label: "End", at: 0.7 },
  ] as const;
</script>

<div
  class="flex w-c-plan-card-w max-w-full flex-col gap-space-3"
  data-slot="pulse-moments"
>
  {#each MOMENTS as moment (moment.label)}
    <div
      class="flex flex-col gap-space-1"
      data-at={moment.at}
      data-slot="pulse-moment"
    >
      <p class="m-0 type-meta text-ink-muted" data-slot="moment-label">
        {moment.label}
      </p>
      <div class="rounded-lg bg-surface-raised px-space-3 py-space-1 shadow-xs">
        <ul class={ROWS}>
          {#each working as one (one.id)}
            <DelegateRow delegate={one} held={moment.at} line="whole" />
          {/each}
        </ul>
      </div>
    </div>
  {/each}
</div>
