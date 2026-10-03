<!--
  A transcript that is catching up says so above the composer, from the
  switch until the catch-up has appended: the transcript the reader left is
  on screen already, and this says the rest is on its way.

  It floats in the dock over the foot of the list (see `Transcript`), in the
  flow at no height. Drawn as a line under the last row it made the list
  taller: at the tail it sat below the view, behind the composer, where no
  one saw it, and the rows had to be moved to show it — then moved back when
  it went. Floating, it is seen the moment it shows and moves nothing; the
  turns it stood for slide in beneath it as it fades.
-->
<script lang="ts">
  import { rise } from "#lib/cawco/motion/curves.svelte.js";
</script>

<!-- Comes and goes as "Jump to latest" does, which shares its dock. -->
<div
  aria-busy="true"
  class="catchup"
  role="status"
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  <span aria-hidden="true" class="beat"></span>Catching up…
</div>

<style>
  /* The same raised surface as "Jump to latest", which shares its dock. */
  .catchup {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  /* The one thing that moves, and only for a reader who has not asked for
     less: the dot beats on --breath. Still, the tag's presence carries it. */
  .beat {
    inline-size: 6px;
    block-size: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--status-live-ink);

    @media (prefers-reduced-motion: no-preference) {
      animation: beat var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes beat {
    50% {
      opacity: 0.3;
    }
  }
</style>
