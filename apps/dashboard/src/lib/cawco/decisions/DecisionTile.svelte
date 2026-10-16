<script lang="ts">
  /**
   * One decision page in the Decisions tab's grid (the card recipe: 12px,
   * raised, the tile shadow, 18px rhythm). Line 1: its title, and its state
   * pill at the end; line 2: the ring and its figure, `12 of 20 picked ·
   * 3 notes`, or decided, the check and `12 decided · 14 tasks`; line 3: the
   * session that wrote it, its mark, name and age. The whole tile is the
   * link; it tints on press and never scales. Its title and figure carry
   * share keys, so they fly into the page's head as it opens.
   */
  import type { DecisionPageSummary } from "@cawco/core/decisions";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { sessionStatus } from "#lib/cawco/session-status.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { formatAgeShort } from "#lib/utils/time.js";
  import StatePill from "./StatePill.svelte";
  import { isDecided, notesWords, pillOf, progressWords } from "./words";

  let {
    page,
    href,
    now,
    onopen,
  }: {
    page: DecisionPageSummary;
    href: string;
    now: number;
    onopen: (name: string, tile: HTMLElement) => void;
  } = $props();

  const row = $derived(
    page.writer
      ? cawco.instanceIndex.byId.get(page.writer.instanceId)
      : undefined
  );
  const working = $derived(
    !!page.writer && cawco.activityOf(page.writer.instanceId) === "working"
  );
  const pill = $derived(pillOf(page, working, true));
  const decided = $derived(isDecided(page));
  const notes = $derived(decided ? null : notesWords(page.notes));
</script>

<a
  data-slot="tile"
  class="tile press-tint"
  data-page={page.name}
  {href}
  onclick={(event) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    onopen(page.name, event.currentTarget);
  }}
>
  <span data-slot="head" class="line head">
    <span
      data-slot="title"
      class="title"
      data-share="dpage:{page.name}:title"
      {@attach land(() => `dpage:${page.name}:title`)}>{page.title}</span
    >
    {#if pill}
      <StatePill
        tone={pill.tone}
        title={pill.title}
        who={pill.who}
        word={pill.word}
      />
    {/if}
  </span>
  <span class="line">
    <span
      class="progress mark-line"
      data-share="dpage:{page.name}:progress"
      {@attach land(() => `dpage:${page.name}:progress`)}
    >
      <TaskRing
        done={decided ? 1 : page.picked}
        total={decided ? 1 : page.cards}
      />
      <span data-slot="num" class="num">{progressWords(page)}</span>
    </span>
    {#if notes}
      <span data-slot="more" class="more">{notes}</span>
    {/if}
  </span>
  {#if page.writer}
    <span data-slot="meta" class="line meta mark-line">
      <SessionMark
        id={page.writer.instanceId}
        place={row?.cwd || row?.machineId || page.writer.instanceId}
        status={sessionStatus(row)}
      />
      <span data-slot="who" class="who">{page.writer.title}</span>
      {#if page.updatedAt > 0}
        <span class="age">· {formatAgeShort(page.updatedAt, now)}</span>
      {/if}
    </span>
  {/if}
</a>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* Every tile's rows stand at the same heights, a pill or none: the title's
     row is the pill's height. */
  .head {
    justify-content: space-between;
    gap: var(--space-3);
    min-block-size: 24px;
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-strong);
  }
  .num,
  .more,
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .who {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .age {
    flex: none;
  }
  /* `· 1 note` and `· now` go on the run before them: their dot stands a
     word space from it, as from the words after, not the row's gap. */
  .more,
  .age {
    margin-inline-start: calc(0.25em - var(--space-2));
  }
</style>
