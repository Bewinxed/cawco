<script lang="ts">
  /**
   * The stage for a task in a to-do or waiting stage: the wait map. What it
   * waits on stands on the leading side (its own waits, then those it
   * inherits from the whole it is part of), this task in the middle, and
   * what it unblocks on the trailing side; on a phone the three stack in
   * that order. Each wait is one node: its kind, its name, its state in the
   * resolver's word, settled or not, own or inherited; a press opens the
   * thing itself. The ledger's Waits list reads the same waits.
   */
  import type { TaskWait } from "@cawco/core/task-views";
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowRight } from "#lib/icons.js";
  import { LIVENESS, WAIT_GLYPH } from "./marks";
  import type { Liveness, UnblockRow } from "./records";
  import StatusMark from "./StatusMark.svelte";

  /** How many tasks it unblocks stand on the map before the rest fold. */
  const SHOWN = 6;

  let {
    id,
    title,
    liveness,
    waits,
    unblocks,
    onopen,
  }: {
    id: string;
    title: string;
    liveness: Liveness;
    waits: TaskWait[];
    unblocks: UnblockRow[];
    /** A wait's or an unblocked task's node pressed: its target. */
    onopen?: (target: string) => void;
  } = $props();

  let allShown = $state(false);
  const open = $derived(waits.filter((wait) => !wait.settled).length);
  const shownUnblocks = $derived(
    allShown ? unblocks : unblocks.slice(0, SHOWN)
  );
</script>

{#snippet arrow()}
  <span
    aria-hidden="true"
    class="flex items-center justify-center self-center text-ink-subtle max-desk:rotate-90 max-desk:py-space-2"
  >
    <IconArrowRight class="size-icon-lg" />
  </span>
{/snippet}

<div
  class="grid grid-cols-1 items-start gap-space-3 desk:grid-cols-(--map-cols)"
  style:--map-cols={"minmax(0, 1fr) var(--space-8) minmax(0, var(--c-wait-node-w)) var(--space-8) minmax(0, 1fr)"}
>
  <section class="flex flex-col gap-space-2 self-center">
    <h2 class="type-meta text-ink-muted">{words.waitsOn}</h2>
    {#if waits.length === 0}
      <p class="type-body text-ink-muted">{words.waitsOnNothing}</p>
    {:else}
      <ul class="flex flex-col gap-space-2">
        {#each waits as wait (wait.target)}
          {@const Glyph = WAIT_GLYPH[wait.kind]}
          <li>
            <button
              aria-label={words.openWait(wait.label)}
              class="group/node flex w-full flex-col gap-space-2 rounded-lg bg-surface-raised p-space-3 text-start shadow-tile transition-control press-tint hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2"
              onclick={() => onopen?.(wait.target)}
              type="button"
            >
              <span class="mark-line flex min-w-0 items-center gap-space-2">
                <Glyph
                  aria-hidden="true"
                  class="size-icon-md flex-none text-ink-muted"
                />
                <span
                  class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                  >{words.waitKinds[wait.kind]} · {wait.via
                    ? words.inherited(wait.via)
                    : words.own}</span
                >
                <Badge data-box variant={wait.settled ? "done" : "default"}
                  ><span>{wait.state}</span></Badge
                >
              </span>
              <span class="line-clamp-3 type-body text-pretty text-ink-strong"
                >{wait.label}</span
              >
              {#if wait.value}
                <span class="type-meta text-ink-muted"
                  >{words.settledWith(wait.value)}</span
                >
              {/if}
              {#if wait.flag}
                <span class="type-meta text-status-fail-ink"
                  >{words.blockedForGood}: {wait.flag}</span
                >
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {@render arrow()}

  <section
    aria-label={words.thisTask}
    class="flex flex-col gap-space-3 self-center rounded-lg bg-surface-raised p-space-4 shadow-md"
  >
    <span class="mark-line flex items-center justify-between gap-space-2">
      <code class="font-mono text-size-code text-ink-muted">{id}</code>
      <StatusMark mark={LIVENESS[liveness]} />
    </span>
    <span class="type-row text-balance text-ink-strong">{title}</span>
    {#if open > 0}
      <span class="type-meta text-ink-muted">{words.readyWhen(open)}</span>
    {/if}
  </section>

  {@render arrow()}

  <section class="flex flex-col gap-space-2 self-center">
    <h2 class="type-meta text-ink-muted">
      {unblocks.length > 0
        ? words.unblocksCount(unblocks.length)
        : words.unblocks}
    </h2>
    {#if unblocks.length === 0}
      <p class="type-body text-ink-muted">{words.unblocksNone}</p>
    {:else}
      <ul class="flex flex-col">
        {#each shownUnblocks as task (task.id)}
          <li>
            <button
              class="grid min-h-c-row-h w-full grid-cols-(--unblock-cols) items-center gap-x-space-3 rounded-sm px-space-2 text-start transition-control press-tint hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:-outline-offset-2"
              onclick={() => onopen?.(task.id)}
              style:--unblock-cols={"calc(var(--space-8) * 2) minmax(0, 1fr)"}
              type="button"
            >
              <code class="font-mono text-size-code text-ink-muted"
                >{task.id}</code
              >
              <span class="min-w-0 truncate type-body text-ink-strong"
                >{task.title}</span
              >
            </button>
          </li>
        {/each}
      </ul>
      {#if unblocks.length > SHOWN}
        <Button
          aria-expanded={allShown}
          label={allShown ? words.showFewer : words.showAll(unblocks.length)}
          onclick={() => {
            allShown = !allShown;
          }}
          size="sm"
          variant="ghost"
        />
      {/if}
    {/if}
  </section>
</div>
