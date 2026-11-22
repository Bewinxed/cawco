<script lang="ts">
  /**
   * "The agents' plan" (option 2, decision 5; Option 1's Outcome, opened):
   * what the agents planned under one outcome, grouped under the line each
   * piece serves, then the work for the whole outcome, finished work folded
   * to its count. One quiet line says the agents change it as the facts
   * change. Each row opens from its open control, as tasks open everywhere.
   */
  import type { Outcome } from "./outcomes";
  import WorkList from "./WorkList.svelte";

  let {
    outcome,
    onopen,
  }: {
    outcome: Outcome;
    onopen: (what: string) => void;
  } = $props();
</script>

<div class="flex min-w-0 flex-col gap-space-5" data-slot="plan">
  <p class="type-meta text-ink-muted">
    The agents add to this plan, reshape it and drop from it as the facts
    change.
  </p>
  {#each outcome.plan.groups as group (group.line ?? "whole")}
    <section class="flex min-w-0 flex-col gap-space-2">
      <h3 class="type-label text-ink-muted">
        {group.line === null ? "For the whole outcome" : `For: ${group.line}`}
      </h3>
      <WorkList {onopen} rows={group.rows} />
    </section>
  {:else}
    <p class="type-meta text-ink-muted">
      The agents have planned nothing under this yet.
    </p>
  {/each}
  {#if outcome.plan.done > 0}
    <p class="type-meta text-ink-muted">{outcome.plan.done} done</p>
  {/if}
</div>
