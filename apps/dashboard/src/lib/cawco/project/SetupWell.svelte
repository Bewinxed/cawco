<script lang="ts">
  import type { CawStatus } from "@cawco/core/project-conversation";
  /**
   * Caw at work on a project's setup, in his panel's transcript (decision
   * page `onboarding-design`, card `the-wait`): one element made of the
   * transcript's own parts, on the transcript's own columns (`tx-columns`):
   * a rail row like a tool's or the reasoning's, its 2px rail on the
   * transcript's line, no border and no ground of its own, at the text
   * column's measure. In its text column he stands live at 80; under him
   * the row's head line, the live dot in the glyph cell (the Needs-you
   * glyph while a question holds him) and what he is on now in its words,
   * changing in place (MorphText, The Steady Swap Rule); under that the
   * setup's four fixed steps as the transcript's thinking steps, each
   * ticked from his own calls (setup-progress.ts), the one he is on
   * breathing.
   *
   * It is the page's one live Caw while it stands: the project's seat stands empty for as long as it holds him
   * (`lead.inPanel`), and he goes back to it once the setup page opens.
   * With reduced motion he holds his still and nothing breathes; the words
   * and the ticks still change.
   */
  import { setupWords } from "@cawco/core/words/onboarding";
  import type { Component } from "svelte";
  import { takeHandOff } from "#lib/cawco/transcript/Prompt.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    type StepInk,
    type StepStatus,
    ThinkingStep,
    ThinkingSteps,
  } from "#lib/components/ui/thinking-steps/index.js";
  import { IconSuccess } from "#lib/icons.js";
  import CawAtWork from "./CawAtWork.svelte";
  import {
    handedOver,
    type SetupProgress,
    type SetupStep,
  } from "./setup-progress";

  let {
    progress,
    status,
    onreview,
  }: {
    progress: SetupProgress;
    /** The draft stands on the board (way `board`): the person goes to it. */
    onreview?: () => void;
    /** His status as the page has it (CawLead `status`): working while he drafts, needs you while a question holds him. */
    status: CawStatus;
  } = $props();

  /** A step's glyph, ink and place in the column: done ticks, the live one breathes, the rest wait muted. */
  function look(step: SetupStep): {
    icon: Component | "dot";
    ink: StepInk | undefined;
    status: StepStatus;
  } {
    if (step.done) {
      return { icon: IconSuccess, ink: "done", status: "complete" };
    }
    return step.live
      ? { icon: "dot", ink: "active", status: "active" }
      : { icon: "dot", ink: undefined, status: "ahead" };
  }
</script>

<CawAtWork
  doing={progress.doing}
  label={setupWords.element}
  present={!handedOver(progress)}
  slot="setup-well"
  {status}
  waiting={progress.phase === "waiting"}
>
  <div class="rail-hang">
    <ThinkingSteps>
      {#each progress.steps as step, index (step.id)}
        {@const drawn = look(step)}
        <div
          data-slot="setup-step"
          class={["min-w-0", step.live && "breathe"]}
          data-done={step.done || undefined}
        >
          <ThinkingStep
            icon={drawn.icon}
            ink={drawn.ink}
            isLast={index === progress.steps.length - 1}
            label={step.label}
            status={drawn.status}
          />
        </div>
      {/each}
    </ThinkingSteps>
  </div>
  {#if progress.phase === "board" && onreview}
    <!-- The last answer was given from its card: the focus it left comes
         here, the next step. -->
    <div
      class="rail-hang pt-space-2"
      data-hand-off
      {@attach (node: HTMLElement) => {
        if (takeHandOff()) {
          node.querySelector("button")?.focus();
        }
      }}
    >
      <Button
        label={setupWords.reviewDraft}
        onclick={onreview}
        size="sm"
        variant="outline"
      />
    </div>
  {/if}
</CawAtWork>
