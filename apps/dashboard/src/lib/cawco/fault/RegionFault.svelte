<script lang="ts" module>
  /** Each named after the reference it comes from (design/fault-references.md). */
  export type Composition = "contractbook" | "bitepal";
</script>

<script lang="ts">
  /**
   * What a part with a body of its own shows in that body when it stops on a
   * render error (RegionBoundary's `failed`), inside the chrome that outlives
   * it: a design proposal, drawn on its canvas (fault/preview). One composed
   * thing with one lead: the action, in the house's coral, since the fault is
   * the whole of this view, and everything else steps back from it.
   *
   * - `contractbook`: Caw looks over the top edge of a raised sheet that holds
   *   the words and the actions. He and the sheet are one object, and his eyes
   *   lead down to it. `peek`, then `climb` once it has stopped again.
   * - `bitepal`: Caw stands whole on the axis over the words and the actions.
   *   `needs-you`, then `trying` once it has stopped again.
   *
   * `again`: the rebuild threw again at once on the same data, so Try again
   * can't help: the way on is Reload page, which reads everything fresh from
   * the hub (a reload is safe: DESIGN.md, Update toast). His new pose says it
   * before the words do.
   *
   * He comes in by his own drawn enter once and holds his drawing, so a part
   * that stands failed for hours plays nothing (emil-design-eng: rare moment,
   * one authored motion, nothing looping). If his file does not load his box
   * stays empty and the fault still reads.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { shellWords } from "@cawco/core/words/shell";
  import { Button } from "#lib/components/ui/button/index.js";
  import Caw from "../home/Caw.svelte";
  import { appearOnMount } from "../motion/curves.svelte";
  import FaultDetails from "./FaultDetails.svelte";
  import LedgeCaw from "./LedgeCaw.svelte";

  let {
    composition = "contractbook",
    what,
    kept,
    again = false,
    details,
    open = false,
    room = "panel",
    onretry = () => undefined,
    onreload = () => undefined,
  }: {
    composition?: Composition;
    /** The part, as a sentence names it: "the preview", "your sessions". */
    what: string;
    /** What is safe, where the person would fear for it. */
    kept?: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    /** How much the part gives him: a panel or a sheet, or a whole page. */
    room?: "panel" | "page";
    onretry?: () => void;
    onreload?: () => void;
  } = $props();

  /** Side of his still's box. The whole of him stands taller than his peek. */
  const SIZES = {
    contractbook: { panel: 192, page: 240 },
    bitepal: { panel: 136, page: 176 },
  } as const;
  const size = $derived(SIZES[composition][room]);

  // svelte-ignore state_referenced_locally: `open` only says how it starts.
  let shown = $state(open);
  const detailsId = $props.id();
</script>

{#snippet words()}
  <h2 class="m-0 text-center text-balance text-ink-strong type-title">
    {again
      ? regionFaultWords.stillCantShow(what)
      : regionFaultWords.couldntShow(what)}
  </h2>
  {#if again || kept}
    <p class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body">
      {again ? regionFaultWords.reloadKeeps : kept}
    </p>
  {/if}
{/snippet}

{#snippet lead()}
  <Button
    data-lead
    label={again ? regionFaultWords.reloadPage : commonWords.tryAgain}
    onclick={again ? onreload : onretry}
  />
{/snippet}

{#snippet more()}
  <Button
    aria-controls={detailsId}
    aria-expanded={shown}
    data-details
    label={shown ? shellWords.hideDetails : shellWords.showDetails}
    onclick={() => {
      shown = !shown;
    }}
    class={composition === "contractbook" ? "-ms-space-3" : undefined}
    size="sm"
    tone="quiet"
    variant="ghost"
  />
{/snippet}

<div
  data-slot="region-fault"
  data-composition={composition}
  role="alert"
  class="grid min-h-full w-full min-w-0 place-items-center overflow-y-auto overscroll-contain p-space-5 max-phone:p-space-3"
  {@attach appearOnMount()}
>
  {#if composition === "contractbook"}
    <div class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center">
      <LedgeCaw {again} {size} />
      <div
        data-slot="sheet"
        class="flex w-full min-w-0 flex-col rounded-lg border border-border-control bg-surface-raised p-space-4 pt-space-5 shadow-tile"
      >
        {@render words()}
        <!-- One prominent action, trailing (DESIGN.md, Liquid Glass bars); the
             other steps back to the leading edge in a quiet ghost. -->
        <div
          class="mt-space-4 flex flex-wrap items-center justify-between gap-space-2"
        >
          {@render more()}
          {@render lead()}
        </div>
        {#if shown}
          <div class="mt-space-3 min-w-0">
            <FaultDetails {details} id={detailsId} />
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div
      class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center"
      data-slot="stage"
    >
      <div class="mb-space-4 flex-none">
        <Caw status={again ? "trying" : "needs-you"} still {size} />
      </div>
      {@render words()}
      <div class="mt-space-5 flex flex-col items-center gap-space-2">
        {@render lead()}
        {@render more()}
      </div>
      {#if shown}
        <div class="mt-space-3 w-full min-w-0">
          <FaultDetails {details} id={detailsId} />
        </div>
      {/if}
    </div>
  {/if}
</div>
