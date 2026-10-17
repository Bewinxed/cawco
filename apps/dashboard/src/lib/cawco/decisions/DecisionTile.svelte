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
  class="press-tint flex min-w-0 flex-col gap-space-2 rounded-lg bg-surface-raised p-space-5 text-ink-strong no-underline shadow-tile"
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
  <!-- literal: 24px (the pill's height; every tile's title row stands at it) -->
  <span
    data-slot="head"
    class="flex min-h-(--head-min-h) min-w-0 items-center justify-between gap-space-3"
    style:--head-min-h="24px"
  >
    <span
      data-slot="title"
      class="type-label min-w-0 truncate text-ink-strong"
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
  <span class="flex min-w-0 items-center gap-space-2">
    <span
      class="mark-line inline-flex items-center gap-space-2 text-ink-strong"
      data-share="dpage:{page.name}:progress"
      {@attach land(() => `dpage:${page.name}:progress`)}
    >
      <TaskRing
        done={decided ? 1 : page.picked}
        total={decided ? 1 : page.cards}
      />
      <span data-slot="num" class="type-meta num text-ink-muted"
        >{progressWords(page)}</span
      >
    </span>
    {#if notes}
      <span
        data-slot="more"
        class="type-meta num ms-(--dot-lead) text-ink-muted"
        style:--dot-lead="calc(0.25em - var(--space-2))">{notes}</span
      >
    {/if}
  </span>
  {#if page.writer}
    <span
      data-slot="meta"
      class="mark-line type-meta num flex min-w-0 items-center gap-space-2 text-ink-muted"
    >
      <SessionMark
        id={page.writer.instanceId}
        place={row?.cwd || row?.machineId || page.writer.instanceId}
        status={sessionStatus(row)}
      />
      <span
        data-slot="who"
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{page.writer.title}</span
      >
      {#if page.updatedAt > 0}
        <span
          class="ms-(--dot-lead) flex-none"
          style:--dot-lead="calc(0.25em - var(--space-2))"
          >· {formatAgeShort(page.updatedAt, now)}</span
        >
      {/if}
    </span>
  {/if}
</a>
