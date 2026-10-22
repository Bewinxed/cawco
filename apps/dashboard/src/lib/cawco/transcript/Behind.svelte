<!--
  A transcript that cannot be caught up says so in one line over the rows the
  reader holds (client.svelte.ts `SessionState.behind`), and goes when the
  read lands. Its machine is reconnecting (the hub heard from it moments
  ago: a hub that just restarted, a dropped connection), a wait said with no
  toast, until the hub's deadline for it passes on the clock
  (`reconnectingNow`); or it is
  offline; either way the rest comes in once the hub says it is back
  (`readBehind`). Or the read failed: the line says so in the error formula,
  the hub's own sentence for why, beside Try again, which reads it now, as
  the backoff does by itself (`readAgainLater`). Never a toast (DESIGN.md,
  The Work Outlives Its Surface Rule): the failure stands here, over the rows
  it concerns, until a read lands. A hub sentence runs long (a held read's
  is three clauses), so the line wraps inside the dock at any width.

  `floating`: it stands in the dock over the foot of a pane's list (see
  `Transcript`), on the surface "Catching up…" and "Jump to latest" share, at
  no height in the flow, so it is seen wherever the reader stands and its
  coming and going moves no row. Otherwise it is a line at the foot of a
  delegate's well (`InlineTranscript`), in its flow. Its words are set as the
  strip before the first row sets why an older page could not be read.

  Floating, it is as wide as its words, up to the dock's width (`w-max`,
  `max-w-full`): the dock centres it, and WebKit sizes a centred wrapping
  row to its min-content, which for words that may break anywhere is a
  column a few letters wide.
-->
<script lang="ts">
  import { commonWords, machineLabel } from "@cawco/core";
  import { rise } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { cawco, type ReadFault, reconnectingNow } from "../client.svelte";

  let {
    fault,
    onretry,
    floating = false,
  }: {
    fault: ReadFault;
    onretry: () => void;
    floating?: boolean;
  } = $props();

  /** The offline machine's name as the fleet lists it. */
  const machine = $derived.by(() => {
    if (fault.reason !== "offline") {
      return "";
    }
    const row = cawco.machines.find(
      (listed) => listed.machineId === fault.machineId
    );
    return row ? machineLabel(row.hostname) : fault.machineId;
  });
</script>

<!-- Comes and goes as "Catching up…" does, which shares its dock. -->
<div
  data-floating={floating || undefined}
  data-slot="behind"
  class="flex flex-wrap items-center justify-center gap-x-space-2 p-space-2 text-size-meta font-normal text-ink-muted text-center data-floating:w-max data-floating:max-w-full data-floating:px-space-3 data-floating:border data-floating:border-border-hairline data-floating:rounded-md data-floating:bg-surface-raised data-floating:shadow-overlay data-floating:pointer-events-auto"
  role="status"
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  {#if reconnectingNow(fault)}
    <p class="min-w-0 text-balance">
      <span data-slot="name" class="whitespace-nowrap">{machine}</span>
      is reconnecting. The rest comes in once it's back.
    </p>
  {:else if fault.reason === "offline"}
    <p class="min-w-0 text-balance">
      Not caught up: <span data-slot="name" class="whitespace-nowrap"
        >{machine}</span
      > is offline. The rest comes in once it's back.
    </p>
  {:else}
    <p class="min-w-0 text-pretty wrap-anywhere">
      Not caught up: {fault.message}. It's read again by itself.
    </p>
    <!-- The kit link: an action in the line, in the link's ink, never plain
         words beside the words it answers. -->
    <Button onclick={onretry} pad="none" size="xs" variant="link"
      >{commonWords.tryAgain}</Button
    >
  {/if}
</div>
