<script lang="ts">
  import OpenControl from "../OpenControl.svelte";
  /**
   * "Not under an outcome" (option 2, decision 9): the work that serves no
   * outcome, together. As a tile it carries its name, how much it holds and
   * its open control; opened, it is a lead whose body lists its tasks and
   * routines in place of lines, each opening as tasks open everywhere.
   */
  import LeadHead from "./LeadHead.svelte";
  import type { UnplacedRow } from "./outcomes";
  import WorkList from "./WorkList.svelte";

  let {
    rows,
    form,
    onlead,
    onclose,
    onopen,
  }: {
    rows: UnplacedRow[];
    /** `tile` in the bento, `lead` opened. */
    form: "tile" | "lead";
    onlead: () => void;
    onclose: () => void;
    onopen: (what: string) => void;
  } = $props();

  const tasks = $derived(rows.filter((row) => row.kind === "task").length);
  const routines = $derived(rows.length - tasks);
  const holds = $derived(
    [
      tasks > 0 && `${tasks} task${tasks === 1 ? "" : "s"}`,
      routines > 0 && `${routines} routine${routines === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" and ")
  );
</script>

{#if form === "tile"}
  <article
    aria-label="Not under an outcome"
    class="mark-line flex min-w-0 items-center gap-space-2 rounded-lg bg-surface-raised py-space-1 ps-space-4 pe-space-2 shadow-tile max-phone:ps-space-3"
    data-slot="unplaced"
  >
    <h2
      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
    >
      Not under an outcome
    </h2>
    <span class="type-meta text-ink-muted whitespace-nowrap">{holds}</span>
    <span data-box
      ><OpenControl
        label="Open the work not under an outcome"
        onopen={onlead}
      /></span
    >
  </article>
{:else}
  <article
    aria-label="Not under an outcome"
    class="flex min-h-0 min-w-0 flex-col gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile max-phone:p-space-3"
    data-slot="lead"
  >
    <LeadHead {onclose} title="Not under an outcome" />
    <p class="type-meta text-ink-muted">
      Work that serves none of the outcomes.
    </p>
    <WorkList {onopen} {rows} />
  </article>
{/if}
