<script lang="ts">
  /**
   * One line of an opened outcome. At rest: its glyph in the lead column,
   * its sentence, and under it its state word and what was found, one
   * layout at every width (the owner: "suddenly this layout is horizontal
   * then some is vertical"); its edged chevron at the end opens it, so it
   * reads as something that opens before any pointer is on it. Open, under
   * the sentence's edge: a run's question with its evidence and answers;
   * else what the newest run found, whole, with what gave it and when;
   * what checks it, with Start a run now (left out while its next run
   * waits on his answer, which its schedule says) and the way into the
   * routine; and
   * the work on it. Each part is set apart by space alone: its place says
   * what it is, so no heading names it.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronDown, IconChevronUp } from "#lib/icons.js";
  import AskInline from "./AskInline.svelte";
  import OpenControl from "./OpenControl.svelte";
  import type { AnswerState, OutcomeLine } from "./outcomes";
  import StateGlyph from "./StateGlyph.svelte";
  import WorkRow from "./WorkRow.svelte";
  import { lineStateWord, words } from "./words";

  let {
    line,
    open = $bindable(false),
    answer,
    offline,
    onanswer,
    onact,
  }: {
    line: OutcomeLine;
    open?: boolean;
    answer: AnswerState;
    offline: string | null;
    onanswer: (choice: string) => void;
    /** A press on something under the line: "start", "routine", "turn-on", "not-now", or "task:#ref". */
    onact: (what: string) => void;
  } = $props();

  const waiting = $derived(line.ask !== null && answer.kind !== "answered");
  const checker = $derived(line.checker);
</script>

<li class="min-w-0" data-slot="line">
  <Collapsible.Root bind:open>
    <!-- mark-line: the glyph stands at the line's sentence, the first of its rows, in a box a line tall -->
    <div class="flex min-w-0 gap-space-2">
      <StateGlyph state={waiting ? "needsYou" : line.state.kind} />
      <div class="flex min-w-0 flex-1 flex-col">
        <h3 class="type-label text-ink-strong">{line.sentence}</h3>
        <p class="type-meta text-ink-row">
          {#if waiting && line.ask}
            <span class="text-status-attn-ink"
              >{words.needsYou}. {words.asked(
                line.ask.who,
                line.ask.since
              )}</span
            >
          {:else}
            <span class="text-ink-strong">{lineStateWord(line.state)}.</span>
            {line.finding}
          {/if}
        </p>
        <Collapsible.Content fade reveal>
          <div class="flex min-w-0 flex-col gap-space-4 pt-space-3 pb-space-2">
            {#if waiting && line.ask}
              <AskInline {answer} ask={line.ask} {offline} {onanswer} />
            {:else if line.found}
              <div class="flex min-w-0 flex-col gap-space-1">
                <p class="type-body text-ink-strong">{line.found.said}</p>
                <p class="type-meta text-ink-muted">{line.found.from}</p>
              </div>
            {/if}

            {#if checker.kind === "routine"}
              <div class="flex min-w-0 items-start gap-space-3">
                <div class="flex min-w-0 flex-1 flex-col gap-space-1">
                  <p class="type-meta text-ink-row">{checker.does}</p>
                  <p class="type-meta text-ink-row">{checker.when}</p>
                  {#if !waiting}
                    <div class="pt-space-1">
                      <Button
                        disabled={offline !== null ||
                          checker.cannotStart !== null}
                        label={words.start}
                        onclick={() => onact("start")}
                        size="sm"
                        title={offline ?? checker.cannotStart ?? undefined}
                        variant="outline"
                      />
                    </div>
                  {/if}
                </div>
                <span class="flex-none">
                  <OpenControl
                    label={words.openRoutine(checker.name)}
                    onopen={() => onact("routine")}
                  />
                </span>
              </div>
            {:else if checker.kind === "ended"}
              <p class="type-meta text-ink-row">{checker.why}</p>
            {:else if checker.kind === "suggested"}
              <div class="flex min-w-0 flex-col items-start gap-space-2">
                <Badge><span>{words.suggests}</span></Badge>
                <p class="type-body text-ink-strong">{checker.does}</p>
                <div class="flex flex-wrap items-center gap-space-2">
                  <Button
                    disabled={offline !== null}
                    label={words.addRoutine}
                    onclick={() => onact("turn-on")}
                    size="sm"
                    title={offline ?? undefined}
                    variant="outline"
                  />
                  <Button
                    disabled={offline !== null}
                    label={words.dismiss}
                    onclick={() => onact("not-now")}
                    size="sm"
                    title={offline ?? undefined}
                    variant="outline"
                  />
                </div>
              </div>
            {/if}

            {#if line.work.length > 0}
              <ul class="flex min-w-0 flex-col gap-space-2">
                {#each line.work as work (work.ref)}
                  <WorkRow onopen={() => onact(`task:${work.ref}`)} {work} />
                {/each}
              </ul>
            {/if}
          </div>
        </Collapsible.Content>
      </div>
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={words.lineShow(line.sentence)}
            icon={open ? IconChevronUp : IconChevronDown}
            press="pressable"
            size="icon-xs"
            title={words.lineShow(line.sentence)}
            variant="outline"
          />
        {/snippet}
      </Collapsible.Trigger>
    </div>
  </Collapsible.Root>
</li>
