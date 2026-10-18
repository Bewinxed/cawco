<script lang="ts">
  /**
   * PROPOSED (suggestions, C2): the project's starters as a list of the
   * panel's rows, directly above the message box: the starter's 16px glyph
   * centred in the 28px lead column, its sentence on the text column, 44px
   * tall, hairlines between, the hover ghost under the pointer. A press
   * puts the sentence in the message box, unsent.
   */
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";

  let {
    starters,
    onpick,
  }: { starters: Starter[]; onpick: (text: string) => void } = $props();
</script>

<ul aria-label="Things to ask Caw" class="rows" data-design-starter-rows>
  {#each starters as starter (starter.text)}
    {@const Glyph = GLYPHS[starter.glyph]}
    <li>
      <button
        class="row press-tint"
        onclick={() => onpick(starter.text)}
        type="button"
      >
        <span class="glyph mark-cell"><Glyph aria-hidden="true" /></span>
        <span class="text">{starter.text}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rows li + li {
    border-block-start: 1px solid var(--border-hairline);
  }
  .row {
    display: grid;
    grid-template-columns: var(--lead-col) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-lg);
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;

    @media (prefers-reduced-motion: no-preference) {
      transition: background-color var(--dur-control) var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
  }
  .glyph {
    justify-self: center;
  }
  .glyph :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
</style>
