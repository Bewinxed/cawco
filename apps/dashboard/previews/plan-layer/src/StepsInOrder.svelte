<script lang="ts">
  /**
   * 2. Every step, in order: the list as built (PlanTree), its waiting step
   * carrying Waiting on you as a chip to its card. The layer opens at the
   * step under way (PlanLayer `openAt`).
   */
  import type { StepNode } from "./StepTree.svelte";
  import StepTree from "./StepTree.svelte";

  let { steps }: { steps: StepNode[] } = $props();
</script>

<StepTree nodes={steps} />
