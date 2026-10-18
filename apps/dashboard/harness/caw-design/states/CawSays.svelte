<script lang="ts">
  /**
   * PROPOSED (notices, B2): the failure as a row Caw speaks in the
   * conversation: his 18px mark on the speaker line, what happened and why
   * as his prose, the ways out as option chips (the kit's `.kit-chip` in a
   * `.kit-chips` row, 30px, 44px under a finger), and Show details as the
   * same fold. It keeps the panel one column of conversation; a can't-start
   * row scrolls away with it.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import Details from "./Details.svelte";
  import DetailsToggle from "./DetailsToggle.svelte";
  import Fold from "./Fold.svelte";

  let {
    title,
    line,
    acts,
    onact,
    raw = null,
    rows = [],
  }: {
    title: string;
    line: string;
    /** The ways out, each a chip. */
    acts: string[];
    onact?: (act: string) => void;
    raw?: string | null;
    rows?: { name: string; said: string }[];
  } = $props();

  let shown = $state(false);
</script>

<article class="says" data-design-caw-says role="status">
  <p class="speaker">
    <span class="mark" data-caw-status="needs-you"
      ><CawFace size={18} status="needs-you" /></span
    >
    <span>Caw</span>
  </p>
  <p class="words">
    <span class="title">{title}.</span>
    {line}
  </p>
  <ul class="kit-chips acts">
    {#each acts as act (act)}
      <li>
        <button
          class="kit-chip touch-hit"
          onclick={() => onact?.(act)}
          type="button"
        >
          {act}
        </button>
      </li>
    {/each}
    <li><DetailsToggle bind:open={shown} /></li>
  </ul>
  <Fold open={shown}><Details {raw} {rows} /></Fold>
</article>

<style>
  .says {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  /* The transcript's speaker line: his 18px mark, his name in label. */
  .speaker {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .mark {
    display: grid;
    place-items: center;
  }
  .words {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .title {
    font-weight: var(--weight-strong);
  }
  .acts {
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
