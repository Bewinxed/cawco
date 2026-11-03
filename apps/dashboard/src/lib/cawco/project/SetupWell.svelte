<script lang="ts">
  import type { CawStatus } from "@cawco/core/project-conversation";
  /**
   * Caw at work on a project's setup, in his panel's transcript (decision
   * page `onboarding-design`, card `the-wait`): one element made of the
   * transcript's own parts. A well (the preview's `surface-well`) holds him
   * live, on its axis, at 80; under him what he is on now, its live dot
   * breathing and its words changing in place (MorphText, The Steady Swap
   * Rule); under that the setup's four fixed steps as the transcript's
   * thinking steps, each ticked from his own calls (setup-progress.ts), the
   * one he is on breathing.
   *
   * It is the page's one live Caw while it stands (The Caw Stands On The
   * Axis Rule): the project's seat stands empty for as long as it holds him
   * (`lead.inPanel`), and he goes back to it once the setup page opens.
   * With reduced motion he holds his still and nothing breathes; the words
   * and the ticks still change.
   */
  import { setupWords } from "@cawco/core/words/onboarding";
  import type { Component } from "svelte";
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    type StepInk,
    type StepStatus,
    ThinkingStep,
    ThinkingSteps,
  } from "#lib/components/ui/thinking-steps/index.js";
  import { IconSuccess } from "#lib/icons.js";
  import type { SetupProgress, SetupStep } from "./setup-progress";

  let {
    progress,
    status,
  }: {
    progress: SetupProgress;
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

<section
  aria-label={setupWords.element}
  data-slot="setup-well"
  class="mx-auto my-space-3 flex w-full max-w-c-composer-w flex-col items-center gap-space-3 rounded-lg border border-border-well bg-surface-well px-space-4 pt-space-4 pb-space-3"
>
  <Caw size={80} still={!cawLoop.on} {status} />
  <!-- mark-line: the live dot heads his words as one pair on the well's axis. -->
  <p
    aria-live="polite"
    class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
  >
    {#if progress.phase !== "page"}<LiveDot />{/if}
    <MorphText text={progress.doing} />
  </p>
  <ThinkingSteps class="self-stretch">
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
</section>
