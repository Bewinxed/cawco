<script lang="ts">
  /**
   * The three ways side by side, for the decision page's first view: how
   * many there are and their names are said first, then each way's drawing under its number
   * and name, in a row, as the reader's own screen draws it (PlanFrame's
   * `device`: the phone's sheet under a finger, the desk's card under a
   * mouse), each its whole plan, in a column a phone's width (390px) so the
   * row is one width on either screen (Ways.stories.ts names it). Where the
   * row is wider than the frame the canvas scales it to its 10px floor and
   * scrolls it sideways (its embed fit), so the next way stands at the
   * edge; nothing of any way waits below another.
   */
  import { planProposalWords } from "@cawco/core/words/plan-proposal";
  import type { Variation } from "./PlanBody.svelte";
  import PlanFrame from "./PlanFrame.svelte";

  let {
    tileSize = 18,
    lineWeight = 4,
    sweepSeconds = 1.2,
  }: {
    /** The step mark's cell, px. */
    tileSize?: number;
    /** The progress line's weight, px. */
    lineWeight?: number;
    /** One run of the sweep, in seconds. */
    sweepSeconds?: number;
  } = $props();

  const WAYS: { variation: Variation; name: string }[] = [
    { variation: "a", name: "One list" },
    { variation: "b", name: "Lanes" },
    { variation: "c", name: "Crew first" },
  ];
</script>

<div class="flex w-max flex-col gap-space-3" data-slot="ways">
  <!-- How many, and each by name, inside the first column's width, so a
       phone's first view names the ways it scrolls to. -->
  <p
    class="m-0 w-c-bench-phone-w type-label text-pretty text-ink-muted"
    data-slot="ways-count"
  >
    {planProposalWords.waysCount(WAYS.map((way) => way.name))}
  </p>
  <ol class="m-0 flex list-none items-start gap-space-5 p-0">
    {#each WAYS as way, at (way.variation)}
      <li
        class="flex w-c-bench-phone-w flex-none flex-col gap-space-2"
        data-slot="way"
        data-way={way.variation}
      >
        <p class="m-0 type-label text-ink-strong" data-slot="way-name">
          <span class="num text-ink-muted">{at + 1}</span>
          {way.name}
        </p>
        <PlanFrame
          frame="device"
          {lineWeight}
          {sweepSeconds}
          {tileSize}
          variation={way.variation}
          whole
        />
      </li>
    {/each}
  </ol>
</div>
