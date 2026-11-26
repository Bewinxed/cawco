<script lang="ts">
  /**
   * A decision page's card as its page draws it (tsk-521): its question,
   * its options with what each gets and costs, Other as its last option,
   * Add a note, and the agent's reason. The page's overlay stands in as the
   * card's host: a press keeps the pick, Other's line keeps his own words as
   * his answer, a note is kept as typed. Start again (`again`) clears them.
   */
  import {
    type ChoiceChange,
    type ChoiceEntry,
    changedEntry,
  } from "@cawco/core/choices";
  import type { DecisionCard } from "@cawco/core/decisions";
  import { setContext, untrack } from "svelte";
  import { cardProps, isOptionNode } from "./card-props";
  import Decision from "./Decision.svelte";
  import Option from "./Option.svelte";
  import { DECISION_HOST, type DecisionHost } from "./page.svelte";

  let { card, again = 0 }: { card: DecisionCard; again?: number } = $props();

  /** What the page keeps, by the card's id: as the overlay keeps it. */
  let kept = $state<Record<string, ChoiceEntry>>({});
  $effect.pre(() => {
    String(again);
    untrack(() => {
      kept = {};
    });
  });
  /** A change kept as the overlay keeps one (core `changedEntry`). */
  const keep = (change: ChoiceChange): Promise<void> => {
    kept = {
      ...kept,
      [change.choice]: changedEntry(
        kept[change.choice],
        change,
        new Date().toISOString()
      ),
    };
    return Promise.resolve();
  };
  setContext<DecisionHost>(DECISION_HOST, {
    bare: false,
    picks: () => kept,
    bridge: () => ({
      note: (choice, note) => keep({ choice, pageHash: "page", note }),
      words: (choice, words) => keep({ choice, pageHash: "page", words }),
    }),
    pick: (choice, options) => {
      keep({ choice, pageHash: "page", options });
    },
  });
  const drawn = $derived(cardProps(card));
</script>

<!-- Each Option node the card hands down, drawn as the page's renderer draws it. -->
{#snippet node(value: unknown)}
  {#if isOptionNode(value)}
    <Option props={value.props} renderNode={node} />
  {:else if Array.isArray(value)}
    {#each value as one, at (at)}
      {@render node(one)}
    {/each}
  {/if}
{/snippet}

<!-- The page's column on its recessed ground, at the page's inset (fault/states DecisionColumn's). -->
<div class="bg-surface-recess">
  <div
    class="mx-auto flex w-full max-w-c-page-column-w min-w-0 flex-col p-space-4"
    data-slot="page-card"
    style:--card-in="var(--spacing-space-5)"
  >
    <Decision props={drawn} renderNode={node} />
  </div>
</div>
