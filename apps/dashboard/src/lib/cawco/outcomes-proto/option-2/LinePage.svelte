<script lang="ts">
  /**
   * Line, opened, under 640 (option 2, decision 8): what the lead's right
   * column holds, where the lead has no room for two columns. A page over
   * the view with Back to Outcomes; the line's sentence and answer; This
   * line, and The agents' plan as a second tab.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronLeft } from "#lib/icons.js";
  import AgentsPlan from "./AgentsPlan.svelte";
  import AnswerWord from "./AnswerWord.svelte";
  import type { AnswerState } from "./AskBlock.svelte";
  import FaceSwitch, { type LeadFace } from "./FaceSwitch.svelte";
  import LineDetail from "./LineDetail.svelte";
  import type { Outcome, OutcomeLine } from "./outcomes";

  let {
    outcome,
    line,
    face,
    answer,
    offline,
    onback,
    onface,
    onsend,
    onopen,
  }: {
    outcome: Outcome;
    line: OutcomeLine;
    face: LeadFace;
    answer: AnswerState;
    offline: string | null;
    onback: () => void;
    onface: (face: LeadFace) => void;
    onsend: (choice: string) => void;
    onopen: (what: string) => void;
  } = $props();
</script>

<article
  aria-label={line.sentence}
  class="flex min-w-0 flex-col gap-space-4"
  data-slot="line-page"
>
  <header class="flex min-w-0 flex-col gap-space-2">
    <span class="-ms-space-2">
      <Button
        aria-label="Back to Outcomes"
        icon={IconChevronLeft}
        onclick={onback}
        size="icon-sm"
        variant="ghost"
      />
    </span>
    <p class="type-meta text-ink-muted">{outcome.sentence}</p>
    <div class="flex min-w-0 items-start justify-between gap-space-3">
      <h2 class="min-w-0 type-title text-ink-strong">{line.sentence}</h2>
      <span class="pt-space-1"><AnswerWord answer={line.answer} /></span>
    </div>
  </header>
  <FaceSwitch {face} {onface} />
  {#if face === "plan"}
    <AgentsPlan {onopen} {outcome} />
  {:else}
    <LineDetail {answer} {line} {offline} {onopen} {onsend} tight />
  {/if}
</article>
