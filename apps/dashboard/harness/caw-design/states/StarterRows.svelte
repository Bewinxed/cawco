<script lang="ts">
  /**
   * PROPOSED (suggestions, C2): the project's starters as a list of the
   * panel's rows, directly above the message box and as wide as it: the
   * starter's 16px glyph on its start edge, the sentence taking the width,
   * and a trailing arrow on its end edge that says the row goes somewhere.
   * 44px tall; the hairlines between rows run from the words' start to the
   * box's end edge; the hover ghost and the press tint take the whole row.
   * A press puts the sentence in the message box, unsent.
   */
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import { IconChevronRight } from "#lib/icons.js";

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
        <span class="go mark-cell"><IconChevronRight aria-hidden="true" /></span
        >
      </button>
    </li>
  {/each}
</ul>

<style>
  /* The rows run the message box's width: the glyph on its start edge, the
     arrow's ink on its end edge, the words taking all between. */
  .rows {
    --text-x: calc(var(--icon-md) + var(--space-3));

    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The separator from the words' start to the box's end edge. */
  .rows li + li {
    background: linear-gradient(var(--border-hairline), var(--border-hairline))
      no-repeat var(--text-x) 0 / calc(100% - var(--text-x)) 1px;
  }
  /* The hover ghost reaches --space-2 past the row on each side as a
     shadow, which takes no room, so the words keep the box's edges. */
  .row {
    display: grid;
    grid-template-columns: var(--icon-md) minmax(0, 1fr) var(--icon-md);
    align-items: center;
    column-gap: var(--space-3);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-lg);
    padding: var(--space-2) 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        box-shadow var(--dur-control) var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
        box-shadow:
          calc(var(--space-2) * -1) 0 0 0 var(--surface-hover),
          var(--space-2) 0 0 0 var(--surface-hover);
      }
    }
  }
  .glyph {
    color: var(--ink-muted);
  }
  .glyph :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .glyph :global(svg [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }
  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .go {
    color: var(--ink-muted);
  }
  .go :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
</style>
