<script lang="ts">
  /**
   * A session's plan, in the order it was written. Ids are the order — the
   * ledger reads top to bottom the way its author wrote it, so nothing here
   * re-ranks by status and floats the finished work to the bottom.
   *
   * Never rendered for a session with no tasks: the surfaces that host this
   * one check the count first, so there is no empty state to write.
   */
  import { SvelteSet } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import {
    blockerOf,
    type SessionTask,
    taskProgress,
    tasksOf,
  } from "./tasks.svelte";

  interface Props {
    /** The peek pane's version: shorter rows, and the card above says the count. */
    dense?: boolean;
    viewId: string;
  }

  let { viewId, dense = false }: Props = $props();

  const snapshot = $derived(tasksOf(viewId));
  const tasks = $derived(snapshot?.tasks ?? []);
  const progress = $derived(
    snapshot ? taskProgress(snapshot) : { done: 0, total: 0, current: null }
  );

  const opened = new SvelteSet<string>();

  const toggle = (id: string): void => {
    if (!opened.delete(id)) {
      opened.add(id);
    }
  };

  const subjectClass = (task: SessionTask): string => {
    if (task.status === "in_progress") {
      return "font-medium";
    }
    if (task.status === "completed") {
      return "text-ink-muted";
    }
    return "";
  };
</script>

{#snippet glyph(task: SessionTask)}
  <span class="flex w-icon-sm shrink-0 items-center justify-center">
    {#if task.status === "completed"}
      <svg
        aria-hidden="true"
        class="text-success-9"
        height="12"
        viewBox="0 0 12 12"
        width="12"
      >
        <polyline
          fill="none"
          points="2.4,6.4 4.6,8.6 9.4,3.6"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
        />
      </svg>
    {:else if task.status === "in_progress"}
      <span class="size-1.5 rounded-full bg-warning-9"></span>
    {:else}
      <span class="size-1.5 rounded-full border border-ink-muted/40"></span>
    {/if}
  </span>
{/snippet}

<!-- One row's contents, so the two rows below — the one that opens and the one
     that has nothing to open — say the same thing rather than nearly. -->
{#snippet line(task: SessionTask, blocker: string | null)}
  {@render glyph(task)}
  <span class="min-w-0 truncate text-label {subjectClass(task)}"
    >{task.subject}</span
  >
  {#if task.owner}
    <span
      class="shrink-0 rounded-full bg-neutral-2 px-1.5 text-label text-ink-muted"
    >
      {task.owner}
    </span>
  {/if}
  {#if blocker}
    <span class="ml-auto shrink-0 text-meta text-ink-muted"
      >after #{blocker}</span
    >
  {/if}
  <span
    class="shrink-0 font-mono text-meta text-ink-muted tabular-nums {blocker
      ? ''
      : 'ml-auto'}"
    data-tabular>#{task.id}</span
  >
{/snippet}

<div class="flex flex-col">
  {#if !dense}
    <div class="flex items-baseline gap-2 px-3 pt-2 pb-space-1">
      <span class="text-label">Tasks</span>
      <span class="ml-auto text-meta text-ink-muted tabular-nums" data-tabular>
        {progress.done}
        of {progress.total}
      </span>
    </div>
  {/if}

  {#each tasks as task (task.id)}
    {@const blocker = blockerOf(task, tasks)}
    {@const row = `flex w-full items-center gap-2 text-left ${
      dense ? "min-h-space-8 px-2" : "min-h-9 px-3"
    } ${blocker ? "opacity-60" : ""}`}
    {#if task.description}
      <Collapsible.Root
        onOpenChange={() => toggle(task.id)}
        open={opened.has(task.id)}
      >
        <!-- The row is the control; a chevron beside it would be a second way
             to do the one thing the row already does. -->
        <Collapsible.Trigger
          class="{row} rounded-md transition-colors hover:bg-accent/40"
        >
          {@render line(task, blocker)}
        </Collapsible.Trigger>
        <Collapsible.Content>
          <!-- literal: 60ch -->
          <p
            class="max-w-(--measure) pb-2 text-body whitespace-pre-line {dense
              ? 'pr-2 pl-7'
              : 'pr-3 pl-space-8'}"
            style:--measure="60ch"
          >
            {task.description}
          </p>
        </Collapsible.Content>
      </Collapsible.Root>
    {:else}
      <!-- Nothing to open, so nothing offers to: no hover band, no cursor. -->
      <div class={row}>{@render line(task, blocker)}</div>
    {/if}
  {/each}
</div>
