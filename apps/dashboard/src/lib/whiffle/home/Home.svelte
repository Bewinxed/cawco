<script lang="ts">
  /**
   * The home: a status line, a headline, and the sessions grouped by what
   * they want from the operator — Needs you, Working, Finished, Recent.
   * The same list is the phone's home page (`page`) and the wide screen's
   * sidebar (`rail`), where the transcripts take the rest of the screen.
   *
   * What it never does: claim nothing needs you while the hub is not live.
   * Then the rows stay as last known and greyed, there is no headline and
   * no Caw, and the status line says the hub is gone.
   */
  import { untrack } from "svelte";
  import { TextMorph } from "torph/svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconChevronRight, IconPlus, IconSearch } from "$lib/icons";
  import Attention from "~icons/solar/hand-shake-bold-duotone";
  import { whiffle } from "../client.svelte";
  import { conversationHref } from "../links";
  import { crossIn, crossOut, morphMs } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import NewSessionDialog from "../spawn/NewSessionDialog.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import Caw from "./Caw.svelte";
  import HomeRow from "./HomeRow.svelte";
  import {
    clock,
    home,
    instanceTitle,
    lastAt,
    placeOf,
    span,
  } from "./home.svelte";
  import NeedsCard from "./NeedsCard.svelte";
  import StatusLine from "./StatusLine.svelte";

  let {
    variant,
    active,
  }: {
    /** `page` is the phone's home; `rail` is the wide screen's sidebar. */
    variant: "page" | "rail";
    /** Whether this home is the one on screen (it answers `?spawn=`). */
    active: boolean;
  } = $props();

  const stale = $derived(!home.live);
  /** The conversation in front, for the rail to mark. */
  const current = $derived(
    page.url.pathname.startsWith("/session") ? workspace.activeSessionId : null
  );
  const quiet = $derived(
    home.live && home.needs.length === 0 && home.working.length === 0
  );
  const hasSessions = $derived(
    home.working.length + home.finished.length + home.recent.length > 0
  );

  /* ── Recent ─────────────────────────────────────────────────────────── */

  const RECENT_PAGE = 30;
  const RECENT_KEY = "cawco-home-recent-open";
  let recentOpen = $state(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(RECENT_KEY) === "true"
  );
  let search = $state("");
  let recentShown = $state(RECENT_PAGE);
  const recentMatches = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? home.recent.filter(
          (item) =>
            item.title.toLowerCase().includes(needle) ||
            item.place.toLowerCase().includes(needle)
        )
      : home.recent;
  });
  function toggleRecent() {
    recentOpen = !recentOpen;
    localStorage.setItem(RECENT_KEY, String(recentOpen));
  }

  /* ── Start session ──────────────────────────────────────────────────── */

  let spawnOpen = $state(false);
  let spawnPrefill = $state<{ machineId?: string; cwd?: string } | undefined>(
    undefined
  );

  // "Spawn here" from anywhere in the app arrives as `?spawn=<machine>` on
  // `/session`; consumed once and cleared, so a reload is not a second spawn.
  $effect(() => {
    if (!active) {
      return;
    }
    const machineId = page.url.searchParams.get("spawn");
    if (!machineId) {
      return;
    }
    untrack(() => {
      spawnPrefill = {
        machineId,
        cwd: page.url.searchParams.get("cwd") ?? undefined,
      };
      spawnOpen = true;
      const url = new URL(page.url);
      url.searchParams.delete("spawn");
      url.searchParams.delete("cwd");
      // biome-ignore lint/complexity/noVoid: the dialog is already open; the URL cleanup is a courtesy
      void goto(url, { replaceState: true });
    });
  });

  function start() {
    spawnPrefill = undefined;
    spawnOpen = true;
  }

  /** What a working session is doing now, in one line. */
  function doing(id: string, cwd: string, machineId: string): string {
    const tool = whiffle.currentToolOf(id);
    return tool
      ? `${tool.name} ${tool.glance}`.trim()
      : placeOf(machineId, cwd);
  }
</script>

<!-- Every state change here travels (motion/rows `reflow`): a request
     arriving opens its place while what follows slides down, one leaving
     closes, a session moving from Working to Finished closes in one group
     and opens in the other, a re-sort slides, a group's box follows its
     height, and Caw fades where the groups were. With less motion, only the
     fades run. In the rail the home is one box of the rail's own reflow, so
     the nav under it slides as it grows. -->
<section
  aria-label="Home"
  class="home {variant}"
  data-flip={variant === 'rail' ? 'box' : undefined}
  {@attach reflow()}
>
  <div class="top">
    <!-- The line every other line on this screen is believed by. -->
    <StatusLine />
    {#if home.ready && home.live}
      <h1 class="headline" data-flip>
        {#if home.needs.length > 0}
          <span aria-hidden="true" class="spark" data-flip="pop"
            ><Attention /></span
          >
        {/if}
        <TextMorph
          as="span"
          duration={morphMs()}
          text={home.needs.length > 0
            ? `${home.needs.length} need${home.needs.length === 1 ? 's' : ''} you`
            : 'Nothing needs you'}
        />
      </h1>
    {/if}
  </div>

  <!-- The skeleton stands at the list's place until the first read is in,
       then the list cross-fades in over it as it leaves. -->
  {#if !home.ready}
    <div
      aria-busy="true"
      aria-label="Reading the fleet"
      class="loading"
      role="status"
      out:crossOut
    >
      {#each [0, 1, 2, 3] as row (row)}
        <Skeleton class="h-11 w-full" />
      {/each}
    </div>
  {:else}
    <div class="groups" in:crossIn>
      {#if home.needs.length > 0}
        <section
          aria-labelledby="needs-{variant}"
          class="group"
          data-flip="box"
        >
          <h2 class="label" id="needs-{variant}">
            <span aria-hidden="true" class="spark-ink"><Attention /></span>
            Needs you
            <span class="num count">{home.needs.length}</span>
          </h2>
          <div class="cards">
            {#each home.needs as item (item.key)}
              <NeedsCard {item} {stale} />
            {/each}
          </div>
        </section>
      {/if}

      {#if home.working.length > 0}
        <section
          aria-labelledby="working-{variant}"
          class="group"
          data-flip="box"
        >
          <h2 class="label" id="working-{variant}">
            Working <span class="num count">{home.working.length}</span>
          </h2>
          {#each home.working as row (row.id)}
            {@const since = whiffle.turnSince(row.id)}
            <HomeRow
              active={current === row.id}
              href={conversationHref(row.id, whiffle.instanceIndex)}
              instance={row}
              line={doing(row.id, row.cwd, row.machineId)}
              machineId={row.machineId}
              {stale}
              title={instanceTitle(row)}
              trail={since ? span(clock.now - since) : ''}
            />
          {/each}
        </section>
      {/if}

      {#if home.finished.length > 0}
        <section
          aria-labelledby="finished-{variant}"
          class="group"
          data-flip="box"
        >
          <h2 class="label" id="finished-{variant}">
            Finished <span class="num count">{home.finished.length}</span>
          </h2>
          {#each home.finished as row (row.id)}
            <HomeRow
              active={current === row.id}
              href={conversationHref(row.id, whiffle.instanceIndex)}
              instance={row}
              line={placeOf(row.machineId, row.cwd)}
              machineId={row.machineId}
              quiet
              {stale}
              title={instanceTitle(row)}
              trail={span(clock.now - lastAt(row))}
            />
          {/each}
        </section>
      {/if}

      {#if quiet}
        <!-- Caw only when nothing asks and nothing works, with the hub live. -->
        <figure class="caw" data-flip>
          <Caw pose="ready" size={variant === 'rail' ? 112 : 160} />
          <figcaption>
            {hasSessions ? 'All quiet.' : 'Your sessions will land here.'}
          </figcaption>
        </figure>
      {/if}

      {#if home.recent.length > 0}
        <section class="group recent" data-flip="box">
          <button
            aria-expanded={recentOpen}
            class="disclosure press-tint focus-inset"
            onclick={toggleRecent}
            type="button"
          >
            <span class="chev" class:open={recentOpen}
              ><IconChevronRight /></span
            >
            Recent
            <span class="num count">{home.recent.length}</span>
          </button>
          {#if recentOpen}
            <div class="recent-body" data-flip>
              <label class="search touch-hit">
                <IconSearch aria-hidden="true" />
                <input
                  aria-label="Search recent sessions"
                  oninput={() => {
                    recentShown = RECENT_PAGE;
                  }}
                  placeholder="Search sessions…"
                  type="search"
                  bind:value={search}
                >
              </label>
              {#each recentMatches.slice(0, recentShown) as item (item.key)}
                <HomeRow
                  active={current !== null && (current === item.instance?.id || current === item.info?.sessionId)}
                  href={item.href}
                  info={item.info}
                  instance={item.instance}
                  line={item.place}
                  machineId={item.machineId}
                  {stale}
                  title={item.title}
                  trail={item.at ? span(clock.now - item.at) : ''}
                />
              {:else}
                <p class="none">No session matches “{search}”.</p>
              {/each}
              {#if recentMatches.length > recentShown}
                <Button
                  class="self-start"
                  label="Show {Math.min(RECENT_PAGE, recentMatches.length - recentShown)} more"
                  onclick={() => {
                    recentShown += RECENT_PAGE;
                  }}
                  size="sm"
                  variant="outline"
                />
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}

  {#if variant === 'page'}
    <!-- The phone's thumb reaches the bottom; Start session lives there. -->
    <div class="dock">
      <Button class="w-full" onclick={start} size="lg">
        <IconPlus />
        Start session
      </Button>
    </div>
  {/if}
</section>

<NewSessionDialog
  onclose={() => {
    spawnOpen = false;
  }}
  open={spawnOpen}
  prefill={spawnPrefill}
/>

<style>
  .home {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .home.page {
    flex: 1 1 auto;
    overflow-y: auto;
    background: var(--surface-recess);
  }
  /* In the rail it is one block of the rail's own scroller, at its full
     height: the rail scrolls, the home does not shrink into it. */
  .home.rail {
    flex: none;
    border-bottom: 1px solid var(--border-hairline);
    margin-bottom: var(--space-1);
  }
  .top {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .page .top {
    padding: var(--space-5) var(--space-5) var(--space-3);
  }
  .rail .top {
    padding: var(--space-2) var(--space-3) var(--space-1);
  }
  .headline {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
  }
  .rail .headline {
    font: var(--type-label);
    font-size: var(--text-body);
  }
  /* The one spark on the screen: needs you is the loudest thing here. */
  .spark {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--radius-sm);
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .rail .spark {
    inline-size: 22px;
    block-size: 22px;
    border-radius: var(--radius-xs);
  }
  .spark :global(svg) {
    width: 16px;
    height: 16px;
  }
  .loading,
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .page .loading,
  .page .groups {
    padding: var(--space-2) var(--space-5) var(--space-7);
  }
  .rail .loading,
  .rail .groups {
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2) var(--space-2);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0 0 var(--space-1);
    padding-inline: var(--space-3);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .label :global(svg) {
    width: 16px;
    height: 16px;
  }
  .spark-ink {
    display: inline-flex;
    color: var(--status-attn-ink);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .disclosure {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 36px;
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: var(--type-label);
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  @media (hover: hover) and (pointer: fine) {
    .disclosure:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .chev {
    display: inline-flex;
  }
  .chev :global(svg) {
    width: 12px;
    height: 12px;
  }
  @media (prefers-reduced-motion: no-preference) {
    .chev {
      transition: rotate var(--dur-control) var(--ease-out);
    }
  }
  .chev.open {
    rotate: 90deg;
  }
  .recent-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--c-input-h);
    margin: var(--space-1) 0 var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--ink-muted);
  }
  .search :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .search:has(input:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .search input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: none;
    font: var(--type-body);
    color: var(--ink-strong);
    outline: none;
  }
  .none {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .caw {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-4) 0;
  }
  .caw figcaption {
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .dock {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: var(--space-3) var(--space-5)
      calc(var(--space-3) + env(safe-area-inset-bottom));
    background: linear-gradient(
      transparent,
      var(--surface-recess) var(--space-4)
    );
  }
</style>
