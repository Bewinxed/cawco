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
  import { store, stored } from "../storage";
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
  let recentOpen = $state(stored("local", RECENT_KEY) === "true");
  let search = $state("");
  let recentShown = $state(RECENT_PAGE);
  /**
   * Recent's sessions as the tree every home list draws (tree-view,
   * SessionTree): a session's delegates hang under its row, folded until its
   * mark is pressed. Built only while Recent is open.
   */
  const view = new TreeView(
    () => (recentOpen ? home.recentLines : []),
    () => "home-recent"
  );
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
    store("local", RECENT_KEY, String(recentOpen));
  }
</script>

<!-- The count and whether there is anything come from `recentCount`: the
     list itself is built only while it is open. -->
{#if home.ready && home.recentCount > 0}
  <section
    data-slot="recent"
    class="flex flex-col gap-space-row data-inset:px-space-2 data-inset:pt-space-1 data-inset:pb-space-2"
    data-flip="box"
    data-inset={inset || undefined}
    {@attach holdWhileInside("home:recent")}
  >
    <!-- literal: 36px -->
    <button
      data-slot="disclosure"
      aria-expanded={recentOpen}
      class="group/disclosure kit-section-head press-tint focus-inset min-h-(--disclosure-min) w-full cursor-pointer rounded-t-sm border-none border-current bg-transparent transition-control hover:bg-surface-hover hover:text-ink-strong"
      onclick={toggleRecent}
      style:--disclosure-min="36px"
      type="button"
    >
      <span
        data-slot="chev"
        class="inline-flex group-aria-expanded/disclosure:rotate-90 motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-out"
        data-box><IconChevronRight class="size-icon-sm" /></span
      >
      <span>Recent</span>
      <!-- Closed, the count says what is still live inside, as an "N older"
           row says what it hides (older.ts): nothing else on a closed list
           tells the reader a running session is in it. -->
      <span data-num data-slot="count" class="num count" data-box>
        <span
          class="inline-grid w-(--count-w)"
          style:--count-w="{String(home.recentCount).length}ch"
          ><MorphText text={String(home.recentCount)} /></span
        >
        {#if !recentOpen && home.recentRunning > 0}
          <!-- What a closed Recent still holds live, after its count: the
               words an "N older" row says its failures in, in the header's
               own muted ink. -->
          <!-- literal: 0.3em -->
          <span
            data-slot="live"
            class="ms-(--live-gap)"
            style:--live-gap="0.3em"
            ><MorphText text={runningWords(home.recentRunning)} /></span
          >
        {/if}
      </span>
    </button>
    {#if recentOpen}
      <div
        class="flex flex-col gap-space-row"
        data-flip
        {@attach highlight(ROW_PILL)}
        {@attach echoBeat()}
        {@attach view.keys}
      >
        <!-- literal: 1px -->
        <label
          data-slot="search"
          class="touch-hit field-shell mx-0 mt-space-1 mb-space-2 flex h-c-input-h items-center gap-space-2 rounded-md border border-border-control bg-surface-raised px-space-3 text-ink-muted"
          style:--hit-edge="1px"
        >
          <IconSearch aria-hidden="true" class="size-icon-md flex-none" />
          <input
            class="min-w-0 flex-auto border-none border-current bg-transparent type-body text-ink-strong outline-none"
            aria-label="Search recent sessions"
            oninput={() => {
              recentShown = RECENT_PAGE;
            }}
            placeholder="Search sessions…"
            type="search"
            bind:value={search}
          />
        </label>
        <!-- A session, wherever it stands in a tree: Recent's own row, or a
             delegate under one. A context line is the parent of delegates
             held here, not one of Recent's own: its state and name only. -->
        {#snippet line(row: InstanceRow)}
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
        <!-- A list of trees: rows --tree-gap apart, the gap every tree in
             the app keeps (SessionTree's own branches take the same). -->
        <ul
          data-slot="home-recent-session-tree"
          class="m-0 flex list-none flex-col gap-(--tree-gap) p-0"
        >
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
            <li class="m-0 px-space-3 py-space-2 type-meta text-ink-muted"
              >No session matches “{search}”.</li
            >
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

