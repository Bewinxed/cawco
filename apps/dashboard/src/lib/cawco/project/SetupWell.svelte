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
  import { takeHandOff } from "#lib/cawco/transcript/Prompt.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    type StepInk,
    type StepStatus,
    ThinkingStep,
    ThinkingSteps,
  } from "#lib/components/ui/thinking-steps/index.js";
  import { IconNeedsYou, IconSuccess } from "#lib/icons.js";
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

<!-- A rail row (design.css `rail-row`, `rail-line`, `rail-hang`): the
     transcript's line runs down it, its head line on the glyph and text
     columns, what it holds hung at the text column, as a tool's body is. -->
<section
  aria-label={setupWords.element}
  data-slot="setup-well"
  data-tx-rail
  class="tx-columns rail-row max-w-c-measure"
>
  <!-- He stands here while he works; handed over, he is back in his seat
       (one live Caw), and the element stays as the record of what he did. -->
  {#if !handedOver(progress)}
    <div class="rail-hang" data-box>
      <Caw size={80} still={!cawLoop.on} {status} />
    </div>
  {/if}
  <p
    aria-live="polite"
    class="m-0 min-h-(--tx-line) rail-line text-size-label font-medium text-ink-strong"
  >
    <span data-slot="rail-cell" class="rail-cell">
      {#if progress.phase === "waiting"}
        <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
      {:else if !handedOver(progress)}
        <LiveDot />
      {/if}
    </span>
    <MorphText text={progress.doing} />
  </p>
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
</section>
