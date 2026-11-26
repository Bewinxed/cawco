<script lang="ts">
  /**
   * HangCard in a frame of its own (its states file's): Caw's card (`glass`,
   * `frame="caw"`) hung open from the bar's glass in a `shell` container of
   * the width asked for (bar-glass-frame), drawn in place as the Shell draws
   * it, with stand-in rows where Caw's panel's stand, so no store is read.
   * Its form is the frame's shell, never the page's: the desk's card at
   * 1440, the phone's at 390, its trailing side square on the screen's edge.
   */
  import CawCardFrame from "./caw-card-frame.svelte";

  let {
    width,
    height,
    rows,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    /** The frame's least height, px: room for the card under the bar. */
    height: number;
    /** The card's rows, each a line of words. */
    rows: string[];
  } = $props();
</script>

<CawCardFrame {height} {width}>
  {#each rows as row (row)}
    <p class="px-space-2 py-space-2 type-label text-ink-strong">{row}</p>
  {/each}
</CawCardFrame>
