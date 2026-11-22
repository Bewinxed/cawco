<script lang="ts">
  import { MINUTE_MS } from "@cawco/core/time";
  import { commonWords } from "@cawco/core/words/common";
  /**
   * The routine he opened, in the card beside the view (SideSurface, as a
   * task opens beside the board): the outcome it serves, when it runs, and
   * its newest run's words whole, with the session that did it one press
   * away. The routine's own page (every run, changing it, pausing it) is
   * its own design; this is what the view hands him on open.
   */
  import {
    routineOutcomeWords,
    openedRoutineWords as words,
  } from "@cawco/core/words/routine-outcomes";
  import { routinesWords } from "@cawco/core/words/routines";
  import { Button } from "#lib/components/ui/button/index.js";
  import SideSurface from "../side/SideSurface.svelte";
  import type { RoutineItem } from "./outcomes";

  let {
    item,
    timeOf,
    placement = "beside",
    onclose,
  }: {
    item: RoutineItem;
    timeOf: (ms: number) => string;
    placement?: "beside" | "sheet";
    onclose: () => void;
  } = $props();

  const last = $derived(item.routine.lastRun);
  const said = $derived(last?.output ?? last?.reason ?? words.nothing);
  /** How long its newest run took, in minutes; null while it runs. */
  const minutes = $derived(
    last?.endedAt
      ? Math.round((last.endedAt - last.startedAt) / MINUTE_MS)
      : null
  );
</script>

<SideSurface
  label={words.label}
  of="task"
  {onclose}
  {placement}
  recessed={false}
  subtitle={item.outcome ?? routineOutcomeWords.unplaced}
  title={item.title}
>
  <!-- One scroller under the head floating over it, its top padded by the
       head's room, as a task's pane is (TaskPane). -->
  <div
    class={[
      "flex min-h-0 flex-auto flex-col gap-space-5 overflow-y-auto overscroll-contain pt-(--side-room) pb-space-5 scroll-timeline-transcript-head",
      placement === "sheet" ? "px-space-5" : "px-space-3",
    ]}
  >
    <div class="flex flex-col gap-space-1">
      <p class="type-label text-ink-strong">
        {item.outcome ?? routineOutcomeWords.unplaced}
      </p>
      <p class="type-meta text-ink-muted">
        {words.when(
          item.routine.schedule.words,
          item.routine.schedule.nextAt
            ? timeOf(item.routine.schedule.nextAt)
            : null
        )}
      </p>
    </div>
    {#if last}
      <section class="flex flex-col gap-space-2">
        <p class="type-meta text-ink-muted">
          {minutes === null
            ? routinesWords.runningSince(timeOf(last.startedAt))
            : words.ran(timeOf(last.startedAt), minutes)}
        </p>
        <p class="type-prose text-ink-strong">{said}</p>
        <div class="pt-space-1">
          {#if last.instanceId}
            <Button
              href="/session/{last.instanceId}"
              label={commonWords.openSession}
              size="sm"
              variant="outline"
            />
          {:else}
            <p class="type-meta text-ink-muted">{words.noSession}</p>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</SideSurface>
