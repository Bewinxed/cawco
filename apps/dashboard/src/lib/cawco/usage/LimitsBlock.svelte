<script lang="ts">
  /**
   * The page's lead, as Rings: can you keep going, on which account, what
   * happens when it runs out, and when an account is back. It leads with
   * the time until nothing can carry your new sessions and that in one
   * sentence; then one tile per Claude account in carrying order, each its
   * double dial (the disc its 5-hour window, the rim its week, filled with
   * what is left), its figure, a sentence, its key and the sessions running
   * on it; then opencode's plan the same way.
   *
   * Live: the forecast is read whenever the hub says an account moved
   * (usage/forecast.svelte.ts), and the words move on once a minute.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconKey } from "#lib/icons.js";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import AccountName from "../accounts/AccountName.svelte";
  import { cawco, type InstanceRow, type Machine } from "../client.svelte";
  import MachineLogin from "../MachineLogin.svelte";
  import OpenCodeLogo from "../OpenCodeLogo.svelte";
  import { claudeGap, money, speakingReading } from "../usage";
  import Figure from "./Figure.svelte";
  import { startForecast, usage } from "./forecast.svelte";
  import Rings from "./Rings.svelte";
  import RingsKey from "./RingsKey.svelte";
  import {
    leadSentence,
    nameFields,
    openCodeFigure,
    openCodeSentence,
    openCodeStop,
    type Part,
    type RingAccount,
    stopText,
    tileFigure,
    tileSentence,
  } from "./rings";
  import Words from "./Words.svelte";

  $effect(() => {
    startForecast();
  });

  const claude = $derived(usage.claude);
  const openCode = $derived(usage.openCode);
  const now = $derived(usage.now);
  const read = $derived(usage.read && cawco.usageLimitsRead);

  /** The fleet's real spend, the hub's one figure; null while read or failed. */
  const spend = $derived(cawco.spend);

  /** Why there is no Claude tile, and what to do about it (usage.ts `claudeGap`). */
  const claudeUnknown = $derived(
    claude ? null : claudeGap(cawco.claudeLimits, cawco.machines)
  );

  /** Claude's extra usage, as the account's Claude Code last said it. */
  const extra = $derived(
    speakingReading(cawco.claudeLimits)?.reading.extraUsage ?? null
  );
  const extraText = $derived.by(() => {
    if (!extra) {
      return "";
    }
    if (!extra.on) {
      return extra.offReason ? `off: ${extra.offReason}` : "off";
    }
    return extra.inUse ? "on, in use" : "on";
  });

  /** The lead: Claude's answer, or opencode's when it is the only plan. */
  const lead = $derived.by((): { figure: string; say: Part[] } | null => {
    if (claude) {
      return { figure: stopText(claude, now), say: leadSentence(claude, now) };
    }
    if (openCode) {
      return {
        figure: openCodeStop(openCode, now),
        say: openCodeSentence(openCode, now),
      };
    }
    return null;
  });

  const titleOf = (row: InstanceRow) =>
    row.title ?? row.derivedTitle ?? "untitled session";
  const projectOf = (row: InstanceRow) =>
    row.projectId ? (cawco.project(row.projectId)?.name ?? null) : null;
  const tokens = (row: InstanceRow) => {
    const count = row.keepAlive?.contextTokens;
    return count ? `${Math.round(count / 1000)}k` : "";
  };

  let loginFor = $state<Machine | null>(null);
  let loginOpen = $state(false);
</script>

{#snippet running(
  ring: RingAccount
)}
  <div class="running">
    {#if ring.sessions.length > 0}
      <span class="heading"
        >Running <span class="count">{ring.sessions.length}</span></span
      >
      <div class="sessions">
        {#each ring.sessions as row (row.id)}
          {@const project = projectOf(row)}
          <div class="session">
            <span class="what"
              >{#if project}
                <span class="project">{project}</span>
              {/if}
              {titleOf(row)}</span
            >
            <span class="num">{tokens(row)}</span>
          </div>
        {/each}
      </div>
    {:else}
      <span class="none">No sessions running</span>
    {/if}
  </div>
{/snippet}

{#snippet tile(
  ring: RingAccount,
  index: number,
  figure: { figure: string; label: string },
  say: Part[]
)}
  <div
    class="tile"
    data-account={ring.id}
    data-tile
    class:limit={ring.state === "limit"}
  >
    <div class="head">
      <span class="dot" style:--c={ring.color}></span>
      <AccountName account={nameFields(ring)} wrap />
    </div>
    <div class="mark">
      <Rings {index} reveal {ring} size={56} />
      <span class="figure">
        <span
          class="value"
          class:muted={ring.state === "limit" || ring.state === "stale"}
          ><Figure text={figure.figure} /></span
        >
        <small>{figure.label}</small>
      </span>
    </div>
    <p class="say" data-status><Words parts={say} /></p>
    <RingsKey {ring} />
    {@render running(ring)}
  </div>
{/snippet}

<section aria-labelledby="limits-title" class="card">
  <h2 class="title" id="limits-title">Limits</h2>

  {#if !read}
    <div class="loading" data-slot="skeleton-rows">
      <Skeleton class="h-7 w-24" />
      <Skeleton class="h-4 w-3/4" />
      <div class="grid">
        {#each [0, 1, 2] as one (one)}
          <Skeleton class="h-48 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    {#if lead}
      <div class="lead">
        <p class="big">
          <span class="kpi" data-lead-figure class:muted={claude?.stale}
            ><Figure text={lead.figure} /></span
          >
          <span class="of">until you’re stopped</span>
        </p>
        <p class="sentence" data-lead><Words parts={lead.say} /></p>
      </div>
    {/if}

    <div class="provider">
      <span aria-hidden="true" class="glyph"><ClaudeIcon /></span>
      <span class="name">Claude</span>
      {#if claude?.delegate}
        <span class="right" data-delegates
          ><Words
            parts={[
              "Delegates go to ",
              { strong: claude.delegate.name },
              claude.delegateWhy ? ` (${claude.delegateWhy})` : "",
            ]}
          /></span
        >
      {/if}
    </div>
    {#if claude}
      <div class="grid">
        {#each claude.accounts as ring, i (ring.id)}
          {@render tile(
            ring,
            i,
            tileFigure(ring, claude, now),
            tileSentence(ring, claude, now)
          )}
        {/each}
      </div>
      {#if extraText}
        <p class="line"><span class="label">Extra usage</span>{extraText}</p>
      {/if}
    {:else if claudeUnknown}
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
    {/if}

    {#if openCode || (spend && spend.all > 0)}
      <div class="provider">
        <span aria-hidden="true" class="glyph"><OpenCodeLogo /></span>
        <span class="name">opencode Go</span>
      </div>
      {#if openCode}
        <div class="grid">
          {@render tile(
            openCode,
            0,
            openCodeFigure(openCode, now),
            openCodeSentence(openCode, now)
          )}
        </div>
      {/if}
      {#if spend && spend.all > 0}
        <p class="line num">
          <span class="label">Spend</span>{money(spend.today)}
          today,
          {money(spend.week)}
          this week, {money(spend.all)} all time
        </p>
      {/if}
    {/if}
  {/if}
</section>

{#if loginFor}
  <MachineLogin machine={loginFor} bind:open={loginOpen} />
{/if}

<style>
  .card {
    --ring-ground: var(--surface-recess);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
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
    gap: 6px;
  }
  .big {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
  }
  .kpi {
    font: var(--type-kpi);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  .kpi.muted,
  .value.muted {
    color: var(--ink-muted);
  }
  .of {
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .sentence {
    max-inline-size: 60ch;
    font: var(--type-body);
    color: var(--ink-row);
  }
  .provider {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .glyph {
    display: inline-flex;
    inline-size: 16px;
    block-size: 16px;

    & :global(svg) {
      inline-size: 100%;
      block-size: 100%;
    }
  }
  .right {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
    gap: var(--space-3);
  }
  /* A tile: its head, its mark and figure, its sentence, its key, its
     sessions, the groups a step apart. */
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--surface-recess);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .tile.limit {
    background: var(--meter-wash-over);
    --ring-ground: var(--meter-wash-over);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-inline-size: 0;
  }
  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .mark {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-inline-size: 0;

    & small {
      font: var(--type-meta);
      color: var(--ink-muted);
    }
  }
  .value {
    font: var(--type-title);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  .say {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-row);
  }
  .running {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .heading {
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .count {
    margin-inline-start: var(--space-1);
  }
  .sessions {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .session {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    font: var(--type-meta);
    color: var(--ink-row);

    & .what {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    & .num {
      flex: none;
      font-variant-numeric: tabular-nums;
      color: var(--ink-muted);
    }
  }
  .project {
    color: var(--ink-muted);
  }
  .none {
    padding: 2px 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line {
    display: flex;
    gap: var(--space-3);
    font: var(--type-body);
    color: var(--ink-row);

    & .label {
      font: var(--type-label);
      color: var(--ink-strong);
    }
  }
  .unknown {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    font: var(--type-body);
    color: var(--ink-muted);
  }
  @media (max-width: 639px) {
    .card {
      padding: var(--space-4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
</style>
