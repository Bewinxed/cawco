<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { IconChevronRight, IconSearch } from "#lib/icons.js";
  /**
   * Everything else that can be opened — idle and sleeping sessions, and the
   * transcripts stored on the machines — behind one disclosure, with search.
   * On the phone it closes the home; in the wide rail it sits under
   * Projects, so the projects come straight after what is live.
   */
  import { page } from "$app/state";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import HomeRow, { ROW_PILL } from "./HomeRow.svelte";
  import { clock, home, span } from "./home-state.svelte";

  let { inset = false }: { inset?: boolean } = $props();

  const stale = $derived(!home.live);
  const current = $derived(
    page.url.pathname.startsWith("/session") ? workspace.activeSessionId : null
  );

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
  /** Rows listed: the pages shown, and a last lone row rather than "Show 1 more". */
  const recentListed = $derived(
    recentMatches.length - recentShown > 1 ? recentShown : recentMatches.length
  );
  function toggleRecent() {
    recentOpen = !recentOpen;
    localStorage.setItem(RECENT_KEY, String(recentOpen));
  }
</script>

<!-- The count and whether there is anything come from `recentCount`: the
     list itself is built only while it is open. -->
{#if home.ready && home.recentCount > 0}
  <section
    class="recent"
    data-flip="box"
    class:inset={inset}
    {@attach holdWhileInside("home:recent")}
  >
    <button
      aria-expanded={recentOpen}
      class="kit-section-head disclosure press-tint focus-inset"
      onclick={toggleRecent}
      type="button"
    >
      <span class="chev" class:open={recentOpen}><IconChevronRight /></span>
      Recent
      {#key home.recentCount}
        <span class="num count" data-flip="pop">{home.recentCount}</span>
      {/key}
    </button>
    {#if recentOpen}
      <div class="recent-body" data-flip {@attach highlight(ROW_PILL)}>
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
        {#each recentMatches.slice(0, recentListed) as item (item.key)}
          <HomeRow
            active={current !== null &&
              (current === item.instance?.id ||
                current === item.info?.sessionId)}
            href={item.href}
            info={item.info}
            instance={item.instance}
            line={item.place}
            machineId={item.machineId}
            {stale}
            title={item.title}
            trail={item.at ? span(clock.now - item.at) : ""}
          />
        {:else}
          <p class="none">No session matches “{search}”.</p>
        {/each}
        {#if recentMatches.length > recentListed}
          <Button
            class="self-start"
            label="Show {Math.min(
              RECENT_PAGE,
              recentMatches.length - recentShown
            )} more"
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

<style>
  .recent {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .recent.inset {
    padding: var(--space-1) var(--space-2) var(--space-2);
  }
  .disclosure {
    width: 100%;
    min-height: 36px;
    border: 0;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: none;
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
</style>
