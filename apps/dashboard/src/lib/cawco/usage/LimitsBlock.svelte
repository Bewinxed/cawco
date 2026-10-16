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
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconKey, IconRefresh } from "#lib/icons.js";
  import ClaudeIcon from "~icons/logos/claude-icon";
  import AccountName from "../accounts/AccountName.svelte";
  import { cawco, type InstanceRow } from "../client.svelte";
  import OpenCodeLogo from "../OpenCodeLogo.svelte";
  import { claudeGap, money, speakingReading } from "../usage";
  import Figure from "./Figure.svelte";
  import { startForecast, usage } from "./forecast.svelte";
  import Rings from "./Rings.svelte";
  import RingsKey from "./RingsKey.svelte";
  import {
    delegateTip,
    leadSentence,
    nameFields,
    openCodeFigure,
    openCodeSentence,
    type Part,
    type RingAccount,
    stopFigure,
    type TileFigure,
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
  const read = $derived(usage.staged || (usage.read && cawco.usageLimitsRead));

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

  /**
   * The lead: Claude's answer, or opencode's when it is the only plan, in
   * the popover's words; at opencode's limit, the refresh mark and how long
   * until it's back.
   */
  const lead = $derived.by(
    (): { back: boolean; figure: string; of: string; say: Part[] } | null => {
      if (claude) {
        const stop = stopFigure(claude, now);
        return {
          back: stop.back,
          figure: stop.figure,
          of: stop.of,
          say: leadSentence(claude, now),
        };
      }
      if (openCode) {
        const go = openCodeFigure(openCode, now);
        return {
          back: go.back,
          figure: go.figure,
          of: go.back ? "until it’s back" : go.label,
          say: openCodeSentence(openCode, now),
        };
      }
      return null;
    }
  );

  const titleOf = (row: InstanceRow) =>
    row.title ?? row.derivedTitle ?? "untitled session";
  const projectOf = (row: InstanceRow) =>
    row.projectId ? (cawco.project(row.projectId)?.name ?? null) : null;
  const tokens = (row: InstanceRow) => {
    const count = row.keepAlive?.contextTokens;
    return count ? `${Math.round(count / 1000)}k` : "";
  };
</script>

{#snippet running(ring: RingAccount)}
  <div class="running">
    {#if ring.sessions.length > 0}
      <span class="heading"
        >Running
        <span data-slot="count" class="count mono-figure"
          >{ring.sessions.length}</span
        ></span
      >
      <div data-slot="sessions" class="sessions">
        {#each ring.sessions as row (row.id)}
          {@const project = projectOf(row)}
          <div data-slot="session" class="session">
            <span data-slot="what" class="what"
              >{#if project}
                <span data-slot="project" class="project">{project}</span>
              {/if}
              {titleOf(row)}</span
            >
            <span class="tokens mono-figure">{tokens(row)}</span>
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
  figure: TileFigure,
  say: Part[]
)}
  <div
    data-slot="tile"
    class="tile"
    data-account={ring.id}
    data-tile
    class:limit={ring.state === "limit"}
  >
    <div data-slot="head" class="head">
      <span data-slot="dot" class="dot" style:--c={ring.color}></span>
      <AccountName account={nameFields(ring)} wrap />
    </div>
    <div data-slot="mark" class="mark">
      <Rings {index} reveal {ring} size={56} />
      <span class="figure">
        <span
          data-slot="value"
          class="value"
          class:muted={ring.state === "limit" || ring.state === "stale"}
          >{#if figure.back}
            <span aria-hidden="true" class="back-glyph"><IconRefresh /></span>
          {/if}
          <Figure text={figure.figure} /></span
        >
        <small>{figure.label}</small>
      </span>
    </div>
    <p class="say" data-status><Words parts={say} /></p>
    <RingsKey {ring} />
    {@render running(ring)}
  </div>
{/snippet}

<section
  data-slot="limits-block-card"
  aria-labelledby="limits-title"
  class="card"
>
  <h2 data-slot="title" class="title" id="limits-title">Limits</h2>

  {#if !read}
    <div class="loading" data-slot="skeleton-rows">
      <Skeleton class="h-7 w-24" />
      <Skeleton class="h-icon-md w-3/4" />
      <div data-slot="grid" class="grid">
        {#each [0, 1, 2] as one (one)}
          <Skeleton class="h-48 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    {#if lead}
      <div data-slot="lead" class="lead">
        <p class="big">
          <span
            data-slot="num"
            class="kpi num"
            data-lead-figure
            class:muted={claude?.stale}
            >{#if lead.back}
              <span aria-hidden="true" class="back-glyph"><IconRefresh /></span>
            {/if}
            <Figure text={lead.figure} /></span
          >
          <span class="of">{lead.of}</span>
        </p>
        <p data-slot="sentence" class="sentence" data-lead>
          <Words parts={lead.say} />
        </p>
      </div>
    {/if}

    <div class="provider mark-line">
      <span data-slot="glyph" aria-hidden="true" class="glyph" data-box
        ><ClaudeIcon /></span
      >
      <span data-slot="name" class="name">Claude</span>
      {#if claude?.delegate}
        {@const why = delegateTip(claude, claude.delegate)}
        <!-- Where new delegates go; why, on a rest or a tap, in placement's
             own terms, so the line holds one line on a phone. -->
        <Tip label={why} side="bottom" tap>
          {#snippet children(props)}
            <span
              {...props}
              aria-label="Delegates go to {claude.delegate?.name}. {why}"
              class="right"
              data-delegates
              role="img"
              ><Words
                parts={[
                  "Delegates go to ",
                  { strong: claude.delegate?.name ?? "" },
                ]}
              /></span
            >
          {/snippet}
        </Tip>
      {/if}
    </div>
    {#if claude}
      <div data-slot="grid" class="grid">
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
        <p class="line">
          <span data-slot="limits-block-label" class="label">Extra usage</span
          >{extraText}
        </p>
      {/if}
    {:else if claudeUnknown}
      <div class="unknown">
        <p>{claudeUnknown.reason}</p>
        {#if claudeUnknown.signIn}
          <Button
            href="/config/accounts"
            icon={IconKey}
            label="Sign in an account"
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
    {/if}

    {#if openCode || (spend && spend.all > 0)}
      <div class="provider mark-line">
        <span data-slot="glyph" aria-hidden="true" class="glyph" data-box
          ><OpenCodeLogo /></span
        >
        <span data-slot="name" class="name">opencode Go</span>
      </div>
      {#if openCode}
        <div data-slot="grid" class="grid">
          {@render tile(
            openCode,
            0,
            openCodeFigure(openCode, now),
            openCodeSentence(openCode, now)
          )}
        </div>
      {/if}
      {#if spend && spend.all > 0}
        <p class="line">
          <span data-slot="limits-block-label" class="label">Spend</span><span
            ><span class="mono-figure">{money(spend.today)}</span>
            today, <span class="mono-figure">{money(spend.week)}</span>
            this week,
            <span class="mono-figure">{money(spend.all)}</span>
            all time</span
          >
        </p>
      {/if}
    {/if}
  {/if}
</section>

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
    color: var(--ink-strong);
  }
  /* At its limit the figure says how long until it's back, after the
     refresh mark the popover's cell uses: Solar duotone, at the figure's
     cap height, muted. */
  .back-glyph {
    display: inline-grid;
    margin-inline-end: 0.25em;
    vertical-align: -0.1em;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 0.8em;
      block-size: 0.8em;
    }
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
    white-space: nowrap;
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
    & .tokens {
      flex: none;
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
