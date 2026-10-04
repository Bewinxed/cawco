<script lang="ts">
  /**
   * The usage strip, in the rail's footer and, always, under the phone
   * home's status line: one cell for each provider that is set up (Claude,
   * then opencode), equal in width. A cell is the provider's mark, two
   * numbers (its short window's percent, then its long one's) and one 4px bar
   * split 1:2 between the two, each with its pace tick. Digits only: which
   * window a number is, is said by its bar's place and by the list the strip
   * opens. A cell says a phrase in place of its numbers only when there is
   * something to do about it: a window near its limit that runs out before
   * it resets ("out in 40m"), a limit reached ("limit · 2h"), or a reading
   * gone stale, which says its own provider's age ("read 2h ago").
   *
   * The whole strip is one control. It opens every window, grouped by
   * provider, and the way to the Usage page: a popover by the strip with a
   * fine pointer, the house bottom sheet on touch. The strip is 44px in
   * every state, so the footer never moves when a reading lands or changes.
   *
   * Live: the readings are the client's, which the hub's `usage` frame keeps
   * current. Until the socket has read them, the Claude reading the layout
   * was served with draws the strip, so it never grows on hydration.
   */
  import type { ClaudeLimits } from "@cawco/core";
  import type { Component } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { page } from "$app/state";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import { cawco } from "./client.svelte";
  import type { HubRead } from "./hub-read";
  import { morph } from "./motion/morph.svelte";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import {
    about,
    type LimitRow,
    limitRows,
    readAgo,
    resetShort,
    speakingReading,
  } from "./usage";
  import LimitBar from "./usage/LimitBar.svelte";

  /** A minute clock: the strip's countdowns show minutes and nothing finer. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });

  /** The reading the layout was served with, or why the hub refused it. */
  const served = $derived(
    cawco.usageLimitsRead
      ? null
      : ((page.data.usage as HubRead<ClaudeLimits | null> | undefined) ?? null)
  );
  const claude = $derived(
    speakingReading(cawco.claudeLimits)?.reading ??
      (served?.ok ? served.value : null)
  );
  const go = $derived(speakingReading(cawco.openCodeGoLimits)?.reading);

  /** What a cell says in place of its numbers, and the ink it says it in. */
  interface Phrase {
    text: string;
    tone: "near" | "over" | "stale";
  }
  /** One provider on the strip and in the list. */
  interface Cell {
    id: LimitRow["provider"];
    /** The window after the short one: its week, or the long one in trouble. */
    long: LimitRow | null;
    mark: Component;
    name: string;
    phrase: Phrase | null;
    rows: LimitRow[];
    /** Its session window. */
    short: LimitRow;
    /** Under the first row in the list when the reading is stale. */
    staleAge: string | null;
  }

  const groupOf = (row: LimitRow) => row.meter.window.group;

  /**
   * The row a cell's phrase is about, and the phrase: a limit reached, or
   * the window that runs out soonest among those near their limit that will
   * not last to their reset. Nothing else is worth the numbers' place.
   */
  function trouble(rows: LimitRow[]): { row: LimitRow; phrase: Phrase } | null {
    const reached = rows.find((row) => row.meter.used >= 100);
    if (reached) {
      const reset = reached.meter.window.resetsAt;
      return {
        row: reached,
        phrase: {
          text: reset ? `limit · ${resetShort(reset, now)}` : "limit",
          tone: "over",
        },
      };
    }
    const [soonest] = rows
      .filter(
        ({ meter }) =>
          (meter.state === "near" || meter.state === "over") &&
          meter.runsOutIn !== null &&
          (meter.margin ?? 0) > 0
      )
      .sort((a, b) => (a.meter.runsOutIn ?? 0) - (b.meter.runsOutIn ?? 0));
    if (!soonest || soonest.meter.runsOutIn === null) {
      return null;
    }
    return {
      row: soonest,
      phrase: {
        text: `out in ${about(soonest.meter.runsOutIn)}`,
        tone: soonest.meter.state === "over" ? "over" : "near",
      },
    };
  }

  function cellOf(
    id: Cell["id"],
    name: string,
    mark: Component,
    reading:
      | { stale?: boolean; fetchedAt: number; windows: ClaudeLimits["windows"] }
      | null
      | undefined
  ): Cell | null {
    const rows = limitRows(id, reading, now);
    const [first] = rows;
    if (!(reading && first)) {
      return null;
    }
    const short = rows.find((row) => groupOf(row) === "session") ?? first;
    const weeks = rows.filter((row) => groupOf(row) === "weekly");
    // The week every model shares, before a week one model has to itself.
    const week =
      weeks.find((row) => !row.meter.window.scopeLabel) ?? weeks[0] ?? null;
    const staleAge = reading.stale ? readAgo(reading.fetchedAt, now) : null;
    const worst = staleAge ? null : trouble(rows);
    const longInTrouble = worst && worst.row !== short ? worst.row : null;
    return {
      id,
      name,
      mark,
      rows,
      short,
      long: longInTrouble ?? week ?? rows.find((row) => row !== short) ?? null,
      phrase: staleAge
        ? { text: staleAge, tone: "stale" }
        : (worst?.phrase ?? null),
      staleAge,
    };
  }

  const cells = $derived(
    [
      cellOf("Claude", "Claude", ClaudeIcon, claude),
      cellOf("opencode", "opencode Go", OpenCodeLogo, go),
    ].filter((cell): cell is Cell => cell !== null)
  );

  /** Why there are no cells: a normal state, never a fake 0%. */
  const empty = $derived.by(() => {
    if (served && !served.ok) {
      return `Limits unreadable: ${served.detail} (${served.status}) · reload to read them again`;
    }
    // Until the socket's first frame only Claude's reading is known (the one
    // the page was served with): with none, opencode may still have one, so
    // nothing is claimed absent yet.
    return cawco.usageLimitsRead ? "Sign in to see limits" : "Reading limits…";
  });

  /** The hub's word for a key or login the provider turned away. */
  const KEY_REFUSED = /^HTTP 40[13]\b/;

  /**
   * What the list says of a provider with no windows to show: no machine is
   * signed in to it, or every read failed before any succeeded. Nothing
   * before the first read (an absence not known yet is not claimed), and
   * nothing while a reading speaks (its rows show, stale or not).
   */
  function noteOf(
    name: string,
    has: boolean,
    readings: { error?: string | null }[]
  ): string | null {
    if (!cawco.usageLimitsRead || has) {
      return null;
    }
    if (readings.length === 0) {
      return `${name} · sign in on a machine to see its limits`;
    }
    const error = readings.find((reading) => reading.error)?.error;
    if (!error) {
      return null;
    }
    if (error === "not signed in") {
      return `${name} · sign in on a machine to see its limits`;
    }
    if (error === "token expired") {
      return `${name} · login expired, sign in again on a machine`;
    }
    return KEY_REFUSED.test(error)
      ? `${name} · key not accepted, sign in again on a machine`
      : `${name} · could not read limits: ${error}`;
  }
  const notes = $derived(
    [
      {
        id: "Claude",
        mark: ClaudeIcon,
        text: noteOf(
          "Claude",
          Boolean(claude),
          Object.values(cawco.claudeLimits)
        ),
      },
      {
        id: "opencode",
        mark: OpenCodeLogo,
        text: noteOf(
          "opencode Go",
          Boolean(go),
          Object.values(cawco.openCodeGoLimits)
        ),
      },
    ].filter((note) => note.text !== null)
  );

  const percent = (row: LimitRow) => Math.round(row.meter.used);

  /** Every cell, read out: what the strip's one control is called. */
  const triggerLabel = $derived.by(() => {
    if (cells.length === 0) {
      return `${empty}. Show every limit.`;
    }
    const said = cells.map((cell) => {
      const windows = [cell.short, cell.long]
        .filter((row): row is LimitRow => row !== null)
        .map((row) => `${row.label} ${percent(row)} percent`)
        .join(", ");
      return `${cell.name}: ${windows}${cell.phrase ? `, ${cell.phrase.text}` : ""}`;
    });
    return `${said.join(". ")}. Show every limit.`;
  });

  /** Under a window's name in the list: when it resets, or that it is spent. */
  const resetLine = (row: LimitRow): string => {
    const reset = row.meter.window.resetsAt;
    if (!reset) {
      return row.meter.used >= 100 ? "Limit reached" : "";
    }
    const when = `resets ${resetShort(reset, now)}`;
    return row.meter.used >= 100 ? `Limit reached · ${when}` : when;
  };

  /** Touch, or a phone's width: the limits open in the house bottom sheet. */
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
</script>

{#snippet face()}
  {#if cells.length === 0}
    <span class="noline">{empty}</span>
  {:else}
    <span class="cells">
      {#each cells as cell (cell.id)}
        {@const Mark = cell.mark}
        <span class="cell" data-tone={cell.phrase?.tone}>
          <span class="top">
            <span aria-hidden="true" class="mark"><Mark /></span>
            {#if cell.phrase}
              <span class="phrase">{cell.phrase.text}</span>
            {:else}
              <span class="num">{percent(cell.short)}%</span>
              {#if cell.long}
                <span class="dot">·</span>
                <span class="num">{percent(cell.long)}%</span>
              {/if}
            {/if}
          </span>
          <span class="bars" data-two={cell.long ? "" : undefined}>
            <LimitBar
              elapsed={cell.short.meter.elapsed}
              label="{cell.name} {cell.short.label}"
              size={4}
              state={cell.short.meter.state}
              used={cell.short.meter.used}
            />
            {#if cell.long}
              <LimitBar
                elapsed={cell.long.meter.elapsed}
                label="{cell.name} {cell.long.label}"
                size={4}
                state={cell.long.meter.state}
                used={cell.long.meter.used}
              />
            {/if}
          </span>
        </span>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet limits()}
  <!-- Its size follows what it lists (a provider arriving, a note going). -->
  <div class="pop-body" {@attach morph()}>
    {#if cells.length === 0 && notes.length === 0}
      <p class="pop-empty">{empty}</p>
    {/if}
    {#each cells as cell (cell.id)}
      {@const Mark = cell.mark}
      <section class="pop-group">
        <h3 class="pop-provider">
          <span aria-hidden="true" class="mark"><Mark /></span>
          {cell.name}
        </h3>
        {#each cell.rows as row, i (row.key)}
          {@const m = row.meter}
          {@const under =
            i === 0 && cell.staleAge ? cell.staleAge : resetLine(row)}
          <div class="pop-row">
            <span class="pop-name">
              <span>{row.label}</span>
              {#if under}
                <span class="pop-sub">{under}</span>
              {/if}
            </span>
            <!-- A session's bar is half a longer window's: the short window
                 reads as the short one before its name is read. -->
            <span
              class="pop-bar"
              data-short={m.window.group === "session" ? "" : undefined}
            >
              <LimitBar
                elapsed={m.elapsed}
                label={row.label}
                size={4}
                state={m.state}
                used={m.used}
              />
            </span>
            <span class="num pop-pct">{percent(row)}%</span>
          </div>
        {/each}
      </section>
    {/each}
    {#each notes as note (note.id)}
      {@const Mark = note.mark}
      <!-- A provider with no windows to show: why, and what to do about it. -->
      <p class="pop-empty pop-note">
        <span aria-hidden="true" class="mark"><Mark /></span>
        {note.text}
      </p>
    {/each}
    <a class="pop-foot" href="/usage">Open Usage</a>
  </div>
{/snippet}

<div class="strip">
  {#if touch.current}
    <!-- On touch every window rises in the house sheet, as a tab's details
         and a peek do; with a fine pointer it is a popover by the strip. -->
    <Drawer.Root>
      <Drawer.Trigger
        aria-label={triggerLabel}
        class="strip-hit press-tint touch-hit"
      >
        {@render face()}
      </Drawer.Trigger>
      <Drawer.Content
        class="usage-sheet max-h-[85vh] pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <Drawer.Header class="p-0 pb-1 text-left">
          <Drawer.Title class="text-left">Usage limits</Drawer.Title>
        </Drawer.Header>
        {@render limits()}
      </Drawer.Content>
    </Drawer.Root>
  {:else}
    <Popover.Root>
      <Popover.Trigger aria-label={triggerLabel} class="strip-hit press-tint">
        {@render face()}
      </Popover.Trigger>
      <Popover.Content
        align="start"
        class="usage-pop w-[min(20rem,calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
        collisionPadding={8}
        side="top"
        sideOffset={6}
      >
        {@render limits()}
      </Popover.Content>
    </Popover.Root>
  {/if}
</div>

<style>
  /* Its ground is the surface it stands on: the rail's by default, the
     phone home's where the home sets `--strip-ground`. A bar's pace tick is
     a gap that shows the same paint. */
  .strip {
    --row-paint: var(--strip-ground, var(--sidebar));
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    border-radius: var(--radius-sm);
    background: var(--row-paint);
  }
  /* One control, 44px whatever it says. */
  :global(.strip-hit) {
    display: flex;
    align-items: center;
    inline-size: 100%;
    block-size: 44px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: start;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        /* By day the hover step whole; by night the wash it has had. */
        background: light-dark(
          var(--surface-hover),
          color-mix(in oklch, var(--surface-hover) 60%, transparent)
        );
      }
    }
  }
  .noline {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-muted);
  }
  /* A cell for each provider, equal in width. */
  .cells {
    display: flex;
    flex: 1;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .cell {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 6px;
    justify-content: center;
    min-inline-size: 0;
  }
  /* A cell with something to do about it stands on a faint wash of its own:
     the strip as a whole never tints for one provider's window. */
  .cell[data-tone="near"],
  .cell[data-tone="over"] {
    --wash: var(--meter-wash-near);
    --row-paint:
      linear-gradient(var(--wash), var(--wash)),
      var(--strip-ground, var(--sidebar));

    &::before {
      content: "";
      position: absolute;
      inset: -5px -4px;
      border-radius: var(--radius-sm);
      background: var(--wash);
    }
    & > * {
      position: relative;
    }
  }
  .cell[data-tone="over"] {
    --wash: var(--meter-wash-over);
  }
  .top {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    block-size: 16px;
    overflow: hidden;
    line-height: 16px;
    white-space: nowrap;
  }
  .mark {
    display: inline-flex;
    flex: none;
    inline-size: 14px;
    block-size: 14px;
    overflow: hidden;
    border-radius: 3px;

    & :global(svg) {
      inline-size: 100%;
      block-size: 100%;
    }
  }
  .dot {
    color: var(--ink-muted);
  }
  .phrase {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  [data-tone="near"] .phrase {
    color: var(--status-attn-ink);
  }
  [data-tone="over"] .phrase {
    color: var(--status-fail-ink);
  }
  [data-tone="stale"] .phrase {
    color: var(--ink-muted);
  }
  /* One bar, split between the short window and the long one. */
  .bars {
    display: grid;
    gap: var(--space-1);
    align-items: center;
  }
  .bars[data-two] {
    grid-template-columns: 1fr 2fr;
  }

  .pop-empty {
    padding: 10px 12px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* A provider's line when it has no windows: led by its mark, parted from
     what is above it by the hairline that parts one provider from the next. */
  .pop-note {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pop-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .pop-group + .pop-group,
  .pop-group + .pop-note,
  .pop-note + .pop-note {
    border-top: 1px solid var(--border-hairline);
  }
  .pop-provider {
    display: flex;
    align-items: center;
    gap: 6px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* A window: its name over when it resets, its bar, its percent. */
  .pop-row {
    --row-paint: var(--surface-raised);
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) 32px;
    gap: 8px;
    align-items: center;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .pop-name {
    min-inline-size: 0;
    color: var(--ink-strong);

    & > span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .pop-sub {
    color: var(--ink-muted);
  }
  .pop-bar {
    display: block;
    min-inline-size: 0;
  }
  .pop-bar[data-short] {
    inline-size: 50%;
  }
  .pop-pct {
    text-align: end;
  }
  /* The way to the page: plain meta text, coral on hover. */
  .pop-foot {
    display: block;
    padding: 10px 12px;
    border-top: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-strong);
    text-decoration: none;
    transition: color var(--dur-control) var(--ease-out);

    &:hover {
      color: var(--meter-calm);
    }
  }
</style>
