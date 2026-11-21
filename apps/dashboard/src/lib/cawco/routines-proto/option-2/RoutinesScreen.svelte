<script lang="ts">
  /**
   * Option 2's Routines tab as the project page holds it: the view in the
   * page's pane inset, and what it opened (a run, or a routine) beside it
   * in the page's resizable split (Split), the view live beside it, another
   * Open swapping it in place, Close giving the room back.
   */
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import Split from "#lib/cawco/side/Split.svelte";
  import { type Routine, type Run, routineOf, type Source } from "./day";
  import RoutinePage from "./RoutinePage.svelte";
  import type { Standing } from "./RoutineRow.svelte";
  import RoutinesDay from "./RoutinesDay.svelte";
  import RunPage from "./RunPage.svelte";

  let {
    routines,
    runs,
    sources,
    standings,
    now,
    open = null,
    looked = [],
    onopen,
    onopensession,
    onchoose,
    onlooked,
    onedit,
    onchangewithcaw,
  }: {
    routines: Routine[];
    runs: Run[];
    sources: Source[];
    standings: Record<string, Standing>;
    now: number;
    open?: { kind: "run" | "routine"; id: string } | null;
    looked?: string[];
    /** Opens a run or a routine beside the view; null closes it. */
    onopen: (what: { kind: "run" | "routine"; id: string } | null) => void;
    onopensession: (id: string) => void;
    onchoose: (id: string, choice: string) => void;
    onlooked: (actionId: string) => void;
    onedit: (id: string) => void;
    onchangewithcaw: (id: string) => void;
  } = $props();

  const openRun = $derived(
    open?.kind === "run" ? runs.find((run) => run.id === open.id) : undefined
  );
  const openRoutine = $derived(
    open?.kind === "routine" ? routineOf(open.id) : undefined
  );
  const toRun = (id: string) => onopen({ kind: "run", id });
  const toRoutine = (id: string) => onopen({ kind: "routine", id });
</script>

{#snippet view()}
  <div
    data-slot="pane"
    class={[
      "flex min-h-0 max-w-full flex-auto flex-col overflow-y-auto",
      PANE_INSET,
    ]}
  >
    <RoutinesDay
      {looked}
      {now}
      {onchoose}
      {onlooked}
      onopenroutine={toRoutine}
      onopenrun={toRun}
      {onopensession}
      {open}
      {routines}
      {runs}
      {sources}
      {standings}
    />
  </div>
{/snippet}

{#snippet side()}
  {#if openRun}
    <RunPage
      {looked}
      {now}
      onclose={() => onopen(null)}
      {onlooked}
      onopenroutine={toRoutine}
      onopenrun={toRun}
      {onopensession}
      run={openRun}
    />
  {:else if openRoutine}
    <RoutinePage
      {now}
      {onchangewithcaw}
      {onchoose}
      onclose={() => onopen(null)}
      {onedit}
      onopenrun={toRun}
      routine={openRoutine}
      {runs}
    />
  {/if}
{/snippet}

<Split
  backLabel="Back to Routines"
  defaultWidth={40}
  keys={{
    width: "cawco.proto.routines-2.width",
    expanded: "cawco.proto.routines-2.expanded",
  }}
  main={view}
  open={!!openRun || !!openRoutine}
  {side}
/>
