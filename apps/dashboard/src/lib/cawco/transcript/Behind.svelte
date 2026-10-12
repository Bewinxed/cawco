<!--
  A transcript that cannot be caught up says so in one line, while its
  machine is offline: the rows on screen are the ones the reader had, and the
  read is made again by itself once the hub says the machine is back
  (client.svelte.ts `readBehind`). It goes when that read lands.

  It floats in the dock over the foot of the list (see `Transcript`), at no
  height in the flow, so it is seen wherever the reader stands and its coming
  and going moves no row. Its words are set as the strip before the first row
  sets why an older page could not be read.
-->
<script lang="ts">
  import { rise } from "#lib/cawco/motion/curves.svelte.js";

  let { machine }: { machine: string } = $props();
</script>

<!-- Comes and goes as "Catching up…" does, which shares its dock. -->
<p class="behind" role="status" in:rise={"--dur-panel"} out:rise={"--dur-exit"}>
  Not caught up: {machine} is offline
</p>

<style>
  /* The dock's raised surface (CatchUp, Latest): the line floats over rows. */
  .behind {
    min-inline-size: 0;
    max-inline-size: 100%;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
