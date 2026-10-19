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
  import { decisionsWords as words } from "@cawco/core";
  import type { DecisionGraph as Graph } from "@cawco/core/decisions";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    carriesWait,
    motionOk,
    revealIn,
    revealOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { depart, departing } from "#lib/cawco/motion/share.svelte.js";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
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
    waitingSince,
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
    /** When the switch that landed on this project's page began (`performance.now()`), its load running first: the tab's wait from then. */
    waitingSince?: number;
  } = $props();

  const list = $derived(decisions.list);
  const pages = $derived(list?.pages ?? []);
  /**
   * The project's decisions as the hub measured them (`decisionShapeOf`):
   * what the tab stands as before its list is read (The Claim Of Nothing
   * Rule). Unmeasured, nothing of it stands: no tiles, no segment's room.
   */
  const shape = $derived(cawco.decisionShapeOf(projectId));
  const graphed = $derived(decisions.graphed);
  /** List or graph: the graph only while the decisions form one. */
  const view = $derived<DecisionsMode>(graphed ? mode : "list");
  /** What stands: null while whether it is a graph is not known yet (`known`), so no skeleton is guessed. */
  const shown = $derived.by(() => {
    if (page) {
      return `page:${page}`;
    }
    return decisions.known ? view : null;
  });
  const empty = $derived(list !== null && pages.length === 0);
  /** The List | Graph segment's room above the list, while the decisions form a graph. */
  const underSeg = $derived(!page && graphed);
  /** A tile's skeleton for each page the measured shape counts. */
  const readingTiles = $derived(
    shape ? Array.from({ length: shape.pages }, (_, i) => i) : []
  );
  /**
   * When the tab's wait began: the switch from another project that its
   * page landed by (`waitingSince`: the click, its page's load ran after),
   * else its opening. A skeleton that stands after it (the shapes read
   * later, a tile counted in) carries that wait on rather than waiting the
   * grace again (`carriesWait`).
   */
  const waitFrom = untrack(() => waitingSince) ?? performance.now();
  /** Caw's empty state arriving: one cross-fade, unless Caw lands into it by his flight, which is its arrival. */
  const cawArrives = (node: Element, flying: boolean): TransitionConfig =>
    flying ? { duration: 0 } : revealIn(node);

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
      // The first view to stand once known arrives as itself, not as a swap.
      const from = was;
      if (next !== null && from !== null) {
        untrack(() => swap.swap([], order(next) >= order(from) ? 1 : -1));
      }
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
      ".page-head [data-share]"
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
          graphProblem =
            read.problems.length > 0 ? read.problems.join(" ") : null;
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
  class="decisions"
  data-mode={page ? "page" : view}
>
  {#if graphed && !page}
    <div data-slot="seg-row" class="seg-row">
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
  <div class="dswap">
    {#key shown}
      {#if shown !== null}
        <div
          class={["dview", underSeg && "under-seg"]}
          out:leave
          style="animation:{swap.rowAnim(0, ListSwap.leaveEnd(0))}"
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
              <p class="problem" role="alert" in:revealIn>{graphProblem}</p>
            {/if}
            <!-- The graph's own box while it is read, then the graph, or why
               it could not be read, in the reveal (revealOut, revealIn). -->
            {#if graph}
              <div class="graph-place" data-decisions-graph-read in:revealIn>
                <DecisionGraph
                  {graph}
                  onopen={(name, at) => go({ page: name, card: at })}
                  onplace={place}
                />
              </div>
            {:else if !graphProblem}
              <div
                aria-busy="true"
                aria-label={words.readingGraph}
                class="graph-place"
                data-decisions-reading="graph"
                role="status"
                out:revealOut
              >
                <Skeleton
                  class="graph-reading"
                  {@attach carriesWait(waitFrom)}
                />
              </div>
            {/if}
            <!-- The list's tiles while it is read, then what the read brought
               in the reveal (revealOut, revealIn): the list, the empty state
               or why it could not be read. One chain, so the tiles' leave is
               this chain's own and plays whichever branch takes their place. -->
          {:else if decisions.problem && !list}
            <div class="state" in:revealIn>
              <EmptyState
                icon={IconDecisions}
                line={words.unavailableLine(projectName, decisions.problem)}
                title={words.unavailable}
              >
                {#snippet action()}
                  <Button onclick={() => decisions.read()} variant="outline"
                    >{words.retry}</Button
                  >
                {/snippet}
              </EmptyState>
            </div>
          {:else if empty && canTalk}
            <!-- Caw flying in from his seat lands by his flight (share `land`):
               the state around him fades in only when he is not on his way. -->
            {@const flying = departing(`caw:${projectId}`)}
            <div
              data-slot="caw-empty"
              class="state caw-empty"
              in:cawArrives={flying}
            >
              <EmptyState line={words.emptyCaw} title={words.empty}>
                {#snippet mark()}
                  <div
                    data-slot="caw-80"
                    class="caw-80"
                    data-share="caw:{projectId}"
                    out:sitDown|global
                  >
                    <CawSeat {lead} {projectId} {projectName} size={80} />
                  </div>
                {/snippet}
                {#snippet action()}
                  <!-- The ask is a starter: it opens his panel with its words
                     in his composer, nothing sent. -->
                  <StarterCards
                    onpick={(text) => lead.ask(text, "decisions")}
                    {starters}
                  />
                {/snippet}
              </EmptyState>
            </div>
          {:else if empty}
            <div class="state" in:revealIn>
              <EmptyState
                icon={IconDecisions}
                line={words.emptySession}
                title={words.empty}
              >
                {#snippet action()}
                  <Button
                    onclick={() => newSession({ projectId })}
                    variant="outline">{words.newSession}</Button
                  >
                {/snippet}
              </EmptyState>
            </div>
          {:else if list}
            <!-- A page published while the list is open arrives as rows do
               (motion/rows); the tiles it moves slide to their places. -->
            <div data-slot="grid" class="grid" in:revealIn {@attach reflow()}>
              {#each pages as each (each.name)}
                <div class="cell" data-flip>
                  <DecisionTile
                    href={hrefOf({ page: each.name, card: null })}
                    {now}
                    onopen={open}
                    page={each}
                  />
                </div>
              {/each}
            </div>
          {:else}
            <!-- A tile at a tile's size for each page the hub measured, in
               the grid's own columns, while the list is read. -->
            <div
              aria-busy="true"
              aria-label={words.reading}
              class="grid"
              data-decisions-reading="list"
              role="status"
              out:revealOut
            >
              {#each readingTiles as slot (slot)}
                <Skeleton
                  class="tile-reading"
                  {@attach carriesWait(waitFrom)}
                />
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/key}
  </div>
</div>

<style>
  .decisions {
    --seg-h: 36px;
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    container: decisions / inline-size;
  }
  .dswap {
    position: relative;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    min-inline-size: 0;
  }
  .dview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-block-size: 0;
  }
  .decisions:is([data-mode="graph"], [data-mode="page"]) .dswap,
  .decisions:is([data-mode="graph"], [data-mode="page"]) .dview {
    flex: 1 1 auto;
  }
  /* The segment stands at the list's top-right; while the decisions form a
     graph the list stands under its room (`under-seg`), skeleton or tiles. */
  .seg-row {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    z-index: 1;
    display: flex;
  }
  .dview.under-seg {
    padding-block-start: calc(var(--seg-h) + var(--space-3));
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  @container decisions (width >= 520px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container decisions (width >= 900px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .cell {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .cell > :global(.tile) {
    flex: 1 1 auto;
  }
  /* A tile's own height (DecisionTile): its padding, the head's row at the
     pill's height (--c-pill-h), the figure's line in meta type, the
     writer's line at its mark's lead slot (TreeMark, --c-row-mark) or its
     meta line if taller, the
     tile's gap between them. */
  .grid :global(.tile-reading) {
    block-size: calc(
      var(--space-5) * 2 + var(--c-pill-h) + var(--space-2) * 2 + 1lh +
        max(1lh, var(--c-row-mark))
    );
    border-radius: var(--radius-lg);
    font: var(--type-meta);
  }
  /* The graph's box (DecisionGraph `.graph`): the pane's height, at least
     24rem, at the card radius. */
  .graph-place {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .graph-place :global(.graph-reading) {
    flex: 1 1 auto;
    min-block-size: 24rem;
    border-radius: var(--radius-lg);
  }
  .state {
    max-inline-size: 72ch;
  }
  .caw-empty {
    inline-size: 100%;
    max-inline-size: 36rem;
  }
  .caw-empty :global(.kit-empty-action) {
    align-self: stretch;
  }
  .caw-80 {
    display: grid;
    justify-items: start;
    margin-block-end: var(--space-3);
  }
  .problem {
    margin: 0;
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
