<script lang="ts">
  /**
   * A thinking step's glyph in each ink it takes (ThinkingStep `ink`), as a
   * project's move draws its steps (MoveWait): done, running, failed,
   * waiting on the person, stopped, and the body's own when none is given.
   * The thinking-traffic probe reads each glyph cell's colour against its
   * token.
   */
  import {
    type StepInk,
    ThinkingStep,
    ThinkingSteps,
  } from "#lib/components/ui/thinking-steps/index.js";
  import {
    IconError,
    IconNeedsYou,
    IconStop,
    IconSuccess,
  } from "#lib/icons.js";

  const STEPS: {
    ink: StepInk | undefined;
    label: string;
    icon: typeof IconSuccess | "dot";
  }[] = [
    { ink: "done", label: "Snapshot taken", icon: IconSuccess },
    { ink: "active", label: "Cloning", icon: "dot" },
    { ink: "fail", label: "Clone failed", icon: IconError },
    { ink: "attn", label: "Waiting on you", icon: IconNeedsYou },
    { ink: "muted", label: "Stopped", icon: IconStop },
    { ink: undefined, label: "Plain", icon: "dot" },
  ];
</script>

<main class="grid max-w-c-move-wait-col-w gap-space-3 p-space-3">
  <ThinkingSteps>
    {#each STEPS as step, at (step.label)}
      <div data-ink={step.ink ?? "none"}>
        <ThinkingStep
          icon={step.icon}
          ink={step.ink}
          isLast={at === STEPS.length - 1}
          label={step.label}
        />
      </div>
    {/each}
  </ThinkingSteps>
</main>
