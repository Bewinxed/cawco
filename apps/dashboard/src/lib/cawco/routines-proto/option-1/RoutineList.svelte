<script lang="ts">
  /**
   * Every routine in one list, in three groups: Needs you (drawn open, its
   * choices on each row), On (sorted by the next run, soonest first, under
   * its column heads where the list reads down columns), and Not running
   * (paused or finished, each with its reason; open while it holds three or
   * fewer, else one line that opens). A routine that does work and one that
   * looks for something are the same row. The list is its rows' container
   * (`@container/list`), so a row reads down columns or as lines by the
   * room the list has, not the window's.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import type { Routine } from "./harbor";
  import NeedsYouRow from "./NeedsYouRow.svelte";
  import RoutineRow from "./RoutineRow.svelte";

  let {
    routines,
    openId = null,
    onopen,
    onchoose,
  }: {
    routines: Routine[];
    /** The routine standing open beside the list. */
    openId?: string | null;
    onopen: (id: string) => void;
    onchoose: (id: string, choice: string) => void;
  } = $props();

  const needs = $derived(routines.filter((one) => one.state === "needs"));
  const on = $derived(
    routines.filter((one) => one.state === "on" || one.state === "running")
  );
  const resting = $derived(
    routines.filter((one) => one.state === "paused" || one.state === "finished")
  );
  /** Three or fewer stand open; more fold to their one line. */
  let restingOpen = $derived(resting.length <= 3);
</script>

{#snippet head(id: string, words: string, count: number)}
  <h3
    {id}
    class="flex items-center gap-space-2 m-0 ps-space-2 type-label text-ink-muted scroll-mt-space-4"
  >
    <span>{words}</span>
    <Badge size="tally" variant="secondary"><span>{count}</span></Badge>
  </h3>
{/snippet}

<div class="@container/list flex flex-col gap-space-5 min-w-0">
  {#if needs.length > 0}
    <section aria-labelledby="routines-needs" class="flex flex-col gap-space-1">
      {@render head("routines-needs", "Needs you", needs.length)}
      <ul class="flex flex-col m-0 p-0 list-none">
        {#each needs as routine (routine.id)}
          <NeedsYouRow
            {onchoose}
            {onopen}
            open={openId === routine.id}
            {routine}
          />
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-labelledby="routines-on" class="flex flex-col gap-space-1">
    <div class="flex items-center gap-space-3 pe-space-1">
      <div class="flex-auto min-w-0">
        {@render head("routines-on", "On", on.length)}
      </div>
      <!-- The columns' heads, over the columns they name, where the list
           reads down columns: room for the session and Open trails them. -->
      <div
        aria-hidden="true"
        class="hidden @routine-row/list:flex items-center gap-space-4 type-meta text-ink-muted"
      >
        <span class="w-64">Last run</span>
        <span class="w-44">Next run</span>
      </div>
      <span class="hidden @routine-row/list:block w-13"></span>
    </div>
    <ul class="flex flex-col m-0 p-0 list-none">
      {#each on as routine (routine.id)}
        <RoutineRow {onopen} open={openId === routine.id} {routine} />
      {/each}
    </ul>
  </section>

  {#if resting.length > 0}
    <Collapsible.Root bind:open={restingOpen}>
      <section
        aria-labelledby="routines-resting"
        class="flex flex-col gap-space-1"
      >
        <div class="ps-space-2">
          <Collapsible.Trigger class="group w-full" look="fold">
            <span id="routines-resting">Not running</span>
            <Badge data-box size="tally" variant="secondary"
              ><span>{resting.length}</span></Badge
            >
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content reveal>
          <ul class="flex flex-col m-0 p-0 list-none">
            {#each resting as routine (routine.id)}
              <RoutineRow {onopen} open={openId === routine.id} {routine} />
            {/each}
          </ul>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  {/if}
</div>
