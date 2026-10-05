<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  /**
   * Everything else that can be opened — every session no other home list
   * shows, each with its delegates in its tree, and the transcripts stored
   * on the machines — behind one disclosure, with search.
   * On the phone it closes the home; in the wide rail it sits under
   * Projects, so the projects come straight after what is live.
   */
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconChevronRight, IconSearch } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { page } from "$app/state";
  import { cawco, type InstanceRow } from "../client.svelte";
  import { conversationHref } from "../links";
  import { echoBeat } from "../motion/echo.svelte";
  import { holdWhileInside } from "../motion/held-order.svelte";
  import { runningWords } from "../older";
  import SessionRow, { ROW_PILL } from "../SessionRow.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import {
    clock,
    home,
    instanceTitle,
    lastAt,
    placeOfRow,
  } from "./home-state.svelte";
  import SessionTree from "./SessionTree.svelte";
  import { TreeView } from "./tree-view.svelte";

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
  /**
   * Recent's sessions as the tree every home list draws (tree-view,
   * SessionTree): a session's delegates hang under its row, folded until its
   * mark is pressed. Built only while Recent is open.
   */
  const view = new TreeView(() => (recentOpen ? home.recentLines : []), "home");
  /** The rows the list holds, for each tree to find its own in. */
  const treeRows = $derived(view.folded.map((line) => line.row));
  const recentMatches = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return home.recent;
    }
    const says = (words: string) => words.toLowerCase().includes(needle);
    // A session is found by its own words or by a delegate's under it: a
    // delegate is no row of the list, so its parent's row is where it is.
    return home.recent.filter(
      (item) =>
        says(item.title) ||
        says(item.place) ||
        (view.shapeOf(item.key)?.descendants ?? []).some(
          (row) => says(instanceTitle(row)) || says(placeOfRow(row))
        )
    );
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
      <!-- Closed, the count says what is still live inside, as an "N older"
           row says what it hides (older.ts): nothing else on a closed list
           tells the reader a running session is in it. -->
      <span class="num count">
        <span
          style="display:inline-grid;inline-size:{String(home.recentCount)
            .length}ch"
          ><MorphText text={String(home.recentCount)} /></span
        >
        {#if !recentOpen && home.recentRunning > 0}
          <span class="live"
            ><MorphText text={runningWords(home.recentRunning)} /></span
          >
        {/if}
      </span>
    </button>
    {#if recentOpen}
      <div
        class="recent-body"
        data-flip
        {@attach highlight(ROW_PILL)}
        {@attach echoBeat()}
        {@attach view.keys}
      >
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
        <!-- A session, wherever it stands in a tree: Recent's own row, or a
             delegate under one. A context line is the parent of delegates
             held here, not one of Recent's own: its state and name only. -->
        {#snippet line(
          row: InstanceRow
        )}
          {@const context = view.shapeOf(row.id)?.context ?? false}
          {@const at = lastAt(row)}
          <SessionRow
            active={current === row.id}
            {context}
            fold={view.foldOf(row.id)}
            href={conversationHref(row.id, cawco.instanceIndex)}
            instance={row}
            line={context ? "" : placeOfRow(row)}
            machineId={row.machineId}
            {stale}
            title={instanceTitle(row)}
            trail={!context && at ? formatAgeShort(at, clock.now) : ""}
          />
        {/snippet}
        <ul class="session-tree">
          {#each recentMatches.slice(0, recentListed) as item (item.key)}
            {#if item.instance}
              <SessionTree
                {current}
                {line}
                row={item.instance}
                rows={treeRows}
                {view}
              />
            {:else}
              <li>
                <SessionRow
                  active={current !== null && current === item.info?.sessionId}
                  href={item.href}
                  info={item.info}
                  line={item.place}
                  machineId={item.machineId}
                  {stale}
                  title={item.title}
                  trail={item.at ? formatAgeShort(item.at, clock.now) : ""}
                />
              </li>
            {/if}
          {:else}
            <li class="none">No session matches “{search}”.</li>
          {/each}
        </ul>
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
  /* What a closed Recent still holds live, after its count: the words an
     "N older" row says its failures in, in the header's own muted ink. */
  .live {
    margin-inline-start: 0.3em;
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
