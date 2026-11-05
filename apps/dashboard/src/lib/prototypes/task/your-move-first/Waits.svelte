<script lang="ts">
  /**
   * Waiting on · unblocks: every wait once, reading down fixed columns: its
   * kind's glyph (the kind's word its name), what it is called (only this
   * wraps), where it stands in the hub's one word, and Open it at the
   * trailing edge. A decision's row says its answer and who settled it once
   * settled; a wait blocked for good says why, and a task's own unsettled
   * wait offers Re-point and Remove beside Open it while the task is open.
   * Then the tasks this one releases, the first few, the rest folded.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import {
    IconDecisions,
    IconFork,
    IconPin,
    IconPlay,
    IconTaskList,
    IconTranscript,
  } from "#lib/icons.js";
  import type { TaskRead, WaitRead } from "./fixtures/types";

  let {
    task,
    missing = null,
    onopen,
  }: {
    task: TaskRead;
    /** A wait whose target the hub could not find: the row says so. */
    missing?: string | null;
    onopen: (wait: WaitRead) => void;
  } = $props();

  const FIRST = 5;
  const closed = $derived(task.kind === "done" || task.kind === "dropped");
  const shown = $derived(task.unblocks.slice(0, FIRST));
  const rest = $derived(task.unblocks.slice(FIRST));
  let restOpen = $state(false);
</script>

{#snippet released(link: TaskRead["unblocks"][number])}
  <li class="mark-line flex items-start gap-space-3">
    <span class="mark-cell"
      ><IconTaskList
        aria-hidden="true"
        class="size-icon-md text-ink-muted"
      /></span
    >
    <span class="min-w-0 flex-1 type-body text-ink-strong text-pretty"
      >{link.title}</span
    >
  </li>
{/snippet}

<div class="flex flex-col gap-space-5" data-slot="waits">
  {#if task.waits.length === 0}
    <p class="m-0 type-body text-ink-muted">{words.waits.nothing}</p>
  {:else}
    <ul class="m-0 flex list-none flex-col gap-space-4 p-0">
      {#each task.waits as wait (wait.href)}
        <li
          class="mark-line flex items-start gap-space-3"
          data-wait={wait.kind}
        >
          <span class="mark-cell">
            {#if wait.kind === "card"}
              <IconDecisions
                aria-label={words.waits.kind.card}
                class="size-icon-md text-ink-muted"
              />
            {:else if wait.kind === "task"}
              <IconTaskList
                aria-label={words.waits.kind.task}
                class="size-icon-md text-ink-muted"
              />
            {:else if wait.kind === "pin"}
              <IconPin
                aria-label={words.waits.kind.pin}
                class="size-icon-md text-ink-muted"
              />
            {:else if wait.kind === "pr"}
              <IconFork
                aria-label={words.waits.kind.pr}
                class="size-icon-md text-ink-muted"
              />
            {:else if wait.kind === "run"}
              <IconPlay
                aria-label={words.waits.kind.run}
                class="size-icon-md text-ink-muted"
              />
            {:else}
              <IconTranscript
                aria-label={words.waits.kind.session}
                class="size-icon-md text-ink-muted"
              />
            {/if}
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-space-row" data-box>
            <span class="type-body text-ink-strong text-pretty"
              >{wait.label}</span
            >
            <span class="type-meta text-ink-muted">
              {words.waits.kind[wait.kind]} ·
              <span class={wait.settled ? "text-ink-muted" : "text-ink-strong"}
                >{wait.settled ? words.waits.settled : wait.state}</span
              >{wait.via ? ` · ${words.waits.inherited(wait.via)}` : ""}
            </span>
            {#if wait.value}
              <span class="type-meta text-ink-muted"
                >{words.waits.answer}: {wait.value}</span
              >
            {/if}
            {#if wait.flag}
              <span class="type-meta text-status-fail-ink"
                >{words.waits.blockedForGood}: {wait.flag}</span
              >
            {/if}
            {#if missing === wait.href}
              <span class="type-meta text-status-fail-ink" role="alert"
                >{words.waits.notInProject} {words.waits.notInProjectFix}</span
              >
            {/if}
            {#if !(closed || wait.settled || wait.via) && (wait.flag || missing === wait.href)}
              <span class="flex gap-space-3 pbs-space-1">
                <Button
                  hit="always"
                  label={words.waits.rePoint}
                  size="sm"
                  variant="ghost"
                />
                <Button
                  hit="always"
                  label={words.waits.remove}
                  size="sm"
                  variant="ghost"
                />
              </span>
            {/if}
          </span>
          <Button
            class="flex-none"
            hit="always"
            label={words.waits.openIt}
            size="sm"
            variant="outline"
            data-box
            onclick={() => onopen(wait)}
          />
        </li>
      {/each}
    </ul>
  {/if}

  {#if task.unblocks.length > 0}
    <div class="flex flex-col gap-space-2" data-slot="unblocks">
      <h3 class="m-0 type-label text-ink-muted">
        {words.waits.unblocks} · <span class="num">{task.unblocks.length}</span>
      </h3>
      <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
        {#each shown as link (link.id)}
          {@render released(link)}
        {/each}
      </ul>
      {#if rest.length > 0}
        <Collapsible.Root bind:open={restOpen}>
          <Collapsible.Content fade reveal>
            <ul class="m-0 flex list-none flex-col gap-space-2 p-0 pbe-space-2">
              {#each rest as link (link.id)}
                {@render released(link)}
              {/each}
            </ul>
          </Collapsible.Content>
          {#if !restOpen}
            <Collapsible.Trigger look="fold"
              >{words.waits.moreTasks(rest.length)}</Collapsible.Trigger
            >
          {/if}
        </Collapsible.Root>
      {/if}
    </div>
  {/if}
</div>
