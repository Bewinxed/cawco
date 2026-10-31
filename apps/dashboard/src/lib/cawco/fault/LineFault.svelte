<script lang="ts">
  /**
   * What a part that is one list or one strip shows where it stood when it
   * stops on a render error (FaultBoundary): one row on the house
   * row grid (DESIGN.md, Caw's panel): Caw's still in the lead column, the
   * words, and at the trailing edge the action that leads, an outline, with
   * Show details stepped back beside it in a quiet ghost. The rest of its
   * surface keeps working, and its view's coral stays that view's (DESIGN.md,
   * The Coral Is Where You Act Rule).
   *
   * `strip`: it stands in a pane's tab row, at the row's height: a smaller
   * Caw, its actions beside its words rather than a strip's width away, and
   * Show details opens over the pane so the pane never moves. On the shelf the
   * muted ink holds 4.40:1, so its ghost keeps the strong ink.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { Button } from "#lib/components/ui/button/index.js";
  import { appearOnMount } from "../motion/curves.svelte";
  import type { FaultCaw } from "./caw";
  import FaultDetails from "./FaultDetails.svelte";
  import ShowDetails from "./ShowDetails.svelte";

  let {
    what,
    again = false,
    details,
    open = false,
    strip = false,
    caw,
    onretry,
    onreload,
  }: {
    /** The part, as a sentence names it: "this comment", "these tabs". */
    what: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Show details starts open. */
    open?: boolean;
    strip?: boolean;
    /** Caw as the bundle draws him (fault/caw.ts): his head beside the words. */
    caw: FaultCaw;
    onretry: () => void;
    onreload: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally: `open` only says how it starts.
  let shown = $state(open);
  const detailsId = $props.id();
</script>

<div
  data-slot="line-fault"
  data-strip={strip || undefined}
  role="alert"
  class="relative min-w-0"
  {@attach appearOnMount()}
>
  <div
    class="flex min-w-0 items-center gap-space-3 py-space-2 data-strip:gap-space-2 data-strip:py-0"
    data-strip={strip || undefined}
  >
    <span class="flex-none">
      {@render caw({ again, size: strip ? 24 : 28, head: true })}
    </span>
    <div
      data-strip={strip || undefined}
      class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1 data-strip:justify-start"
    >
      <p
        data-strip={strip || undefined}
        class="m-0 min-w-0 flex-auto text-pretty text-ink-strong type-label data-strip:flex-initial"
      >
        {again
          ? regionFaultWords.stillCantShow(what)
          : regionFaultWords.couldntShow(what)}
      </p>
      <span
        data-strip={strip || undefined}
        class="ms-auto flex flex-none items-center gap-space-1 data-strip:ms-0"
      >
        <ShowDetails controls={detailsId} quiet={!strip} size="xs" bind:shown />
        <Button
          data-lead
          label={again ? regionFaultWords.reloadPage : commonWords.tryAgain}
          onclick={again ? onreload : onretry}
          size="xs"
          variant="outline"
        />
      </span>
    </div>
  </div>
  {#if shown}
    <div
      data-strip={strip || undefined}
      class="pb-space-2 data-strip:absolute data-strip:start-0 data-strip:top-full data-strip:z-1 data-strip:w-full data-strip:max-w-c-measure data-strip:pt-space-1"
    >
      <FaultDetails {details} floating={strip} id={detailsId} />
    </div>
  {/if}
</div>
