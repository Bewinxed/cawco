<script lang="ts">
  /**
   * A repeating task's runs, where a one-off task's attempts stand: newest
   * first, each its glyph, its word, one sentence of what it found or did
   * and how long ago, opening to its result whole and its session. Quiet
   * runs alike in a row fold into one line, as the task's activity folds
   * its changes ("12 sweeps, all fine"), opened to them.
   */
  import { commonWords } from "@cawco/core/words/common";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconArrowUpRight,
    IconChevronRight,
    IconError,
    IconNeutral,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { rowHref } from "../links";
  import MessageBody from "../MessageBody.svelte";
  import { sessionTitle } from "../session-names.svelte";
  import { openBeside } from "../tasks/beside.svelte";
  import { failedRun, runRows, runWord } from "./repeat-words";
  import type { Repeat, Run } from "./repeating-data";

  let {
    repeat,
    projectId,
    taskId,
  }: {
    repeat: Repeat;
    projectId: string;
    taskId: string;
  } = $props();

  const rows = $derived(runRows(repeat));
  const ago = (at: number) => formatDistanceToNow(new Date(at));

  /** A run's glyph and its ink: its answer, or what went wrong. */
  function glyphOf(run: Run) {
    if (failedRun(run)) {
      return { Icon: IconError, ink: "text-status-fail-glyph" };
    }
    const word = runWord(repeat, run);
    if (word === "Not yet" || word === "No") {
      return { Icon: IconNotYet, ink: "text-status-idle-glyph" };
    }
    if (word === "Nothing new") {
      return { Icon: IconNeutral, ink: "text-status-idle-glyph" };
    }
    return { Icon: IconSuccess, ink: "text-status-done-glyph" };
  }
</script>

{#snippet runRow(run: Run)}
  {@const glyph = glyphOf(run)}
  <li data-run={run.id}>
    <Collapsible.Root>
      <Collapsible.Trigger class="group w-full" look="head">
        <span
          class="mark-line flex w-full items-center gap-space-2 py-space-1"
          data-box
        >
          <span
            aria-hidden="true"
            class="inline-flex flex-none items-center {glyph.ink}"
            data-box
          >
            {#if run.outcome === "running"}
              <LiveDot size="row" />
            {:else}
              <glyph.Icon class="size-icon-md" />
            {/if}
          </span>
          <span class="sr-only">{runWord(repeat, run)}:</span>
          <span
            class="min-w-0 flex-auto overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong"
            >{run.oneLine}</span
          >
          <time
            class="flex-none type-meta whitespace-nowrap text-ink-muted"
            datetime={new Date(run.at).toISOString()}>{ago(run.at)}</time
          >
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content fade reveal>
        <div
          class="flex flex-col gap-space-2 pt-space-1 pb-space-2 ps-(--run-indent)"
          style:--run-indent={"calc(var(--spacing-icon-md) + var(--spacing-space-2))"}
        >
          {#if run.result}
            <MessageBody source={run.result} />
          {/if}
          <a
            class="mark-line inline-flex items-center gap-space-1 self-start rounded-sm type-label text-link-ink no-underline hover:underline focus-inset"
            href={rowHref(run.session)}
            onclick={(press) => {
              press.preventDefault();
              openBeside(run.session, projectId, taskId);
            }}
          >
            <span
              >Open {sessionTitle(run.session) ?? commonWords.itsSession}</span
            >
            <IconArrowUpRight aria-hidden="true" class="size-icon-sm" />
          </a>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </li>
{/snippet}

<ol class="m-0 flex list-none flex-col gap-space-1 p-0" data-slot="runs">
  {#each rows as row (row.kind === "run" ? row.run.id : row.id)}
    {#if row.kind === "run"}
      {@render runRow(row.run)}
    {:else}
      <li data-slot="fold">
        <Collapsible.Root>
          <Collapsible.Trigger class="group w-full" look="fold">
            <IconChevronRight
              aria-hidden="true"
              class="size-icon-sm flex-none transition-[transform] duration-(--duration-control) ease-out group-state-open:transform-(--chev-turn)"
              data-chev
              style="--chev-turn: rotate(90deg)"
            />
            <span>{row.words}</span>
            <span class="ms-auto type-meta whitespace-nowrap text-ink-subtle"
              >{ago(row.runs[0]?.at ?? 0)} – {ago(
                row.runs.at(-1)?.at ?? 0
              )}</span
            >
          </Collapsible.Trigger>
          <Collapsible.Content fade reveal>
            <ol class="m-0 flex list-none flex-col gap-space-1 p-0 pt-space-1">
              {#each row.runs as run (run.id)}
                {@render runRow(run)}
              {/each}
            </ol>
          </Collapsible.Content>
        </Collapsible.Root>
      </li>
    {/if}
  {/each}
</ol>
