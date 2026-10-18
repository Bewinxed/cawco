<script lang="ts">
  /**
   * PROPOSED (suggestions, C2): the project's starters as a list of the
   * panel's rows, directly above the message box: the starter's 16px glyph
   * centred in the 28px lead column, its sentence on the text column, and a
   * trailing arrow that says the row goes somewhere. 44px tall; the
   * hairlines between rows start on the text column, as a list's
   * separators do, so they never run under the glyphs; the hover ghost and
   * the press tint take the whole row. A press puts the sentence in the
   * message box, unsent.
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
  .rows {
    --text-x: calc(var(--space-3) + var(--lead-col) + var(--space-3));

    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The separator from the text column to the row's end. */
  .rows li + li {
    background: linear-gradient(var(--border-hairline), var(--border-hairline))
      no-repeat var(--text-x) 0 / calc(100% - var(--text-x)) 1px;
  }
  .row {
    display: grid;
    grid-template-columns: var(--lead-col) minmax(0, 1fr) auto;
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
    text-wrap: pretty;
  }
  .go {
    color: var(--ink-muted);
  }
  .go :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
</style>
