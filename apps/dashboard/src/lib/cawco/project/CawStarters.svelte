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
  <ul
    data-slot="caw-starters"
    aria-label="Things to ask Caw"
    class="kit-chips m-0 list-none justify-center p-0"
  >
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li class="flex max-w-full">
        <button
          class="kit-chip touch-hit"
          onclick={() => onpick(starter.text)}
          type="button"
        >
          <Glyph data-starter-glyph aria-hidden="true" class="size-icon-md flex-none text-ink-strong" />
          <span>{starter.text}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}
