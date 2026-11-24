<script lang="ts">
  import { harnessName } from "@cawco/core/harness/kinds";
  import type { PlanChange } from "@cawco/core/plan";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import PlanDelegateHeader from "./PlanDelegateHeader.svelte";
  import { changeDeliveryLabel, describeChange } from "./plan-model.js";
  import type { DelegateSessionRecord } from "./types.js";

  let {
    delegates,
    changes,
    sessionState,
    activeDelegateFilter,
    onFilterDelegate,
    onSelectTask,
  }: {
    activeDelegateFilter: string;
    changes: PlanChange[];
    delegates: DelegateSessionRecord[];
    onFilterDelegate: (delegateId: string) => void;
    onSelectTask: (taskId: string) => void;
    sessionState: "working" | "waiting" | "idle";
  } = $props();
</script>

<aside
  aria-label="Delegates and recent plan changes"
  class="flex h-full min-h-0 flex-col gap-space-4 overflow-y-auto bg-surface-raised p-space-4"
>
  <!-- Delegate Sessions Working Tasks of This Plan -->
  <section class="flex flex-col gap-space-2">
    <div class="flex items-center justify-between gap-space-2">
      <h2 class="type-label text-ink-strong">Delegates on this plan</h2>
      {#if delegates.length > 0}
        <Badge size="tally" variant="secondary">
          <span>{delegates.length}</span>
        </Badge>
      {/if}
    </div>
    <p class="type-meta text-ink-muted">
      Click any task in the plan spine to inspect its to-dos, stage, waits, or
      leave a note.
    </p>

    <div class="flex flex-col gap-space-2 pt-space-1">
      {#each delegates as del (del.id)}
        {@const doneSteps = del.plan.steps.filter(
          (s) => s.status === "completed"
        ).length}
        {@const totalSteps = del.plan.steps.length}
        {@const filtered = activeDelegateFilter === del.id}
        <div
          class={[
            "flex flex-col gap-space-2 rounded-well border p-space-3 transition-control",
            filtered
              ? "border-brand-solid bg-option-picked"
              : "border-border-well bg-surface-well",
          ]}
        >
          <div class="flex items-start justify-between gap-space-2">
            <PlanDelegateHeader
              harness={del.harness}
              identity={del.identity}
              title={del.title}
            />

            {#if del.state === "running"}
              <Badge variant="live">
                <span>Working</span>
              </Badge>
            {:else}
              <Badge variant="done">
                <span>Done</span>
              </Badge>
            {/if}
          </div>

          <div
            class="flex flex-wrap items-center justify-between gap-space-2 type-meta text-ink-muted"
          >
            <span>{harnessName(del.harness)} · {del.machine}</span>
            <span class="mono-figure">{doneSteps}/{totalSteps} steps</span>
          </div>

          {#if del.liveLine}
            <p class="type-meta text-ink-row">{del.liveLine}</p>
          {/if}

          <div class="flex flex-wrap items-center gap-space-2 pt-space-1">
            {#each del.assignedTaskIds as tId (tId)}
              <Button
                label={`Open ${tId}`}
                onclick={() => onSelectTask(tId)}
                size="xs"
                variant="outline"
              />
            {/each}
            <Button
              label={filtered ? "Show all sessions" : "Filter plan"}
              onclick={() => onFilterDelegate(filtered ? "all" : del.id)}
              size="xs"
              tone="quiet"
              variant="ghost"
            />
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Person's Recent Plan Changes & Delivery State -->
  <section
    class="flex flex-col gap-space-2 border-t border-border-hairline pt-space-4"
  >
    <div class="flex items-center justify-between gap-space-2">
      <h2 class="type-label text-ink-strong">Your edits to this plan</h2>
      {#if changes.length > 0}
        <Badge size="tally" variant="secondary">
          <span>{changes.length}</span>
        </Badge>
      {/if}
    </div>

    {#if changes.length === 0}
      <p class="type-meta text-ink-muted">
        No manual changes yet. Rewording, adding, removing, or noting on a step
        reaches the session automatically.
      </p>
    {:else}
      <div class="flex flex-col gap-space-2">
        {#each [...changes].reverse().slice(0, 6) as chg (chg.id)}
          <div
            class="flex flex-col gap-space-1 rounded-well border border-border-well bg-surface-well px-space-3 py-space-2"
          >
            <p class="break-word type-meta text-ink-row">
              {describeChange(chg)}
            </p>
            <div
              class="flex items-center justify-between gap-space-2 type-meta text-ink-subtle"
            >
              <span class="type-code">{chg.step}</span>
              <span>{changeDeliveryLabel(chg, sessionState)}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</aside>
