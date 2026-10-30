<script lang="ts">
  /**
   * What a decision card shows when it stops on a render error, in the card's
   * own place on its page (OpenUiRenderer's `failed` for a Decision, which
   * today draws nothing and leaves a hole): a design proposal, drawn on its
   * canvas (fault/preview). The same composition as a part's (RegionFault), on
   * the card's own shell and width, so the column keeps its rhythm: Caw at the
   * card's top edge or whole in its head, its question named so the person
   * knows which call is out, and Try again leading in an outline: the page's
   * coral stays on Send (DESIGN.md, The Coral Is Where You Act Rule). The page's
   * other cards and Send go on working.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { decisionsWords } from "@cawco/core/words/decisions";
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { shellWords } from "@cawco/core/words/shell";
  import { Button } from "#lib/components/ui/button/index.js";
  import Caw from "../home/Caw.svelte";
  import { appearOnMount } from "../motion/curves.svelte";
  import FaultDetails from "./FaultDetails.svelte";
  import LedgeCaw from "./LedgeCaw.svelte";
  import type { Composition } from "./RegionFault.svelte";

  let {
    composition = "contractbook",
    question,
    again = false,
    details,
    open = false,
    onretry = () => undefined,
    onreload = () => undefined,
  }: {
    composition?: Composition;
    /** The card's question, from its props, which outlive what threw. */
    question: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    onretry?: () => void;
    onreload?: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally: `open` only says how it starts.
  let shown = $state(open);
  const detailsId = $props.id();
  const what = decisionsWords.thisDecision;
</script>

<div
  data-slot="decision-fault"
  data-composition={composition}
  role="alert"
  class="flex min-w-0 flex-col items-center"
  {@attach appearOnMount()}
>
  {#if composition === "contractbook"}
    <LedgeCaw {again} size={136} />
  {/if}
  <article
    data-slot="decision"
    class="flex w-full min-w-0 flex-col items-center rounded-panel bg-surface-raised p-(--card-in) shadow-tile"
  >
    {#if composition === "bitepal"}
      <div class="mb-space-3 flex-none">
        <Caw status={again ? "trying" : "needs-you"} still size={96} />
      </div>
    {/if}
    <div class="flex w-full max-w-c-panel-w min-w-0 flex-col">
      <h2 class="m-0 text-center text-balance text-ink-strong type-title">
        {again
          ? regionFaultWords.stillCantShow(what)
          : regionFaultWords.couldntShow(what)}
      </h2>
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body wrap-anywhere"
      >
        {question}
      </p>
      {#if again}
        <p
          class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body"
        >
          {regionFaultWords.reloadKeeps}
        </p>
      {/if}
      <div
        class="mt-space-4 flex flex-wrap items-center justify-between gap-space-2"
      >
        <Button
          aria-controls={detailsId}
          aria-expanded={shown}
          class="-ms-space-3"
          data-details
          label={shown ? shellWords.hideDetails : shellWords.showDetails}
          onclick={() => {
            shown = !shown;
          }}
          size="sm"
          tone="quiet"
          variant="ghost"
        />
        <Button
          data-lead
          label={again ? regionFaultWords.reloadPage : commonWords.tryAgain}
          onclick={again ? onreload : onretry}
          variant="outline"
        />
      </div>
      {#if shown}
        <div class="mt-space-3 min-w-0">
          <FaultDetails {details} id={detailsId} />
        </div>
      {/if}
    </div>
  </article>
</div>
