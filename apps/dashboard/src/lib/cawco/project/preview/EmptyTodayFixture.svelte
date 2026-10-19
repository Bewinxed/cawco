<script lang="ts">
  /**
   * Today's empty board and empty Decisions tab, on a sheet. Neither is a
   * component of its own (the board's is the project page's
   * `.state.caw-empty` block, routes/(app)/project/[id]/+page.svelte; the
   * tab's is DecisionsView's), so this mounts the same real parts the same
   * way: EmptyState with Caw at 80 as its mark and StarterCards as its
   * action, in the box each draws it in: the board's as wide as four
   * starters (`--c-starters-w`) and the tab's 36rem, both from the pane's
   * start edge.
   */
  import { decisionsWords } from "@cawco/core/words/decisions";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    BOARD_STARTERS,
    DECISION_STARTERS,
  } from "../../tasks/preview/tidewater";
  import StarterCards from "../StarterCards.svelte";

  let { surface }: { surface: "board" | "decisions" } = $props();

  const LINE =
    "Tell Caw what to do: the tasks Caw files move through Ready, Working, Review and Done. One waiting on you shows in Review.";
</script>

<div
  data-slot="caw-empty"
  class="state caw-empty"
  data-surface={surface}
  data-today-empty
>
  <EmptyState
    line={surface === "board" ? LINE : decisionsWords.emptyCaw}
    title={surface === "board"
      ? "Nothing on the board yet"
      : decisionsWords.empty}
  >
    {#snippet mark()}
      <div data-slot="caw-80" class="caw-80">
        <Caw size={80} status="ready" />
      </div>
    {/snippet}
    {#snippet action()}
      <StarterCards
        onpick={() => undefined}
        starters={surface === "board" ? BOARD_STARTERS : DECISION_STARTERS}
      />
    {/snippet}
  </EmptyState>
</div>

<style>
  /* The page's `.state` and `.caw-empty` (+page.svelte), and DecisionsView's. */
  .state {
    max-inline-size: 72ch;
  }
  .caw-empty {
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
  }
  .caw-empty[data-surface="decisions"] {
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
</style>
