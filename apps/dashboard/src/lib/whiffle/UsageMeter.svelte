<script lang="ts">
  import type { ClaudeLimits, LimitWindow } from "@whiffle/core";
  /**
   * How full the machine's Claude limits are, on the dock next to ContextMeter.
   * The two answer the same "am I about to hit a wall?" question for the same
   * session, so this reads as its sibling — but where ContextMeter is one bar
   * for one window, this is a segmented rail per window: the 5-hour, the weekly,
   * and each scoped weekly window (the model scopes) ride their own strip, each
   * strip filling green → amber → red down its own length. That structure is what
   * separates it from a sidebar row: segmented, severity-hued, and never one
   * collapsed number.
   *
   * The limits arrive live over the socket (the hub's `kind: 'usage'` frame),
   * folded into `whiffle.usageLimitsFor` — no polling. The opencode spend is
   * fetched on open, once, because it is a heavy REST aggregate rather than a
   * pushed number.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Badge } from "$lib/components/ui/badge";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "$lib/components/ui/popover";
  import IconDollar from "~icons/solar/dollar-linear";
  import { whiffle } from "./client.svelte";
  import UsageRail from "./UsageRail.svelte";
  import { band, resetsIn, usd } from "./usage";

  const DEFAULT_CLAUDE_TIER_PREFIX = /^default_claude_/;
  const UNDERSCORE = /_/g;
  const WORD_START = /\b\w/g;

  interface Props {
    /**
     * Optional, and usually absent. Limits are account-scoped, not
     * machine-scoped — every host signed in to the same account reads the same
     * numbers — so the chrome asks for whichever reading exists rather than
     * naming a machine.
     */
    machineId?: string;
  }

  let { machineId }: Props = $props();

  // Until the live reading arrives, the one the page was served with
  // (routes/+layout.server.ts): the meter is drawn at its size from the
  // first paint instead of growing the footer when the socket catches up.
  const limits: ClaudeLimits | null = $derived(
    machineId
      ? whiffle.usageLimitsFor(machineId)
      : (whiffle.usageLimitsAny() ??
          (page.data.usage as ClaudeLimits | null | undefined) ??
          null)
  );

  const windows = $derived(limits?.windows ?? []);

  /**
   * What the compact surface shows: the windows that will stop you first,
   * fullest down. Everything else is one tap away in the popover.
   */
  const visible = $derived.by(() => {
    const scored = windows.filter((w) => typeof w.percent === "number");
    return scored
      .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
      .slice(0, 3);
  });
  const hiddenCount = $derived(windows.length - visible.length);

  /** The full list reads in the glance's order: fullest first. */
  const ranked = $derived(
    [...windows].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))
  );

  /** The window that will stop you first — named with its reset once it is tight. */
  const tightest = $derived(
    visible[0] && band(visible[0].percent) !== "calm" ? visible[0] : null
  );

  /** Short strip labels: 5h / Wk / the scope name. */
  const compactLabel = (w: LimitWindow): string => {
    if (w.group === "session") {
      return "5h";
    }
    if (w.group === "weekly") {
      return w.scopeLabel ?? "Wk";
    }
    return w.kind;
  };

  /** Why there is nothing to meter — a normal state, never a fake 0%. */
  const emptyReason = $derived.by(() => {
    if (limits === null) {
      return "No limit reading yet.";
    }
    if (limits.error === "not signed in") {
      return "No limit reading — this machine is not signed in to Claude.";
    }
    if (limits.error === "token expired") {
      return "The Claude login on this machine has expired.";
    }
    if (limits.error) {
      // A stale reading still has its windows; show them and flag the age.
      if (limits.stale && windows.length > 0) {
        return null;
      }
      return limits.error;
    }
    return null;
  });

  /** Surfaced only when the windows shown are a stale last-good reading. */
  const staleNote = $derived(
    limits?.stale && limits.error ? `last good reading · ${limits.error}` : null
  );

  /** There are real windows to show; anything else is an empty state. */
  const hasReading = $derived(emptyReason === null);

  /** A live clock for the countdowns; minute granularity is all they show. */
  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  const planLabel = (tier: string | null): string | null => {
    if (!tier) {
      return null;
    }
    return tier
      .replace(DEFAULT_CLAUDE_TIER_PREFIX, "")
      .replace(UNDERSCORE, " ")
      .replace(WORD_START, (c) => c.toUpperCase());
  };

  /** The opencode spend, fetched on open — real dollars, never a guess. */
  let spend = $state<{ today: number; total: number } | null>(null);

  async function refreshSpend(): Promise<void> {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const since = day.getTime();
    const query = machineId
      ? `harness=opencode&machineId=${encodeURIComponent(machineId)}`
      : "harness=opencode";
    try {
      const [totalRes, todayRes] = await Promise.all([
        fetch(`/api/usage/summary?${query}`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch(`/api/usage/summary?${query}&since=${since}`).then((r) =>
          r.ok ? r.json() : null
        ),
      ]);
      spend = {
        total: totalRes?.totals?.costUsd ?? 0,
        today: todayRes?.totals?.costUsd ?? 0,
      };
    } catch {
      // Keep the last reading; the meter is a glance, not a report.
    }
  }
</script>

<Popover.Root
  onOpenChange={(open) => {
    if (open) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — refreshSpend() manages its own loading/error state
      void refreshSpend();
    }
  }}
>
  <Popover.Trigger
    aria-label={hasReading
      ? `Claude limits. ${visible
          .map((w) => `${compactLabel(w)} ${Math.round(w.percent)} percent`)
          .join(", ")}${hiddenCount > 0 ? `, ${hiddenCount} more` : ""}. Show them all.${
          staleNote ? ` ${staleNote}.` : ""
        }`
      : `Claude usage limits. ${emptyReason}`}
    class="meter"
  >
    {#if hasReading}
      <span class="rows">
        {#each visible as window (window.kind)}
          {@const tone = band(window.percent)}
          <span aria-hidden="true" class="label" data-flip
            >{compactLabel(window)}</span
          >
          <UsageRail
            compact
            label={compactLabel(window)}
            value={window.percent}
          />
          {#key Math.round(window.percent)}
            <span aria-hidden="true" class="pct {tone}" data-flip="pop"
              >{Math.round(window.percent)}%</span
            >
          {/key}
        {/each}
      </span>
      {#if tightest?.resetsAt}
        <span class="note {band(tightest.percent)}" data-flip>
          {compactLabel(tightest)} {resetsIn(tightest.resetsAt, now)}
        </span>
      {:else if staleNote}
        <span class="note" data-flip>{staleNote}</span>
      {/if}
    {:else}
      <span class="note" data-flip>{emptyReason}</span>
    {/if}
  </Popover.Trigger>

  <Popover.Content
    align="start"
    class="usage-pop w-[min(20rem,calc(100vw-16px))] gap-0 rounded-[var(--radius-lg)] p-0 shadow-lg"
    collisionPadding={8}
    side="top"
    sideOffset={6}
  >
    <div class="pop-head">
      <span class="pop-title">Usage limits</span>
      {#if hasReading && limits && planLabel(limits.planTier)}
        <Badge class="ml-auto text-label" variant="outline"
          >{planLabel(limits.planTier)}</Badge
        >
      {/if}
    </div>

    {#if staleNote}
      <p class="pop-stale">{staleNote}</p>
    {/if}

    {#if emptyReason}
      <p class="pop-empty">{emptyReason}</p>
    {:else}
      <ul class="pop-list">
        {#each ranked as window (window.kind)}
          {@const tone = band(window.percent)}
          <li class="pop-row">
            <span class="pop-name">
              {compactLabel(window)}
              {#if window.isActive}
                <span class="pop-active">active</span>
              {/if}
            </span>
            <span class="pct {tone}">{Math.round(window.percent)}%</span>
            <span class="pop-bar">
              <UsageRail label={compactLabel(window)} value={window.percent} />
            </span>
            {#if window.resetsAt}
              <span class="pop-reset">{resetsIn(window.resetsAt, now)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="pop-spend">
      <IconDollar class="size-3.5 text-muted-foreground" />
      <span>opencode</span>
      <span class="pop-spend-value">
        {#if spend}
          {usd(spend.today)}
          today · {usd(spend.total)} total
        {:else}
          —
        {/if}
      </span>
    </div>

    <a class="pop-link" href="/usage">
      Open full usage
      <span aria-hidden="true">→</span>
    </a>
  </Popover.Content>
</Popover.Root>

<style>
  .pop-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-hairline);
  }
  .pop-title {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .pop-stale,
  .pop-empty {
    padding: 8px 12px;
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .pop-stale {
    border-bottom: 1px solid var(--border-hairline);
  }
  .pop-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }
  .pop-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    row-gap: 6px;
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }
  .pop-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: var(--weight-medium);
    color: var(--ink-strong);
  }
  .pop-active {
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-hover);
    font-size: var(--text-meta);
    font-weight: normal;
    color: var(--ink-muted);
  }
  .pop-bar {
    grid-column: 1 / -1;
    display: flex;
  }
  .pop-reset {
    grid-column: 1 / -1;
    color: var(--ink-muted);
  }
  .pop-spend {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--border-hairline);
    font-size: var(--text-meta);
    color: var(--ink-strong);
  }
  .pop-spend-value {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .pop-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-top: 1px solid var(--border-hairline);
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    color: var(--ink-strong);
    text-decoration: none;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    @media (pointer: coarse) {
      min-height: 44px;
    }
  }
  /* The glance: one grid, so every bar starts and ends on the same x
     whatever the label. Neutral until a window is tight — then only that
     row's number takes the status colour, and the reset line says when it
     eases. */
  :global(.meter) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-width: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: start;
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    /* A thumb gets a full-height target. */
    @media (pointer: coarse) {
      min-height: 44px;
      padding-block: 10px;
    }
  }
  .rows {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) 4ch;
    align-items: center;
    column-gap: 10px;
    row-gap: 8px;
  }
  .label {
    color: var(--ink-muted);
    font-weight: var(--weight-medium);
  }
  .pct {
    text-align: end;
    color: var(--ink-muted);
  }
  .pct.warn {
    color: var(--warning);
    font-weight: var(--weight-strong);
  }
  .pct.critical {
    color: var(--destructive);
    font-weight: var(--weight-strong);
  }
  .note {
    color: var(--ink-muted);
  }
  .note.warn {
    color: var(--warning);
  }
  .note.critical {
    color: var(--destructive);
  }
</style>
