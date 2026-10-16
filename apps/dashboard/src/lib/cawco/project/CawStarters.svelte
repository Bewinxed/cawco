<script lang="ts">
  /**
   * What to ask Caw (The Empty Starts Work Rule), under him in his panel:
   * the project's starters, each a sentence the person would say to him
   * with the glyph for its kind of work. The starters are the hub's,
   * written for the project from what it holds now (project-starters.ts),
   * in its order.
   *
   * A press hands the starter's sentence to `onpick`, which puts it in his
   * composer with the caret after it: nothing is sent. Each is the kit
   * option chip (app.css `.kit-chip` in a `.kit-chips` row, as New
   * project's starters are), its glyph leading, the row wrapping whole
   * chips and centred under Caw.
   */
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import { GLYPHS } from "./StarterCards.svelte";

  let {
    starters,
    onpick,
  }: {
    starters: Starter[];
    onpick: (text: string) => void;
  } = $props();
</script>

{#if starters.length > 0}
  <ul aria-label="Things to ask Caw" class="caw-starters kit-chips">
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li>
        <button
          class="kit-chip touch-hit"
          onclick={() => onpick(starter.text)}
          type="button"
        >
          <Glyph aria-hidden="true" class="starter-glyph" />
          <span>{starter.text}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .caw-starters {
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .caw-starters li {
    display: flex;
    max-inline-size: 100%;
  }
  /* The glyph in the words' own ink: a Solar duotone's half-ink layer in
     muted ink fades into the chip (the magnifier's handle went, its lens
     left as a grey dot), in the strong ink each layer stands clear. */
  .caw-starters :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-strong);
  }
</style>
