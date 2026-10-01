<script lang="ts">
  /**
   * The rail's usage strip (design/usage-tracker.md §2, owner picks a, i):
   * one strip, two lines, the window that will stop you first. Its name and
   * percent, then what matters about it — when it resets, or when it runs
   * out at this pace — over a 4px bar with its pace tick. A "Usage" link at
   * the top right opens the page; the strip itself opens every window,
   * grouped by provider. Near and over get a faint wash, nothing else.
   *
   * Live: the readings are the client's, which the hub's `usage` frame keeps
   * current. Until the socket has read them, the Claude reading the layout
   * was served with draws the strip, so it never grows on hydration.
   */
  import type { ClaudeLimits } from "@whiffle/core";
  import { page } from "$app/state";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "$lib/components/ui/popover";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import { whiffle } from "./client.svelte";
  import {
    about,
    firstToStop,
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

  const claude = $derived(
    speakingReading(whiffle.claudeLimits)?.reading ??
      (whiffle.usageLimitsRead
        ? null
        : ((page.data.usage as ClaudeLimits | null | undefined) ?? null))
  );
  const go = $derived(speakingReading(whiffle.openCodeGoLimits)?.reading);

  const groups = $derived(
    [
      { name: "Claude", rows: limitRows("Claude", claude, now) },
      { name: "opencode", rows: limitRows("opencode", go, now) },
    ].filter((g) => g.rows.length > 0)
  );
  const lead = $derived(firstToStop(groups.flatMap((g) => g.rows)));

  /**
   * The lead's name: the provider is said only when it is not Claude, and
   * then by its plan, the one word the rail has room for ("Go Month").
   */
  const leadName = (row: LimitRow): string =>
    row.provider === "Claude" ? row.label : `Go ${row.label}`;

  /** What follows the name and percent: the one fact that matters now. */
  const detail = (row: LimitRow): string => {
    const m = row.meter;
    const reset = m.window.resetsAt;
    if (m.state === "stale" && claude) {
      return readAgo(claude.fetchedAt, now);
    }
    // A window that will not last says when it runs out; one that lasts,
    // when it resets.
    if (m.used < 100 && m.runsOutIn !== null) {
      return `out in ${about(m.runsOutIn)}`;
    }
    return reset ? `resets ${resetShort(reset, now)}` : "";
  };

  /** Why there is no bar: a normal state, never a fake 0%. */
  const reason = $derived.by(() => {
    const [first] = Object.values(whiffle.claudeLimits);
    const error = first?.error ?? claude?.error;
    if (error === "not signed in") {
      return "No Claude reading · not signed in";
    }
    if (error === "token expired") {
      return "No Claude reading · login expired";
    }
    return error ? `No Claude reading · ${error}` : "No Claude reading yet";
  });

  const glyphLabel: Record<string, string> = {
    near: "Near the limit",
    over: "Nearly at the limit",
    reached: "Limit reached",
  };
</script>

<div class="strip" data-state={lead?.meter.state ?? 'unknown'}>
  <Popover.Root>
    <Popover.Trigger
      aria-label={lead
        ? `${leadName(lead)} ${Math.round(lead.meter.used)} percent, ${detail(lead)}. Show every limit.`
        : `${reason}. Show every limit.`}
      class="strip-hit press-tint"
    >
      {#if lead}
        {@const m = lead.meter}
        <span class="line">
          {#if m.state === 'near'}
            <Attention aria-hidden="true" class="glyph near" />
          {:else if m.state === 'over' || m.state === 'reached'}
            <Failed aria-hidden="true" class="glyph over" />
          {/if}
          {#if m.state === 'reached'}
            <span class="name">{leadName(lead)} limit</span>
          {:else}
            <span class="name">{leadName(lead)}</span>
            <span class="num pct">{Math.round(m.used)}%</span>
          {/if}
          {#if detail(lead)}
            <span class="detail">· {detail(lead)}</span>
          {/if}
        </span>
        <LimitBar
          elapsed={m.elapsed}
          label={leadName(lead)}
          size={4}
          state={m.state}
          used={m.used}
        />
      {:else}
        <span class="line"><span class="detail">{reason}</span></span>
      {/if}
    </Popover.Trigger>
    <Popover.Content
      align="start"
      class="usage-pop w-[min(20rem,calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
      collisionPadding={8}
      side="top"
      sideOffset={6}
    >
      {#if groups.length === 0}
        <p class="pop-empty">{reason}</p>
      {/if}
      {#each groups as group (group.name)}
        <section class="pop-group">
          <h3 class="pop-provider">{group.name}</h3>
          {#each group.rows as row (row.key)}
            {@const m = row.meter}
            <div class="pop-row" data-state={m.state}>
              <span class="pop-name">
                {#if m.state === 'near'}
                  <Attention aria-label={glyphLabel.near} class="glyph near" />
                {:else if m.state === 'over' || m.state === 'reached'}
                  <Failed aria-label={glyphLabel[m.state]} class="glyph over" />
                {/if}
                {row.label}
              </span>
              <span class="num pct">{Math.round(m.used)}%</span>
              <span class="pop-bar">
                <LimitBar
                  elapsed={m.elapsed}
                  label={row.label}
                  size={4}
                  state={m.state}
                  used={m.used}
                />
              </span>
              {#if m.window.resetsAt}
                <span class="pop-reset"
                  >{m.used >= 100 ? 'Limit reached · ' : ''}resets
                  {resetShort(m.window.resetsAt, now)}</span
                >
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    </Popover.Content>
  </Popover.Root>
  <a class="usage-link" href="/usage">Usage</a>
</div>

<style>
  /* One strip, two lines, the same height whatever it says, so the footer
     never moves when a reading lands or changes. */
  .strip {
    --row-paint: var(--sidebar);
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
    border-radius: var(--radius-sm);
    background: var(--row-paint);
  }
  .strip[data-state="near"] {
    --row-paint:
      linear-gradient(var(--meter-wash-near), var(--meter-wash-near)),
      var(--sidebar);
  }
  .strip[data-state="over"],
  .strip[data-state="reached"] {
    --row-paint:
      linear-gradient(var(--meter-wash-over), var(--meter-wash-over)),
      var(--sidebar);
  }
  :global(.strip-hit) {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
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
        background: color-mix(in oklch, var(--surface-hover) 60%, transparent);
      }
    }
  }
  /* The first line leaves the link its corner. */
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    padding-inline-end: 2.5rem;
    white-space: nowrap;
  }
  .name {
    color: var(--ink-strong);
  }
  .pct {
    color: var(--ink-strong);
  }
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink-muted);
  }
  /* The page link: plain meta text in the corner, coral on hover. */
  .usage-link {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 8px;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-decoration: none;
    transition: color var(--dur-control) var(--ease-out);
  }
  .usage-link:hover {
    color: var(--meter-calm);
  }
  .strip :global(.glyph),
  .pop-row :global(.glyph) {
    inline-size: 14px;
    block-size: 14px;
    flex: none;
  }
  .strip :global(.glyph.near),
  .pop-row :global(.glyph.near) {
    color: var(--meter-near);
  }
  .strip :global(.glyph.over),
  .pop-row :global(.glyph.over) {
    color: var(--meter-over);
  }

  .pop-empty {
    padding: 10px 12px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .pop-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .pop-group + .pop-group {
    border-top: 1px solid var(--border-hairline);
  }
  .pop-provider {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pop-row {
    --row-paint: var(--surface-raised);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    row-gap: 6px;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .pop-name {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    color: var(--ink-strong);
  }
  .pop-bar,
  .pop-reset {
    grid-column: 1 / -1;
  }
  .pop-reset {
    color: var(--ink-muted);
  }
</style>
