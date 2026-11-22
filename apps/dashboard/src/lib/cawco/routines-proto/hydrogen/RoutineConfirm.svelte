<script lang="ts">
  import InlineConfirm from "./InlineConfirm.svelte";
  import { formatHeldSummary } from "./routine-format";
  import type { Routine } from "./routines-data";

  export type RoutineConfirmKind = "delete" | "pause-held" | null;

  let {
    attachedRuleCount = 0,
    compact = false,
    confirm = $bindable<RoutineConfirmKind>(null),
    ondelete,
    ontogglepause,
    routine,
  }: {
    attachedRuleCount?: number;
    compact?: boolean;
    confirm?: RoutineConfirmKind;
    ondelete: (id: string) => void;
    ontogglepause: (id: string) => void;
    routine: Routine;
  } = $props();

  const doneWhen = $derived(routine.doneWhen ?? null);
  const hasHeldWork = $derived(
    doneWhen !== null &&
      (doneWhen.heldTasks.length > 0 || doneWhen.heldSteps > 0)
  );
</script>

{#if confirm === "pause-held" && doneWhen}
  <InlineConfirm
    confirmLabel="Pause routine"
    oncancel={() => {
      confirm = null;
    }}
    onconfirm={() => {
      confirm = null;
      ontogglepause(routine.id);
    }}
    title="Pause while work is waiting?"
  >
    <p class="m-0 text-ink-muted">
      Pausing stops checks. Waiting work stays blocked until you resume or mark
      it done: {formatHeldSummary(
        doneWhen.heldTasks,
        doneWhen.heldSteps,
        !compact
      )}.
    </p>
  </InlineConfirm>
{:else if confirm === "delete"}
  <InlineConfirm
    confirmLabel="Delete for good"
    confirmVariant="destructive"
    oncancel={() => {
      confirm = null;
    }}
    onconfirm={() => {
      confirm = null;
      ondelete(routine.id);
    }}
    title='Delete "{routine.name}"?'
    tone="fail"
  >
    {#if compact}
      <p class="m-0">
        Stops running and deletes its {routine.runs.length}
        {routine.runs.length === 1 ? "run" : "runs"}. This cannot be undone.
      </p>
    {:else}
      <ul class="m-0 flex flex-col gap-space-1 ps-space-4">
        <li>Stops running right away. This cannot be undone.</li>
        <li>
          Deletes its {routine.runs.length} recorded
          {routine.runs.length === 1 ? "run" : "runs"} with the routine.
        </li>
        {#if attachedRuleCount > 0}
          <li>
            Deletes {attachedRuleCount} event
            {attachedRuleCount === 1 ? "rule" : "rules"} feeding it.
          </li>
        {/if}
        {#if doneWhen && hasHeldWork && doneWhen.standing !== "met"}
          <li>
            Leaves waiting work blocked until you free or repoint it ({doneWhen.heldTasks
              .map((t) => t.id)
              .join(", ")}).
          </li>
        {/if}
      </ul>
    {/if}
  </InlineConfirm>
{/if}
