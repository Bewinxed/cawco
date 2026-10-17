<!--
  A transcript that cannot be caught up says so in one line over the rows the
  reader holds (client.svelte.ts `SessionState.behind`), and goes when the
  read lands. Its machine is reconnecting (the hub heard from it moments
  ago: a hub that just restarted, a dropped connection), a wait said with no
  toast, until the hub's deadline for it passes on the clock
  (`reconnectingNow`); or it is
  offline; either way the rest comes in once the hub says it is back
  (`readBehind`). Or the read failed: "Not caught up" beside
  Try again, which reads it now, as the backoff does by itself
  (`readAgainLater`). Why it failed is the toast's to say, once per fault
  (`toastBehind`): the line never carries the hub's words.

  `floating`: it stands in the dock over the foot of a pane's list (see
  `Transcript`), on the surface "Catching up…" and "Jump to latest" share, at
  no height in the flow, so it is seen wherever the reader stands and its
  coming and going moves no row. Otherwise it is a line at the foot of a
  delegate's well (`InlineTranscript`), in its flow. Its words are set as the
  strip before the first row sets why an older page could not be read.
-->
<script lang="ts">
  import { machineLabel } from "@cawco/core";
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
  class="flex flex-wrap items-center justify-center gap-x-space-2 p-space-2 text-size-meta font-normal text-ink-muted text-center data-floating:max-w-full data-floating:px-space-3 data-floating:border data-floating:border-border-hairline data-floating:rounded-md data-floating:bg-surface-raised data-floating:shadow-overlay data-floating:pointer-events-auto"
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
      Not caught up: <span data-slot="name" class="whitespace-nowrap">{machine}</span> is offline.
      The rest comes in once it's back.
    </p>
  {:else}
    <p class="min-w-0 text-balance">Not caught up</p>
    <Button onclick={onretry} size="sm" variant="ghost">Try again</Button>
  {/if}
</div>
