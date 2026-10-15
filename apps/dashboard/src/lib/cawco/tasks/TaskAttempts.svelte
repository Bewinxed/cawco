<script lang="ts">
  /**
   * A task's attempts (WORDS.md: attempt, one session's try at the task),
   * newest first, one shown at a time: its state in plain words with how
   * long it took ("Finished in 1 min"), how it ended when it did not land,
   * and its transcript. Try again starts a fresh attempt whenever none is
   * running: in the last one's workspace when it failed or was stopped
   * (`retryTask`), a new one when it finished (`startAttempt`); the hub's
   * refusal is said under the button in its own words.
   */
  import type { Component, Snippet } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import {
    IconError,
    IconRefresh,
    IconStop,
    IconSuccess,
    IconWorking,
  } from "#lib/icons.js";
  import { formatTimestamp } from "#lib/utils/time.js";
  import { failureWords } from "../hub-read";
  import { tickingClock } from "../motion/clock.svelte.js";
  import {
    type AttemptTone,
    attemptSentence,
    readTask,
    retryTask,
    startAttempt,
    type TaskAttempt,
    type TaskView,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";

  let {
    projectId,
    task,
    chosen = $bindable(null),
    transcript,
    onchanged,
  }: {
    projectId: string;
    task: TaskView;
    /** The attempt shown, by work item; null: the newest. */
    chosen?: string | null;
    /** The shown attempt's transcript, where the sheet draws it. */
    transcript: Snippet<[TaskAttempt, string]>;
    /** Try again started an attempt: the task as the hub reads it now. */
    onchanged: (task: TaskView) => void;
  } = $props();

  const count = $derived(task.attempts.length);
  /** "Attempt 2": the oldest is the first. */
  const nameOf = (index: number) => `Attempt ${count - index}`;
  const shownIndex = $derived(
    Math.max(
      0,
      task.attempts.findIndex((each) => each.workItemId === chosen)
    )
  );
  const shown = $derived(task.attempts[shownIndex] ?? null);

  const clock = tickingClock(() => task.liveAttempt);
  const said = $derived(shown ? attemptSentence(shown, clock.now) : null);

  const GLYPH: Record<AttemptTone, Component> = {
    live: IconWorking,
    done: IconSuccess,
    fail: IconError,
    idle: IconStop,
  };
  const BADGE = {
    live: "live",
    done: "done",
    fail: "fail",
    idle: "secondary",
  } as const;

  let trying = $state(false);
  let tryProblem = $state<string | null>(null);

  async function tryAgain() {
    const { id, lastAttemptFailed, lastAttemptStopped } = task;
    trying = true;
    tryProblem = null;
    try {
      await (lastAttemptFailed || lastAttemptStopped
        ? retryTask(projectId, id)
        : startAttempt(projectId, id));
      const fresh = await readTask(projectId, id);
      chosen = null;
      onchanged(fresh);
    } catch (error) {
      tryProblem = failureWords(error);
    } finally {
      trying = false;
    }
  }
</script>

<section class="part" data-task-attempts>
  <div class="head">
    <div class="words">
      <h3 class="kit-section-head">Attempts</h3>
      <p class="hint">
        Each attempt is one session's try at this task.
        {count === 1 ? "It has had 1." : `It has had ${count}.`}
      </p>
    </div>
    {#if !task.liveAttempt}
      <Button
        data-try-again
        icon={IconRefresh}
        label="Try again"
        onclick={tryAgain}
        pending={trying}
        pendingLabel="Starting…"
        size="sm"
        variant="outline"
      />
    {/if}
  </div>
  <RowFault reason={tryProblem} />
  <RowFault reason={task.startProblem} />

  {#if count > 1}
    <Tabs.Root
      bind:value={
        () => shown?.workItemId ?? "",
        (value) => {
          chosen = value;
        }
      }
    >
      <Tabs.List aria-label="Attempts" class="self-start">
        {#each task.attempts as attempt, index (attempt.workItemId)}
          <Tabs.Trigger class="flex-none" value={attempt.workItemId}
            >{nameOf(index)}</Tabs.Trigger
          >
        {/each}
      </Tabs.List>
    </Tabs.Root>
  {/if}

  {#if shown && said}
    {@const Glyph = GLYPH[said.tone]}
    <div class="attempt" data-attempt-state={shown.state}>
      <div class="line">
        {#if count === 1}
          <span class="attempt-name">{nameOf(0)}</span>
        {/if}
        <Badge data-attempt-status variant={BADGE[said.tone]}
          ><Glyph /><span {@attach clock.watch}>{said.text}</span></Badge
        >
        <span class="when">
          Started
          <time
            datetime={new Date(shown.startedAt).toISOString()}
            title={new Date(shown.startedAt).toLocaleString()}
            >{formatTimestamp(new Date(shown.startedAt))}</time
          >
        </span>
      </div>
      {#if shown.endedHow}
        <p class="how">{shown.endedHow}</p>
      {/if}
      <!-- What it said it did; the attempt whose report leads the Result
           says it there. -->
      {#if shown.headline && task.result?.workItemId !== shown.workItemId}
        <p class="how">{shown.headline}</p>
      {/if}
      {@render transcript(shown, nameOf(shownIndex))}
    </div>
  {/if}
</section>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
  }
  .words {
    flex: 1 1 14rem;
    min-inline-size: 0;
  }
  .words :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .attempt {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .attempt-name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .when {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .how {
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
</style>
