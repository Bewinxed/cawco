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
  <div class="flex flex-col gap-space-1">
    {#if ring.sessions.length > 0}
      <span class="type-meta font-medium text-ink-muted"
        >Running
        <span data-slot="count" class="mono-figure ms-space-1"
          >{ring.sessions.length}</span
        ></span
      >
      <div data-slot="sessions" class="flex flex-col gap-space-row">
        {#each ring.sessions as row (row.id)}
          {@const project = projectOf(row)}
          <!-- literal: 5px, 8px -->
          <div
            data-slot="session"
            class="type-meta flex justify-between gap-space-4 rounded-sm bg-surface-raised px-(--pad-x) py-(--pad-y) text-ink-row"
            style:--pad-x="8px"
            style:--pad-y="5px"
          >
            <span data-slot="what" class="min-w-0 truncate"
              >{#if project}
                <span data-slot="project" class="text-ink-muted">{project}</span
                >
              {/if}
              {titleOf(row)}</span
            >
            <span class="mono-figure flex-none text-ink-muted"
              >{tokens(row)}</span
            >
          </div>
        {/each}
      </div>
    {:else}
      <span class="type-meta px-0 py-space-row text-ink-muted"
        >No sessions running</span
      >
    {/if}
  </div>
{/snippet}

{#snippet tile(
  ring: RingAccount,
  index: number,
  figure: TileFigure,
  say: Part[]
)}
  <!-- literal: 8px, 50%, 3px -->
  <div
    data-slot="tile"
    class="flex min-w-0 flex-col gap-space-3 rounded-md bg-surface-recess p-space-4 transition-[background-color] dur-fade ease-out data-limit:bg-meter-wash-over motion-reduce:transition-none"
    data-account={ring.id}
    data-limit={ring.state === "limit" || undefined}
    data-tile
    style:--ring-ground={ring.state === "limit"
      ? "var(--meter-wash-over)"
      : undefined}
  >
    <div data-slot="head" class="flex min-w-0 items-center gap-space-2">
      <span
        data-slot="dot"
        class="size-(--dot) flex-none rounded-(--dot-r) bg-(color:--c)"
        style:--c={ring.color}
        style:--dot="8px"
        style:--dot-r="50%"
      ></span>
      <AccountName account={nameFields(ring)} wrap />
    </div>
    <div data-slot="mark" class="flex items-center gap-space-4">
      <Rings {index} reveal {ring} size={56} />
      <span
        class="flex min-w-0 flex-col gap-(--figure-gap)"
        style:--figure-gap="3px"
      >
        <span
          data-slot="value"
          class="type-title num text-ink-strong data-muted:text-ink-muted"
          data-muted={ring.state === "limit" || ring.state === "stale"
            ? true
            : undefined}
          >{#if figure.back}
            <!-- literal: 0.25em, -0.1em, 0.8em -->
            <span
              aria-hidden="true"
              class="me-(--glyph-gap) inline-grid align-(--glyph-lift) text-ink-muted"
              style:--glyph-gap="0.25em"
              style:--glyph-lift="-0.1em"
              style:--glyph-size="0.8em"
              ><IconRefresh class="size-(--glyph-size)" /></span
            >
          {/if}
          <Figure text={figure.figure} /></span
        >
        <small class="type-meta text-ink-muted">{figure.label}</small>
      </span>
    </div>
    <p class="m-0 type-body text-ink-row" data-status><Words parts={say} /></p>
    <RingsKey {ring} />
    {@render running(ring)}
  </div>
{/snippet}

<section
  data-slot="limits-block-card"
  aria-labelledby="limits-title"
  class="flex flex-col gap-space-5 rounded-lg bg-surface-raised p-space-6 shadow-tile max-phone:p-space-4"
  style:--ring-ground="var(--surface-recess)"
>
  <h2 data-slot="title" class="type-label text-ink-muted" id="limits-title">
    Limits
  </h2>

  {#if !read}
    <div class="flex flex-col gap-space-3" data-slot="skeleton-rows">
      <Skeleton class="h-7 w-24" />
      <Skeleton class="h-icon-md w-3/4" />
      <!-- literal: 15.5rem -->
      <div
        data-slot="grid"
        class="grid grid-cols-(--tiles) gap-space-3"
        style:--tiles="repeat(auto-fill, minmax(15.5rem, 1fr))"
      >
        {#each [0, 1, 2] as one (one)}
          <Skeleton class="h-48 w-full" />
        {/each}
      </div>
    </div>
  {:else}
    {#if lead}
      <!-- literal: 6px -->
      <div
        data-slot="lead"
        class="flex flex-col gap-(--lead-gap)"
        style:--lead-gap="6px"
      >
        <!-- literal: 10px -->
        <p
          class="flex flex-wrap items-baseline gap-(--big-gap)"
          style:--big-gap="10px"
        >
          <!-- literal: -0.02em, 0.25em, -0.1em, 0.8em -->
          <span
            data-slot="num"
            class="type-kpi num tracking-(--kpi-track) text-ink-strong data-muted:text-ink-muted"
            data-lead-figure
            data-muted={claude?.stale || undefined}
            style:--kpi-track="-0.02em"
            >{#if lead.back}
              <span
                aria-hidden="true"
                class="me-(--glyph-gap) inline-grid align-(--glyph-lift) text-ink-muted"
                style:--glyph-gap="0.25em"
                style:--glyph-lift="-0.1em"
                style:--glyph-size="0.8em"
                ><IconRefresh class="size-(--glyph-size)" /></span
              >
            {/if}
            <Figure text={lead.figure} /></span
          >
          <span class="type-body text-ink-muted">{lead.of}</span>
        </p>
        <!-- literal: 60ch -->
        <p
          data-slot="sentence"
          class="type-body max-w-(--measure) text-ink-row"
          data-lead
          style:--measure="60ch"
        >
          <Words parts={lead.say} />
        </p>
      </div>
    {/if}

    <!-- literal: 8px -->
    <div
      class="mark-line type-label flex items-center gap-(--provider-gap) text-ink-strong"
      style:--provider-gap="8px"
    >
      <span
        data-slot="glyph"
        aria-hidden="true"
        class="inline-flex size-icon-md"
        data-box><ClaudeIcon class="size-full" /></span
      >
      <span data-slot="name">Claude</span>
      {#if claude?.delegate}
        {@const why = delegateTip(claude, claude.delegate)}
        <!-- Where new delegates go; why, on a rest or a tap, in placement's
             own terms, so the line holds one line on a phone. -->
        <Tip label={why} side="bottom" tap>
          {#snippet children(props)}
            <span
              {...props}
              aria-label="Delegates go to {claude.delegate?.name}. {why}"
              class="type-meta ms-auto whitespace-nowrap text-ink-muted"
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
      <!-- literal: 15.5rem -->
      <div
        data-slot="grid"
        class="grid grid-cols-(--tiles) gap-space-3"
        style:--tiles="repeat(auto-fill, minmax(15.5rem, 1fr))"
      >
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
        <p class="type-body flex gap-space-3 text-ink-row">
          <span
            data-slot="limits-block-label"
            class="type-label text-ink-strong">Extra usage</span
          >{extraText}
        </p>
      {/if}
    {:else if claudeUnknown}
      <div
        class="type-body flex flex-wrap items-center gap-space-3 text-ink-muted"
      >
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
      <!-- literal: 8px -->
      <div
        class="mark-line type-label flex items-center gap-(--provider-gap) text-ink-strong"
        style:--provider-gap="8px"
      >
        <span
          data-slot="glyph"
          aria-hidden="true"
          class="inline-flex size-icon-md"
          data-box><OpenCodeLogo /></span
        >
        <span data-slot="name">opencode Go</span>
      </div>
      {#if openCode}
        <!-- literal: 15.5rem -->
        <div
          data-slot="grid"
          class="grid grid-cols-(--tiles) gap-space-3"
          style:--tiles="repeat(auto-fill, minmax(15.5rem, 1fr))"
        >
          {@render tile(
            openCode,
            0,
            openCodeFigure(openCode, now),
            openCodeSentence(openCode, now)
          )}
        </div>
      {/if}
      {#if spend && spend.all > 0}
        <p class="type-body flex gap-space-3 text-ink-row">
          <span
            data-slot="limits-block-label"
            class="type-label text-ink-strong">Spend</span
          ><span
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
  /* residual: foreign-dom */
  [data-slot="glyph"] :global(svg) {
    inline-size: 100%;
    block-size: 100%;
  }
</style>
