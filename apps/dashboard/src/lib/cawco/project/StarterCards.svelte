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
   */
  let {
    starters,
    onpick,
  }: {
    starters: Starter[];
    onpick: (text: string) => void;
  } = $props();
</script>

<div data-slot="starter-cards" class="@container w-full">
  <!-- One column in a narrow container; wider, as many columns as fit. -->
  <ul
    data-slot="cards"
    aria-label="Starters"
    class="m-0 grid list-none auto-rows-fr grid-cols-1 gap-space-2 p-0 @details:grid-cols-(--cards-cols)"
    style:--cards-cols="repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"
  >
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li>
        <button
          data-slot="starter"
          class="mark-line press-tint type-label flex size-full min-h-c-starter-h cursor-pointer items-center gap-space-2 rounded-lg border-none border-current bg-surface-raised p-space-3 text-start text-pretty text-ink-strong shadow-tile transition-[background-color] dur-control ease-out hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
          onclick={() => onpick(starter.text)}
          type="button"
        >
          <Glyph data-starter-glyph aria-hidden="true" class="size-icon-md flex-none text-ink-strong" />
          <span data-slot="starter-text">{starter.text}</span>
        </button>
      </li>
    {/each}
  </ul>
</div>
