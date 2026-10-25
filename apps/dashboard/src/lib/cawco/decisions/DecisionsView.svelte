<script lang="ts">
  /**
   * The project page's Decisions tab: its decision pages as one list
   * (DecisionsList, the owner's pick of 10-24), each row opening its page in
   * this same pane (DecisionPage), and its back symbol returning to the
   * list. Empty, Caw, the title and the why stand on the block's axis over
   * the starters, a press asking him for a page in his panel (Empty Starts
   * Work; Caw Stands On The Axis); while the list is first
   * read, its frame's skeleton stands (The Claim Of Nothing Rule). The page
   * and the card live in the URL.
   */
  import { decisionsWords as words } from "@cawco/core";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { ProjectStarter, StageKind } from "#lib/cawco/project-tasks.js";
  import { newSession } from "#lib/cawco/spawn/new-session.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import DecisionPage from "./DecisionPage.svelte";
  import DecisionsList from "./DecisionsList.svelte";
  import type { ProjectDecisions } from "./decisions.svelte";

  let {
    projectId,
    projectName,
    decisions,
    page,
    card,
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
    /** Caw can start: the empty tab offers him the ask. */
    canTalk: boolean;
    lead: CawLead;
    now: number;
    /** This tab's address for a page and card. */
    hrefOf: (to: { card?: string | null; page?: string | null }) => string;
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
    /** Where the pane goes: a page (at a card) or the list, kept in the URL. */
    go: (to: { card?: string | null; page?: string | null }) => void;
  } = $props();

  const list = $derived(decisions.list);
  const pages = $derived(list?.pages ?? []);
  const shown = $derived(page ? `page:${page}` : "list");
  const empty = $derived(list !== null && pages.length === 0);

  // --- the swap ------------------------------------------------------------------------

  /** The list and a page swap as the project's views do (motion/list-swap). */
  const swap = new ListSwap<never>();
  let was = untrack(() => shown);
  $effect.pre(() => {
    const next = shown;
    if (next !== was) {
      untrack(() => swap.swap([], next.startsWith("page:") ? 1 : -1));
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
</script>

<div
  data-slot="decisions"
  class="group/decisions @container/decisions relative flex min-h-0 flex-auto flex-col"
  data-mode={page ? "page" : "list"}
>
  <div
    data-slot="dswap"
    class="relative flex min-h-0 min-w-0 flex-col group-mode-page/decisions:flex-auto"
  >
    {#key shown}
      <div
        data-slot="dview"
        class="flex min-h-0 flex-col gap-space-3 group-mode-page/decisions:flex-auto"
        out:leave
        style:animation={swap.rowAnim(0, ListSwap.leaveEnd(0))}
      >
        {#if page}
          <DecisionPage
            {card}
            hrefOf={taskHref}
            name={page}
            {now}
            onback={() => go({ page: null, card: null })}
            onopenpage={(name) => go({ page: name, card: null })}
            {onopentask}
            pageHref={(name) => hrefOf({ page: name, card: null })}
            {projectId}
            summary={pages.find((each) => each.name === page)}
            {taskOf}
          />
        {:else if decisions.problem && !list}
          <div data-slot="state">
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
          <div class="max-w-c-starters-w" data-slot="first-use">
            <EmptyState
              actionWidth="fill"
              axis
              line={words.emptyCaw}
              title={words.empty}
            >
              {#snippet mark()}
                <div
                  data-slot="caw-80"
                  class="mb-space-3 grid justify-items-center"
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
          <div data-slot="state">
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
        {:else}
          <DecisionsList
            hrefOf={(name) => hrefOf({ page: name, card: null })}
            {now}
            onopen={(name) => go({ page: name, card: null })}
            pages={list?.pages ?? null}
            {projectId}
          />
        {/if}
      </div>
    {/key}
  </div>
</div>
