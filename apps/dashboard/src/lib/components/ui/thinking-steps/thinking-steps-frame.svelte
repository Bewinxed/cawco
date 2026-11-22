<script lang="ts">
  /**
   * The kit's ThinkingSteps in a frame of its own (its states file's): each
   * step in its status, as a move's wait composes them.
   */
  import { type StepStatus, ThinkingStep, ThinkingSteps } from "./index.js";

  let {
    steps,
  }: {
    /** Each step's words, where it stands, and its glyph. */
    steps: { label: string; status: StepStatus; icon?: "dot" | "check" }[];
  } = $props();
</script>

<div class="w-sm max-w-full">
  <ThinkingSteps>
    {#each steps as step, index (step.label)}
      <ThinkingStep
        icon={step.icon}
        isLast={index === steps.length - 1}
        label={step.label}
        status={step.status}
      />
    {/each}
  </ThinkingSteps>
</div>
