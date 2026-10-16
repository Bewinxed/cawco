<script lang="ts" module>
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import type { Starter, StarterGlyph } from "#lib/cawco/project-tasks.js";
  import {
    IconAccounts,
    IconAsk,
    IconBug,
    IconCalendar,
    IconChat,
    IconClock,
    IconColumns,
    IconDocument,
    IconGlobe,
    IconLayers,
    IconMic,
    IconPalette,
    IconPen,
    IconRefresh,
    IconRocket,
    IconSearch,
    IconSend,
    IconSort,
    IconStars,
    IconToolTodo,
    IconWindow,
  } from "#lib/icons.js";

  /** Each kind of work a starter names (the hub's `STARTER_GLYPHS`), as its Solar duotone glyph. */
  export const GLYPHS: Record<
    StarterGlyph,
    Component<SVGAttributes<SVGSVGElement>>
  > = {
    brief: IconDocument,
    bug: IconBug,
    calendar: IconCalendar,
    draft: IconPen,
    explore: IconLayers,
    grill: IconAsk,
    ideas: IconStars,
    mail: IconSend,
    palette: IconPalette,
    people: IconAccounts,
    refresh: IconRefresh,
    reply: IconChat,
    rocket: IconRocket,
    routine: IconClock,
    screen: IconWindow,
    search: IconSearch,
    site: IconGlobe,
    stages: IconColumns,
    tasks: IconToolTodo,
    triage: IconSort,
    voice: IconMic,
  };
</script>

<script lang="ts">
  /**
   * A project's starters as cards (The Empty Starts Work Rule): each a
   * sentence the person would say to Caw with the glyph for its kind of
   * work. The starters are the hub's, written for the project's template
   * (stages.ts `startersFor`), so they name this kind of project's work.
   * A press hands the sentence to whatever field stands under them
   * (`onpick`); nothing is sent. The empty board's field (CawStarters) and a
   * thread's composer (ThreadPane's hero) both take them so.
   *
   * Cards on the kit's card recipe (12px radius, raised surface, the tile
   * shadow, no border), every card the tallest card's height with its words
   * centred, tinting under a press as wide controls do (The Press Rule). One
   * column in a narrow container; wider, as many columns of at least
   * --c-starter-w as fit (3 + 1, then 4 across at --c-starters-w).
   */
  let {
    starters,
    onpick,
  }: {
    starters: Starter[];
    onpick: (text: string) => void;
  } = $props();
</script>

<div class="starter-cards">
  <ul aria-label="Starters" class="cards">
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li>
        <button
          class="starter mark-line press-tint"
          onclick={() => onpick(starter.text)}
          type="button"
        >
          <Glyph aria-hidden="true" class="starter-glyph" />
          <span class="starter-text">{starter.text}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .starter-cards {
    inline-size: 100%;
    container-type: inline-size;
  }
  .cards {
    display: grid;
    /* One column in a narrow container. */
    grid-template-columns: minmax(0, 1fr);
    /* Every card the tallest card's height (routines-wireframe §7.5). */
    grid-auto-rows: 1fr;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @container (min-width: 30rem) {
    .cards {
      grid-template-columns: repeat(
        auto-fill,
        minmax(min(100%, var(--c-starter-w)), 1fr)
      );
    }
  }
  .starter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    block-size: 100%;
    min-block-size: var(--c-starter-h);
    padding: var(--space-3);
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    text-wrap: pretty;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .starter :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .starter:hover {
      background: var(--surface-hover);
    }
  }
  .starter:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
</style>
