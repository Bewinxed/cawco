<script lang="ts">
  /**
   * The project page's Decisions tab (PRD §5.8; the approved wireframe A):
   * its decision pages as a 4/2/1 grid of tiles, each saying how far along
   * it is; a tile opens its page in this same pane (DecisionPage), its title
   * and figure flying into the page's head, and ‹ Decisions goes back. When
   * the decisions form a graph, a List | Graph segment at the pane's top
   * shows them as one (DecisionGraph). Empty, Caw stands over a starter that
   * asks him for a page in his panel (Empty Starts Work); while the list is read, the grid's
   * skeleton stands (The Claim Of Nothing Rule). The page, the card and the
   * mode live in the URL.
   */
  import type { DecisionGraph as Graph } from "@cawco/core/decisions";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { depart } from "#lib/cawco/motion/share.svelte.js";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import CawStarters from "#lib/cawco/project/CawStarters.svelte";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import type { ProjectStarter, StageKind } from "#lib/cawco/project-tasks.js";
  import { newSession } from "#lib/cawco/spawn/new-session.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import DecisionPage from "./DecisionPage.svelte";
  import DecisionTile from "./DecisionTile.svelte";
  import type { DecisionsMode, ProjectDecisions } from "./decisions.svelte";
  import { placeDecisionCards, readDecisionGraph } from "./decisions-api";
  import DecisionGraph from "./graph/DecisionGraph.svelte";

  let {
    projectId,
    projectName,
    decisions,
    page,
    card,
    mode,
    canTalk,
    lead,
    now,
    hrefOf,
    taskOf,
    taskHref,
    onopentask,
    sitDown,
    starters,
    go,
  }: {
    projectId: string;
    projectName: string;
    decisions: ProjectDecisions;
    /** The page open in the pane; null: the list. */
    page: string | null;
    /** The card the open page is scrolled to. */
    card: string | null;
    mode: DecisionsMode;
    /** Caw can start: the empty tab offers him the ask. */
    canTalk: boolean;
    lead: CawLead;
    now: number;
    /** This tab's address for a page, card and mode. */
    hrefOf: (to: {
      card?: string | null;
      mode?: DecisionsMode;
      page?: string | null;
    }) => string;
    taskOf: (
      id: string
    ) => { kind: StageKind | null; title: string } | undefined;
    taskHref: (id: string) => string;
    onopentask: (id: string) => void;
    /** Caw standing here departs into the head's seat as he leaves. */
    sitDown: (node: HTMLElement) => TransitionConfig;
    /**
     * What the empty tab offers to ask him: the project's open choices,
     * written for it (hub project-starters.ts), in the hub's order.
     */
    starters: ProjectStarter[];
    /** Where the pane goes: a page (at a card), the list or the graph, kept in the URL. */
    go: (to: {
      card?: string | null;
      mode?: DecisionsMode;
      page?: string | null;
    }) => void;
  } = $props();

  const list = $derived(decisions.list);
  const pages = $derived(list?.pages ?? []);
  const graphed = $derived(!!list?.graph);
  /** List or graph: the graph only while the decisions form one. */
  const view = $derived<DecisionsMode>(graphed ? mode : "list");
  const shown = $derived(page ? `page:${page}` : view);
  const empty = $derived(list !== null && pages.length === 0);

  // --- the swap ------------------------------------------------------------------------

  /** List, page and graph swap as the project's views do (motion/list-swap). */
  const swap = new ListSwap<never>();
  const order = (key: string): number => {
    if (key.startsWith("page:")) {
      return 2;
    }
    return key === "graph" ? 1 : 0;
  };
  let was = untrack(() => shown);
  $effect.pre(() => {
    const next = shown;
    if (next !== was) {
      untrack(() => swap.swap([], order(next) >= order(was) ? 1 : -1));
      was = next;
    }
  });
  function leave(node: HTMLElement): TransitionConfig {
    node.style.position = "absolute";
    node.style.inset = "0 0 auto";
    node.style.pointerEvents = "none";
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    node.style.animation = swap.leaveAnim(0);
    return { duration: motionOk.current ? ListSwap.leaveEnd(0) : 0 };
  }

  /** A tile pressed: its title and figure take off for the page's head. */
  function open(name: string, tile: HTMLElement) {
    for (const piece of tile.querySelectorAll<HTMLElement>("[data-share]")) {
      depart(piece);
    }
    go({ page: name, card: null });
  }

  /** ‹ Decisions: the head's title and figure go back into their tile. */
  let pane = $state<HTMLDivElement | null>(null);
  function back() {
    for (const piece of pane?.querySelectorAll<HTMLElement>(
      '[data-slot="page-head"] [data-share]'
    ) ?? []) {
      depart(piece);
    }
    go({ page: null, card: null });
  }

  // --- the graph ----------------------------------------------------------------------

  let graph = $state<Graph | null>(null);
  let graphProblem = $state<string | null>(null);
  $effect(() => {
    const _moves = cawco.decisionsChangedOf(projectId);
    if (view !== "graph" || page) {
      return;
    }
    let live = true;
    readDecisionGraph(projectId)
      .then((read) => {
        if (live) {
          graph = read;
          graphProblem = null;
        }
      })
      .catch((error: unknown) => {
        if (live) {
          graphProblem = failureWords(error);
        }
      });
    return () => {
      live = false;
    };
  });
  function place(places: { id: string; x: number; y: number }[]) {
    placeDecisionCards(projectId, places).catch((error: unknown) => {
      graphProblem = `Its places weren't saved: ${failureWords(error)}`;
    });
  }
</script>

<div
  data-slot="decisions"
  bind:this={pane}
  class="group/decisions @container/decisions relative flex min-h-0 flex-auto flex-col"
  data-mode={page ? "page" : view}
  style:--seg-h="36px"
>
  {#if graphed && !page}
    <div data-slot="seg-row" class="absolute end-0 top-0 z-1 flex">
      <ToggleGroup.Root
        aria-label="Show the decisions as"
        onValueChange={(next) => {
          if (next === "list" || next === "graph") {
            go({ mode: next });
          }
        }}
        type="single"
        value={view}
      >
        <ToggleGroup.Item value="list">List</ToggleGroup.Item>
        <ToggleGroup.Item value="graph">Graph</ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  {/if}
  <div
    data-slot="dswap"
    class="relative flex min-h-0 min-w-0 flex-col group-mode-graph/decisions:flex-auto group-mode-page/decisions:flex-auto"
  >
    {#key shown}
      <div
        data-slot="dview"
        class="flex min-h-0 animate-(--row-anim) flex-col gap-space-3 group-mode-graph/decisions:flex-auto group-mode-page/decisions:flex-auto data-under-seg:pt-(--seg-pad)"
        data-under-seg={(graphed && !page) || undefined}
        out:leave
        style:--row-anim={swap.rowAnim(0, ListSwap.leaveEnd(0))}
        style:--seg-pad="calc(var(--seg-h) + var(--space-3))"
      >
        {#if page}
          <DecisionPage
            {card}
            hrefOf={taskHref}
            name={page}
            {now}
            onback={back}
            {onopentask}
            {projectId}
            summary={pages.find((each) => each.name === page)}
            {taskOf}
          />
        {:else if view === "graph"}
          {#if graphProblem}
            <p class="type-meta m-0 text-error-11" role="alert">
              {graphProblem}
            </p>
          {/if}
          {#if graph}
            <DecisionGraph
              {graph}
              onopen={(name, at) => go({ page: name, card: at })}
              onplace={place}
            />
          {:else}
            <Skeleton class="h-64 w-full rounded-lg" />
          {/if}
        {:else if decisions.problem && !list}
          <!-- literal: 72ch -->
          <div
            class="max-w-(--measure)"
            data-slot="state"
            style:--measure="72ch"
          >
            <EmptyState
              icon={IconDecisions}
              line="The decision pages for {projectName} could not be read: {decisions.problem}"
              title="Decisions are not available"
            >
              {#snippet action()}
                <Button onclick={() => decisions.read()} variant="outline"
                  >Retry</Button
                >
              {/snippet}
            </EmptyState>
          </div>
        {:else if empty && canTalk}
          <!-- literal: 36rem -->
          <div
            data-slot="caw-empty"
            class="mx-auto w-full max-w-(--measure)"
            style:--measure="36rem"
          >
            <EmptyState
              line="Caw writes a decision page: the choices this project needs you to make, each with its options."
              title="No decisions yet"
            >
              {#snippet mark()}
                <div
                  data-slot="caw-80"
                  class="mb-space-3 grid place-items-center"
                  data-share="caw:{projectId}"
                  out:sitDown|global
                >
                  <CawSeat {lead} {projectId} {projectName} size={80} />
                </div>
              {/snippet}
              {#snippet action()}
                <!-- The ask is a starter: it opens his panel with its words
                     in his composer, nothing sent. A press on it is no
                     press outside the panel (CawFloat, data-caw-asks). -->
                <div class="contents" data-caw-asks>
                  <CawStarters
                    onpick={(text) => lead.ask(text, "decisions")}
                    {starters}
                  />
                </div>
              {/snippet}
            </EmptyState>
          </div>
        {:else if empty}
          <!-- literal: 72ch -->
          <div
            class="max-w-(--measure)"
            data-slot="state"
            style:--measure="72ch"
          >
            <EmptyState
              icon={IconDecisions}
              line="A session writes decision pages; start one and ask for a page."
              title="No decisions yet"
            >
              {#snippet action()}
                <Button
                  onclick={() => newSession({ projectId })}
                  variant="outline">New session</Button
                >
              {/snippet}
            </EmptyState>
          </div>
        {:else}
          <!-- A page published while the list is open arrives as rows do
               (motion/rows); the tiles it moves slide to their places. -->
          <div
            data-slot="grid"
            class="grid grid-cols-1 gap-space-3 @decisions-520px/decisions:grid-cols-2 @decisions-900px/decisions:grid-cols-4"
            {@attach reflow()}
          >
            {#if list}
              {#each pages as each (each.name)}
                <div data-slot="cell" class="flex min-w-0 flex-col" data-flip>
                  <DecisionTile
                    href={hrefOf({ page: each.name, card: null })}
                    {now}
                    onopen={open}
                    page={each}
                  />
                </div>
              {/each}
            {:else}
              {#each [0, 1, 2, 3] as slot (slot)}
                <!-- literal: 90px -->
                <Skeleton
                  class="h-(--skeleton-h) w-full rounded-lg"
                  style="--skeleton-h: 90px"
                />
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  /* residual: foreign-dom */
  [data-slot="cell"] > :global([data-slot="tile"]) {
    flex: 1 1 auto;
  }
  /* residual: foreign-dom */
  [data-slot="caw-empty"] :global(.kit-empty) {
    align-items: center;
    text-align: center;
  }
  /* residual: foreign-dom */
  [data-slot="caw-empty"] :global(.kit-empty-action) {
    align-self: stretch;
  }
</style>
