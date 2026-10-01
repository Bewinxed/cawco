<script lang="ts">
  /**
   * The page's lead (design/usage-tracker.md §3, owner pick e): will it last?
   * The window that will stop you first leads as a percent with its
   * projection in one sentence; under it every window, grouped by provider.
   *
   * Limits are account-scoped: every machine signed in to one account reads
   * the same numbers, so a provider's first good reading speaks for all of
   * them, and a reading that failed with the last good windows kept is shown
   * stale. Live: the readings are the client's, which the hub's `usage`
   * frame keeps current.
   */
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconKey } from "$lib/icons";
  import Failed from "~icons/solar/close-circle-bold-duotone";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import { cawco, type Machine } from "../client.svelte";
  import HarnessGlyph from "../HarnessGlyph.svelte";
  import MachineLogin from "../MachineLogin.svelte";
  import {
    capMoney,
    fillState,
    firstToStop,
    type LimitRow,
    limitRows,
    type Meter,
    money,
    planName,
    projectionNote,
    projectionSentence,
    readAgo,
    resetLabel,
    speakingReading,
  } from "../usage";
  import LimitBar from "./LimitBar.svelte";

  let {
    now,
    spend,
  }: {
    /** The page's clock, a minute at a time. */
    now: number;
    /** opencode's recorded spend; null while it is read or when it failed. */
    spend: { today: number; week: number; all: number } | null;
  } = $props();

  type Row = LimitRow;

  interface Unknown {
    machine: Machine | null;
    reason: string;
    signIn: boolean;
  }

  const hostOf = (machineId: string): Machine | null =>
    cawco.machines.find((m) => m.machineId === machineId) ?? null;

  const claude = $derived(speakingReading(cawco.claudeLimits));
  const go = $derived(speakingReading(cawco.openCodeGoLimits));

  const claudeRows = $derived(limitRows("Claude", claude?.reading, now));
  const goRows = $derived(limitRows("opencode", go?.reading, now));

  /**
   * Claude's extra usage: real money past the plan against a monthly cap.
   * Only when a cap is set; it has no clock to pace against, so no tick, and
   * it never stops a session, so it never leads the block.
   */
  const extra = $derived.by(() => {
    const r = claude?.reading;
    if (
      !r ||
      r.spendLimit === null ||
      r.spendLimit <= 0 ||
      r.spendUsed === null
    ) {
      return null;
    }
    const used = (r.spendUsed / r.spendLimit) * 100;
    return {
      used,
      state: r.stale ? ("stale" as const) : fillState(used),
      amount: `${money(r.spendUsed)} of ${capMoney(r.spendLimit)}`,
      resetsAt: r.spendResetsAt,
    };
  });

  /** Why there is no Claude bar, and what to do about it. */
  const claudeUnknown = $derived.by((): Unknown | null => {
    if (claude) {
      return null;
    }
    const [first] = Object.entries(cawco.claudeLimits);
    if (!first) {
      return {
        machine: null,
        reason: "No machine has reported a Claude reading yet.",
        signIn: false,
      };
    }
    const [machineId, reading] = first;
    const machine = hostOf(machineId);
    const host = machine?.hostname ?? "a removed machine";
    if (reading.error === "not signed in") {
      return {
        machine,
        reason: `Not signed in to Claude on ${host}.`,
        signIn: true,
      };
    }
    if (reading.error === "token expired") {
      return {
        machine,
        reason: `The Claude login on ${host} has expired.`,
        signIn: true,
      };
    }
    return {
      machine,
      reason: `Anthropic did not answer the limit read (${reading.error}). The next read is automatic.`,
      signIn: false,
    };
  });

  const providers = $derived(
    [claudeRows.length > 0, goRows.length > 0].filter(Boolean).length
  );
  const lead = $derived(firstToStop([...claudeRows, ...goRows]));

  /**
   * What the headline percent is of: "the 5-hour window", "the Fable week",
   * "opencode's month". It names the provider only when two have windows on
   * screen.
   */
  const leadName = $derived.by(() => {
    if (!lead) {
      return "";
    }
    const w = lead.meter.window;
    const base =
      { session: "5-hour window", weekly: "week", monthly: "month" }[w.group] ??
      lead.label;
    const scoped = w.scopeLabel ? `${w.scopeLabel} ${base}` : base;
    return providers > 1 ? `${lead.provider}'s ${scoped}` : `the ${scoped}`;
  });

  const resetText = (m: Meter): string => {
    const reset = m.window.resetsAt;
    if (!reset) {
      return "";
    }
    const when = resetLabel(reset, now);
    if (m.used >= 100) {
      return `Limit reached · resets ${when}`;
    }
    return `resets ${when}`;
  };

  const showSpend = $derived(
    spend !== null && (spend.all > 0 || goRows.length > 0)
  );

  let loginFor = $state<Machine | null>(null);
  let loginOpen = $state(false);
</script>

<section aria-labelledby="limits-title" class="card">
  <h2 class="title" id="limits-title">Limits</h2>

  {#if !cawco.usageLimitsRead}
    <div class="loading" data-slot="skeleton-rows">
      <Skeleton class="h-7 w-24" />
      <Skeleton class="h-4 w-3/4" />
      {#each [0, 1, 2] as row (row)}
        <Skeleton class="h-5 w-full" />
      {/each}
    </div>
  {:else}
    {#if lead}
      <div class="lead">
        <p class="headline">
          <span class="pct num">{Math.round(lead.meter.used)}%</span>
          <span class="of">of {leadName}</span>
        </p>
        {#if projectionSentence(lead.meter, now)}
          <p class="sentence">{projectionSentence(lead.meter, now)}</p>
        {/if}
      </div>
    {/if}

    <div class="windows">
      <div class="group">
        <header class="provider">
          <span class="glyph"><HarnessGlyph harness="claude" /></span>
          <span class="name">Claude</span>
          {#if claude && planName(claude.reading.planTier)}
            <span class="plan">· {planName(claude.reading.planTier)}</span>
          {/if}
          {#if claude?.reading.stale}
            <span class="age">{readAgo(claude.reading.fetchedAt, now)}</span>
          {/if}
        </header>
        {#if claudeUnknown}
          <div class="unknown">
            <p>{claudeUnknown.reason}</p>
            {#if claudeUnknown.signIn && claudeUnknown.machine}
              {@const machine = claudeUnknown.machine}
              <Button
                icon={IconKey}
                label="Log in to Claude"
                onclick={() => {
                loginFor = machine;
                loginOpen = true;
              }}
                size="sm"
                variant="outline"
              />
            {/if}
          </div>
        {:else}
          {@render windows(claudeRows)}
          {#if extra}
            <div class="row extra" data-state={extra.state}>
              <span class="label">Extra usage</span>
              <span class="bar">
                <LimitBar
                  elapsed={null}
                  label="Extra usage"
                  state={extra.state}
                  used={extra.used}
                />
              </span>
              <span class="amount num">
                {#if extra.state === 'near'}
                  <Attention aria-label="Near the cap" class="status" />
                {:else if extra.state === 'over' || extra.state === 'reached'}
                  <Failed
                    aria-label={extra.state === 'reached' ? 'Cap reached' : 'Nearly at the cap'}
                    class="status"
                  />
                {/if}
                {extra.amount}
                {#if extra.resetsAt}
                  <span class="resets"
                    >· resets {resetLabel(extra.resetsAt, now)}</span
                  >
                {/if}
              </span>
            </div>
          {/if}
        {/if}
      </div>

      {#if goRows.length > 0 || showSpend}
        <div class="group">
          <header class="provider">
            <span class="glyph"><HarnessGlyph harness="opencode" /></span>
            <span class="name">opencode</span>
            {#if goRows.length > 0}
              <span class="plan">· Go</span>
            {/if}
            {#if go?.reading.stale}
              <span class="age">{readAgo(go.reading.fetchedAt, now)}</span>
            {/if}
          </header>
          {@render windows(goRows)}
          {#if showSpend && spend}
            <p class="spend">
              <span class="label">Spend</span>
              <span class="num figures"
                >{money(spend.today)}
                today · {money(spend.week)} this week ·
                {money(spend.all)}
                all time</span
              >
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

{#if loginFor}
  <MachineLogin machine={loginFor} bind:open={loginOpen} />
{/if}

{#snippet windows(rows: Row[])}
  {#each rows as row (row.key)}
    {@const m = row.meter}
    {@const note = row === lead ? '' : projectionNote(m)}
    <div class="row" data-state={m.state}>
      <span class="label">{row.label}</span>
      <span class="bar">
        <LimitBar
          elapsed={m.elapsed}
          label={row.label}
          state={m.state}
          used={m.used}
        />
      </span>
      <span class="used num">
        {#if m.state === 'near'}
          <Attention aria-label="Near the limit" class="status" />
        {:else if m.state === 'over' || m.state === 'reached'}
          <Failed
            aria-label={m.state === 'reached' ? 'Limit reached' : 'Nearly at the limit'}
            class="status"
          />
        {/if}
        {Math.round(m.used)}%
      </span>
      <span class="resets"
        >{m.runsOutIn !== null && note ? `${note} · ` : ''}{resetText(m)}</span
      >
    </div>
  {/each}
{/snippet}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .headline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
  .pct {
    font: var(--type-kpi);
    color: var(--ink-strong);
  }
  .of {
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .sentence {
    font: var(--type-body);
    color: var(--ink-strong);
  }

  /* Every provider's windows on one grid, so the bars, percents and resets
     line up down the whole block; each row takes the columns (subgrid). */
  .windows {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr) 4.5rem max-content;
    column-gap: var(--space-3);
    row-gap: var(--space-1);
  }
  .group {
    display: contents;
  }
  .provider {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-block-end: var(--space-1);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .group + .group .provider {
    padding-block-start: var(--space-3);
  }
  .glyph {
    display: inline-flex;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-muted);
  }
  .plan {
    color: var(--ink-muted);
    font-weight: var(--weight-body);
  }
  .age {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  /* One window: name, bar, used, reset, on one line; a phone stacks it. */
  .row {
    --row-paint: var(--surface-raised);
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    margin-inline: calc(-1 * var(--space-2));
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--row-paint);
  }
  /* Near and over rows get a faint wash and nothing else (owner pick):
     the fill and the glyph carry the colour, the words stay in ink. */
  .row[data-state="near"] {
    --row-paint:
      linear-gradient(var(--meter-wash-near), var(--meter-wash-near)),
      var(--surface-raised);
  }
  .row[data-state="over"],
  .row[data-state="reached"] {
    --row-paint:
      linear-gradient(var(--meter-wash-over), var(--meter-wash-over)),
      var(--surface-raised);
  }
  .label {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .used {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* Extra usage's money stands at the bar's tip, across the percent and
     reset columns: "$12.40 of $330". */
  .amount {
    grid-column: 3 / -1;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .used :global(.status),
  .amount :global(.status) {
    inline-size: 16px;
    block-size: 16px;
  }
  .row[data-state="near"] :global(.status) {
    color: var(--meter-near);
  }
  .row[data-state="over"] :global(.status),
  .row[data-state="reached"] :global(.status) {
    color: var(--meter-over);
  }
  .resets {
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  .unknown {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .spend {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: baseline;
    padding-block: var(--space-2);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .spend .figures {
    grid-column: 2 / -1;
  }

  @media (max-width: 639px) {
    .card {
      padding: var(--space-4);
    }
    .windows {
      grid-template-columns: minmax(0, 1fr);
    }
    .spend {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
    }
    .spend .figures {
      grid-column: 1;
    }
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--space-3);
      grid-template-areas:
        "label used"
        "bar bar"
        "resets resets";
      row-gap: var(--space-1);
    }
    .row > .label {
      grid-area: label;
    }
    .row > .used {
      grid-area: used;
    }
    .row > .bar {
      grid-area: bar;
    }
    .row > .resets {
      grid-area: resets;
    }
    .row > .amount {
      grid-area: resets;
    }
    .spend .label {
      min-inline-size: 0;
    }
  }
</style>
