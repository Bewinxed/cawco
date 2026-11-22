<!--
  Every frame's down state: what a frame that shows a preview origin draws
  over its page when the proxy's own page says a hop didn't answer
  (frame-down.ts, `cawco:down`), the preview pane's, a decision page's, a
  canvas's and a transcript's Preview alike. The kit's empty state on the
  well's ground: the mark, the hop's title and line (core `downState`, the
  names the frame knows put in), its way back, Try again unless the frame
  has another (`action`), and the machine's own words under Show details.
  The frame places it: over its page, or in its page's place.
-->
<script lang="ts">
  import type { PreviewDown } from "@cawco/core/preview/protocol";
  import { commonWords } from "@cawco/core/words/common";
  import { previewWords } from "@cawco/core/words/preview";
  import { type DownNames, downState } from "@cawco/core/words/preview-down";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconAlert, IconArchive, IconRefresh } from "#lib/icons.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { cn } from "#lib/utils.js";
  import FaultDetails from "../fault/FaultDetails.svelte";
  import ShowDetails from "../fault/ShowDetails.svelte";

  let {
    down,
    why,
    names,
    onretry,
    retrying = false,
    action,
    class: className,
    style,
  }: {
    down: PreviewDown;
    why: string | null;
    /** What the frame knows of where the page is served, for the words. */
    names?: DownNames;
    /** Try again: the frame loads its page afresh. */
    onretry?: () => void;
    retrying?: boolean;
    /** The frame's own way back in place of Try again (the pane's: a closed preview's session, a gone version's ask). */
    action?: Snippet;
    /** Where the frame places it. */
    class?: string;
    style?: string;
  } = $props();

  const said = $derived(downState(down, why, names));
  let shown = $state(false);
  const detailsId = $props.id();
</script>

{#snippet ways()}
  <div class="flex flex-wrap items-center gap-space-2">
    {#if action}
      {@render action()}
    {:else if onretry}
      <Button
        icon={IconRefresh}
        label={commonWords.tryAgain}
        onclick={onretry}
        pending={retrying}
        pendingLabel={previewWords.reloading}
        size="sm"
        variant="outline"
      />
    {/if}
    {#if said.details}
      <ShowDetails controls={detailsId} bind:shown />
    {/if}
  </div>
  {#if said.details && shown}
    <div class="mt-space-2 w-full min-w-0">
      <FaultDetails details={said.details} id={detailsId} />
    </div>
  {/if}
{/snippet}

<div
  data-slot="down"
  data-down={down}
  class={cn(
    "min-w-0 overflow-auto overscroll-contain px-space-6 bg-surface-well",
    className
  )}
  role="alert"
  {style}
  transition:appear|global
>
  <EmptyState
    action={ways}
    icon={down === "gone" ? IconArchive : IconAlert}
    line={said.line}
    title={said.title}
  />
</div>
