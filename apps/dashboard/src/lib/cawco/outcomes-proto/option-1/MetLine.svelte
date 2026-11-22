<script lang="ts">
  /**
   * A met outcome, folded to one quiet line at the foot of the view: the
   * outcome's sentence, then its words ("All 2 true now, still being
   * checked"), said once, as the press that spells its lines out in place,
   * and its one open control. Nothing latches: a line that turns takes the
   * outcome back up among the tiles.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconSuccess } from "#lib/icons.js";
  import OpenControl from "../OpenControl.svelte";
  import OutcomeLine from "./OutcomeLine.svelte";
  import type { Outcome } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    outcome,
    spelled = false,
    openLine = null,
    ontoggle,
    onopenline,
    onopenoutcome,
  }: {
    outcome: Outcome;
    /** Its lines stand spelled out under it. */
    spelled?: boolean;
    openLine?: string | null;
    ontoggle: () => void;
    onopenline: (line: string, row: HTMLElement) => void;
    onopenoutcome: () => void;
  } = $props();

  const headId = $derived(`met-${outcome.id}`);
  const linesId = $derived(`met-lines-${outcome.id}`);
</script>

<section
  aria-labelledby={headId}
  data-outcome={outcome.id}
  data-met
  class="flex min-w-0 flex-col gap-space-1"
>
  <div class="flex min-w-0 items-start gap-space-2">
    <p
      class="m-0 flex min-w-0 flex-1 items-start gap-x-space-2 type-body @max-phone/view:type-label"
    >
      <span class="mark-cell">
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-glyph"
        />
      </span>
      <!-- Its words follow the sentence where they fit and start on its
           edge where they wrap. -->
      <span class="flex min-w-0 flex-1 flex-wrap items-start gap-x-space-4">
        <span
          id={headId}
          class="min-w-0 type-body text-pretty text-ink-strong @max-phone/view:type-label"
          >{outcome.sentence}</span
        >
        <Button
          aria-controls={linesId}
          aria-expanded={spelled}
          aria-label={outcomesWords.showLines(outcome.sentence)}
          class="-mx-space-2"
          fit="word"
          label={outcomesWords.met(outcome.lines.length)}
          onclick={ontoggle}
          press="pressable"
          size="xs"
          tone="quiet"
          variant="ghost"
        />
      </span>
    </p>
    <OpenControl
      label={outcomesWords.open(outcome.sentence)}
      onopen={onopenoutcome}
    />
  </div>
  {#if spelled}
    <ul
      id={linesId}
      class="m-0 grid list-none grid-cols-(--line-cols) gap-x-space-3 p-0 ps-space-6 @max-phone/view:grid-cols-(--line-cols-narrow) @max-phone/view:gap-x-space-2"
      style:--line-cols={"minmax(0, 1fr) var(--spacing-c-line-answer-w)"}
      style:--line-cols-narrow={"minmax(0, 1fr) var(--spacing-c-line-answer-w-narrow)"}
    >
      {#each outcome.lines as line (line.id)}
        <OutcomeLine
          {line}
          onopen={(row) => onopenline(line.id, row)}
          open={openLine === line.id}
        />
      {/each}
    </ul>
  {/if}
</section>
