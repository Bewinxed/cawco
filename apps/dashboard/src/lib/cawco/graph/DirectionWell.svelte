<script lang="ts" module>
  /** Where a direction's live drawing stands: on its way, drawn, or failed with why. */
  export type DirectionDrawing =
    | { state: "loading" }
    | { state: "drawn" }
    | { state: "failed"; why: string };
</script>

<script lang="ts">
  /**
   * The well one direction of a design is drawn in, wherever a pick between
   * directions stands outside its graph (the composer's parked pick,
   * transcript/ParkedPrompt.svelte): the recessed ground the stage draws on,
   * its live drawing over it (`children`, the graph's own stage page,
   * DirectionStage), as tall as the drawing and no less than the well's floor.
   * On its way, the stage's own cover line names what is drawn; failed, the
   * error formula in the drawing's place, with Try again, the rest of the
   * pick still answerable.
   */
  import { graphWords } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconAlert, IconRefresh } from "#lib/icons.js";
  import CoverState from "../preview/CoverState.svelte";

  let {
    name,
    drawing,
    onretry,
    children,
  }: {
    /** The direction's name, as its well is read. */
    name: string;
    drawing: DirectionDrawing;
    /** Try again on a failed drawing. */
    onretry?: () => void;
    /** The live drawing; it stands under the cover until drawn. */
    children?: Snippet;
  } = $props();
</script>

<figure
  aria-busy={drawing.state === "loading" || undefined}
  aria-label={graphWords.directionWell(name)}
  class="relative m-0 grid min-h-40 min-w-0 overflow-clip rounded-sm bg-bg-2"
  data-drawing={drawing.state}
  data-slot="direction-well"
>
  {#if drawing.state !== "failed"}
    <!-- The drawing stands from the start, unseen until it is drawn, so its
         page loads while the cover says so. -->
    <div
      class="col-start-1 row-start-1 min-w-0 opacity-0 transition-fade-show data-drawn:opacity-100"
      data-drawn={drawing.state === "drawn" || undefined}
    >
      {@render children?.()}
    </div>
  {/if}
  {#if drawing.state === "loading"}
    <div class="col-start-1 row-start-1 px-space-3 pb-space-3">
      <CoverState waiting={{ line: graphWords.drawingDirection(name) }} />
    </div>
  {:else if drawing.state === "failed"}
    <div
      class="col-start-1 row-start-1 flex min-w-0 flex-col items-start gap-space-2 p-space-3"
      role="alert"
      style:--hang="calc(var(--spacing-icon-md) + var(--spacing-space-2))"
    >
      <p class="m-0 flex items-start gap-space-2 mark-line text-tx type-meta">
        <IconAlert
          aria-hidden="true"
          class="mt-px size-icon-md flex-none text-red"
        /><span class="min-w-0 text-pretty wrap-anywhere">{drawing.why}</span>
      </p>
      {#if onretry}
        <Button
          class="ms-(--hang)"
          icon={IconRefresh}
          label={graphWords.drawAgain}
          onclick={onretry}
          size="xs"
          variant="outline"
        />
      {/if}
    </div>
  {/if}
</figure>
