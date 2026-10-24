<script lang="ts">
  /**
   * 3. What waits on you, then the rest: the steps waiting on a pick as a
   * group of their own first, then the step under way, then every other
   * step in the plan's order. Each group is named in the meta role over its
   * rows; the waiting step's chip says where its card is, since its group
   * already says it waits. The layer opens at its top.
   */
  import type { StepNode } from "./StepTree.svelte";
  import StepTree from "./StepTree.svelte";

  let { steps }: { steps: StepNode[] } = $props();

  const waiting = $derived(steps.filter((step) => step.waits));
  const working = $derived(
    steps.filter((step) => !step.waits && step.status === "in_progress")
  );
  const rest = $derived(
    steps.filter((step) => !step.waits && step.status !== "in_progress")
  );
  const groups = $derived(
    [
      { key: "waits", name: "Waiting on you", nodes: waiting },
      { key: "working", name: "Under way", nodes: working },
      { key: "rest", name: "Every other step", nodes: rest },
    ].filter((group) => group.nodes.length > 0)
  );
</script>

<div data-slot="waits-first" class="flex flex-col gap-space-3">
  {#each groups as group (group.key)}
    <div class="flex flex-col gap-space-1" data-group={group.key}>
      <h4 class="m-0 type-meta text-ink-muted">{group.name}</h4>
      <StepTree nodes={group.nodes} waitWords="Open the card" />
    </div>
  {/each}
</div>
