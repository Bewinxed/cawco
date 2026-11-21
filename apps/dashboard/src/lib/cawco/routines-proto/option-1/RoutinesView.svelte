<script lang="ts">
  /**
   * The project's Routines view, Option 1: where things stand in one line,
   * then every routine in one list beside two side groups (what the runs
   * asked to do outside, and what reaches the project from outside). On a
   * desk the list takes three of the view's four columns and the side
   * groups the fourth (`@wide/view`); narrower, they follow the list. A
   * routine opens beside the view in the house's split, as a task does.
   */
  import Split from "../../side/Split.svelte";
  import type { OutsideAction, OutsideSource, Routine } from "./harbor";
  import OutsideActions from "./OutsideActions.svelte";
  import OutsideSources from "./OutsideSources.svelte";
  import RoutineList from "./RoutineList.svelte";
  import RoutineSide from "./RoutineSide.svelte";
  import StandLine from "./StandLine.svelte";

  let {
    routines,
    actions,
    sources,
    openId = null,
    runId = null,
    readAt = null,
    onopen,
    onrun,
    onchoose,
    onact,
    ondecide,
    onlooked,
  }: {
    routines: Routine[];
    actions: OutsideAction[];
    sources: OutsideSource[];
    /** The routine standing open beside the view. */
    openId?: string | null;
    /** In the open routine, the earlier run whose whole result stands open. */
    runId?: string | null;
    /** A stale reading: when it was read. */
    readAt?: string | null;
    /** A routine opens beside the view; null closes it. */
    onopen: (id: string | null) => void;
    onrun: (id: string | null) => void;
    onchoose: (id: string, choice: string) => void;
    onact: (id: string, act: string) => void;
    ondecide: (id: string) => void;
    onlooked: (id: string) => void;
  } = $props();

  const opened = $derived(routines.find((one) => one.id === openId) ?? null);
  const running = $derived(
    routines.find((one) => one.state === "running")?.name ?? null
  );
  const soonest = $derived(
    routines.find((one) => one.state === "on" && "at" in one.next) ?? null
  );
</script>

{#snippet main()}
  <div
    class="@container/view flex min-h-0 flex-1 flex-col gap-space-5 overflow-y-auto pe-space-6 pb-space-6 ps-space-7 max-desk:px-space-5"
  >
    <StandLine
      failing={sources.filter((one) => one.failing).length}
      needs={routines.filter((one) => one.state === "needs").length}
      next={soonest && "at" in soonest.next
        ? { name: soonest.name, at: soonest.next.at }
        : null}
      {readAt}
      routines={routines.length}
      {running}
      waiting={actions.filter((one) => one.standing === "waits").length}
    />
    <div class="grid grid-cols-1 gap-space-7 @wide/view:grid-cols-4">
      <div class="min-w-0 @wide/view:col-span-3">
        <RoutineList {onchoose} {onopen} {openId} {routines} />
      </div>
      <div class="flex min-w-0 flex-col gap-space-6">
        <OutsideActions {actions} {ondecide} {onlooked} />
        <OutsideSources {sources} />
      </div>
    </div>
  </div>
{/snippet}

{#snippet side()}
  {#if opened}
    {#key opened.id}
      <RoutineSide
        actions={actions.filter((one) => one.from === opened.name)}
        onact={(act) => onact(opened.id, act)}
        onclose={() => onopen(null)}
        {onrun}
        routine={opened}
        {runId}
      />
    {/key}
  {/if}
{/snippet}

<Split
  backLabel="Back to Routines"
  defaultWidth={45}
  keys={{
    width: "cawco.routines.width.proto-option-1",
    expanded: "cawco.routines.expanded.proto-option-1",
  }}
  {main}
  open={opened !== null}
  {side}
/>
