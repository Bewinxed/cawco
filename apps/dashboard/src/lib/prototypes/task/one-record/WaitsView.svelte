<script lang="ts">
  /**
   * The waits, each one fact said once: its kind's glyph in the lead
   * column, what it is called on the text column, and under it its kind,
   * its state in the hub's one word, settled or not, and whether it is the
   * task's own or inherited from which task. Open it reaches the thing: a
   * task swaps in here, a decision opens the project's decision page at its
   * question. An unsettled wait of the task's own can be re-pointed or
   * removed; a settled or inherited one offers nothing. What the task
   * unblocks closes the list, so the person knows what their act releases.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronRight,
    IconDecisions,
    IconFolderGit,
    IconPin,
    IconPlay,
    IconTaskList,
    IconTranscript,
  } from "#lib/icons.js";
  import type { Opened, TaskView, Wait } from "./model";

  let {
    view,
    stale = false,
    onopen,
  }: {
    view: TaskView;
    stale?: boolean;
    onopen: (opened: Opened) => void;
  } = $props();

  const GLYPH = {
    task: IconTaskList,
    card: IconDecisions,
    pin: IconPin,
    pr: IconFolderGit,
    run: IconPlay,
    session: IconTranscript,
  } as const;

  const ordered = $derived(
    [...view.waits].sort((a, b) => Number(a.settled) - Number(b.settled))
  );

  const open = (wait: Wait) => {
    if (wait.kind === "task" && wait.task !== null) {
      onopen({ what: "task", id: wait.task, task: null });
    }
  };
</script>

<div class="grid gap-space-group">
  {#if ordered.length === 0}
    <p class="m-0 type-body text-ink-muted">{words.noWaits}</p>
  {:else}
    <ul class="m-0 grid list-none p-0" aria-label={words.beside.waits}>
      {#each ordered as wait, i (i)}
        {@const Glyph = GLYPH[wait.kind]}
        <!-- mark-line: the glyph stands in its lead cell, one line box tall, on the first line of words that wrap -->
        <li
          class="grid grid-cols-(--entry-cols) gap-x-space-3 gap-y-space-2 border-b border-b-border-hairline py-space-3 last:border-b-0"
        >
          <span
            class={[
              "mark-cell type-body",
              wait.settled ? "text-status-done-glyph" : "text-ink-muted",
            ]}
          >
            <Glyph
              class="size-icon-md"
              aria-label={words.waitKind[wait.kind]}
            />
          </span>
          <span class="col-span-2 grid min-w-0 gap-space-1">
            <span class="type-body text-pretty wrap-anywhere text-ink-strong"
              >{wait.label}</span
            >
            <span class="flex flex-wrap gap-x-space-2 type-meta text-ink-muted">
              <span>{words.waitKind[wait.kind]}</span>
              <span>·</span>
              <span class="text-ink-strong">{wait.state}</span>
              <span>·</span>
              <span>{wait.settled ? words.settled : words.notSettled}</span>
              <span>·</span>
              <span>{wait.via ? words.inherited(wait.via) : words.own}</span>
            </span>
            {#if wait.value}
              <span class="type-meta text-ink-muted"
                >{words.settledWith(wait.value)}</span
              >
            {/if}
            {#if wait.flag}
              <span class="type-meta text-error-11"
                >{words.blockedForGood}: {wait.flag}</span
              >
            {/if}
          </span>
          {#if !wait.settled}
            <span
              class="col-start-2 col-end-4 flex flex-wrap items-center gap-space-2"
            >
              <Button size="sm" variant="outline" onclick={() => open(wait)}>
                <span>{words.openIt}</span>
                <IconChevronRight data-icon="inline-end" aria-hidden="true" />
              </Button>
              {#if wait.via === null}
                <Button
                  size="sm"
                  variant="ghost"
                  label={words.rePoint}
                  disabled={stale}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  tone="destructive"
                  label={words.removeWait}
                  disabled={stale}
                />
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if view.unblocks > 0}
    <p class="m-0 type-meta text-ink-muted">{words.unblocks(view.unblocks)}</p>
  {/if}
</div>
