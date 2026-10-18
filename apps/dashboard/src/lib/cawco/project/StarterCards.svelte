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
    IconRulerPen,
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
    system: IconRulerPen,
    tasks: IconToolTodo,
    triage: IconSort,
    voice: IconMic,
  };
</script>

<script lang="ts">
  /**
   * A project's starters as cards (The Empty Starts Work Rule): each a
   * sentence the person would say to Caw with the glyph for its kind of
   * work. The starters are the hub's, written for the project from what it
   * holds now (project-starters.ts), in its order. A press hands the
   * sentence to whatever field stands under them (`onpick`); nothing is
   * sent. The empty board's (into Caw's panel, `lead.askStarter`) and a
   * thread tab's hero (into its composer) both take them so.
   *
   * Cards on the kit's card recipe (12px radius, raised surface, the tile
   * shadow, no border), every card the tallest card's height with its words
   * centred, tinting under a press as wide controls do (The Press Rule). One
   * column in a narrow container; wider, as many columns of at least
   * --c-starter-w as fit (3 + 1, then 4 across at --c-starters-w).
   *
   * `rows`: in Caw's panel, the same tiles as suggestion rows, one under the
   * other, each as wide as its words and no wider (the owner's pin 22), its
   * reason under its words when the hub wrote one: a smaller caption in the
   * muted ink, so the words lead and the reason says why (pin 10).
   */
  let {
    starters,
    onpick,
    rows = false,
  }: {
    starters: (Starter & { reason?: string })[];
    onpick: (text: string) => void;
    rows?: boolean;
  } = $props();
</script>

<div
  data-slot="starter-cards"
  class="starter-cards"
  data-rows={rows || undefined}
>
  <ul
    data-slot="cards"
    aria-label={rows ? "Things to ask Caw" : "Starters"}
    class="cards"
  >
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li>
        <button
          data-slot="starter"
          class="starter mark-line press-tint"
          onclick={() => onpick(starter.text)}
          type="button"
        >
          <span class="mark-cell"
            ><Glyph
              data-starter-glyph
              aria-hidden="true"
              class="starter-glyph"
            /></span
          >
          <span class="starter-words" data-box>
            <span data-slot="starter-text" class="starter-text"
              >{starter.text}</span
            >
            {#if rows && starter.reason}
              <span data-slot="starter-reason" class="starter-reason"
                >{starter.reason}</span
              >
            {/if}
          </span>
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
    align-items: start;
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
  /* The glyph in the words' own ink, so its duotone's darker layer stands
     clear of the card. */
  .starter :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-strong);
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
  .starter-words {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .starter-text {
    overflow-wrap: anywhere;
  }
  /* Why it is offered: under the words, a step down in size and ink. */
  .starter-reason {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  /* Suggestion rows: one under the other, each as wide as its words (never
     past the column), at a row's height rather than a card's. */
  [data-rows] .cards {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  [data-rows] li {
    max-inline-size: 100%;
  }
  [data-rows] .starter {
    inline-size: auto;
    max-inline-size: 100%;
    block-size: auto;
    min-block-size: var(--c-btn-h);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }
</style>
