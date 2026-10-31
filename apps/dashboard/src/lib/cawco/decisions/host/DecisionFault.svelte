<script lang="ts">
  /**
   * What a decision card shows when it stops on a render error, in the
   * card's own place on its page (Host's `fault` for OpenUiRenderer): the
   * dashboard's part face (fault/RegionFault) on the card's own shell and
   * width, so the column keeps its rhythm. Caw stands whole in its head, the
   * kit's still of him, as the page's head draws him (Decisions.svelte); its
   * question is named so the person knows which call is out, and Try again
   * leads in an outline, with Show details quiet under it: the page's coral
   * stays on Send (DESIGN.md, The Coral Is Where You Act Rule). The page's
   * other cards and Send go on working.
   *
   * `again`: the rebuild threw again at once on the same data (fault/
   * rebuild): Reload page leads, and Caw's still turns from needs-you to
   * trying.
   */
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import darkNeedsYou from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-needs-you.webp";
  import darkTrying from "../../../../../../../packages/hub/skills/decision-page/kit/caw/dark-trying.webp";
  import lightNeedsYou from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-needs-you.webp";
  import lightTrying from "../../../../../../../packages/hub/skills/decision-page/kit/caw/light-trying.webp";
  import FaultActions from "../../fault/FaultActions.svelte";
  import { appearOnMount } from "../../motion/curves.svelte";
  import { scheme } from "./scheme.svelte.js";

  let {
    question,
    again = false,
    details,
    open = false,
    onretry,
    onreload,
  }: {
    /** The card's question, from its props, which outlive what threw. */
    question: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    onretry: () => void;
    onreload: () => void;
  } = $props();

  const STILLS = {
    dark: { needsYou: darkNeedsYou, trying: darkTrying },
    light: { needsYou: lightNeedsYou, trying: lightTrying },
  };
  const still = $derived(
    STILLS[scheme.now === "dark" ? "dark" : "light"][
      again ? "trying" : "needsYou"
    ]
  );

  const { what } = regionFaultWords.parts.decision;
</script>

<article
  data-slot="decision-fault"
  role="alert"
  class="flex w-full min-w-0 flex-col items-center rounded-panel bg-surface-raised p-(--card-in) shadow-tile"
  {@attach appearOnMount()}
>
  <img
    alt=""
    class="mb-space-3 block flex-none"
    height="96"
    src={still}
    width="96"
  />
  <div class="flex w-full max-w-c-panel-w min-w-0 flex-col items-center">
    <h2 class="m-0 text-center text-balance text-ink-strong type-title">
      {again
        ? regionFaultWords.stillCantShow(what)
        : regionFaultWords.couldntShow(what)}
    </h2>
    {#if question}
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body wrap-anywhere"
      >
        {question}
      </p>
    {/if}
    {#if again}
      <p
        class="m-0 mt-space-1 text-center text-pretty text-ink-muted type-body"
      >
        {regionFaultWords.reloadKeeps}
      </p>
    {/if}
    <div class="mt-space-4 w-full min-w-0">
      <FaultActions {again} {details} {onreload} {onretry} {open} outline />
    </div>
  </div>
</article>
