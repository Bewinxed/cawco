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
    IconRenew,
    IconRocket,
    IconRulerPen,
    IconSearch,
    IconSend,
    IconSort,
    IconStars,
    IconTaskList,
    IconWindow,
  } from "#lib/icons.js";

  /**
   * Each kind of work a starter names (the hub's `STARTER_GLYPHS`), as its
   * Solar duotone glyph: each one a mark on its half-ink body (The Solar
   * Duotone Rule), never strokes alone beside a filled one.
   */
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
    refresh: IconRenew,
    reply: IconChat,
    rocket: IconRocket,
    routine: IconClock,
    screen: IconWindow,
    search: IconSearch,
    site: IconGlobe,
    stages: IconColumns,
    system: IconRulerPen,
    tasks: IconTaskList,
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
  class="group/starters @container w-full"
  data-rows={rows || undefined}
>
  <!-- One column in a narrow container; wider, as many columns as fit.
       Suggestion rows (`rows`): one under the other, each as wide as its
       words (never past the column), at a row's height rather than a
       card's. -->
  <ul
    data-slot="cards"
    aria-label={rows ? "Things to ask Caw" : "Starters"}
    class="m-0 grid list-none auto-rows-(--cards-rows) grid-cols-1 gap-space-2 p-0 @details:grid-cols-(--cards-cols) group-data-rows/starters:flex group-data-rows/starters:flex-col group-data-rows/starters:items-start"
    style:--cards-cols={"repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"}
    style:--cards-rows="1fr"
  >
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li class="group-data-rows/starters:max-w-full">
        <!-- literal: calc(var(--space-2) - 1px), calc(var(--space-3) - 1px) -->
        <button
          data-slot="starter"
          class="mark-line press-tint type-label flex size-full min-h-c-starter-h cursor-pointer items-box-start gap-space-2 rounded-lg border-none border-current bg-surface-raised p-space-3 text-start text-pretty text-ink-strong shadow-tile transition-[background-color] dur-control ease-out hover-hover:[&:hover]:bg-surface-hover group-data-rows/starters:h-auto group-data-rows/starters:min-h-c-btn-h group-data-rows/starters:w-auto group-data-rows/starters:max-w-full group-data-rows/starters:rounded-md group-data-rows/starters:border group-data-rows/starters:border-solid group-data-rows/starters:border-border-row-outline group-data-rows/starters:px-(--row-px) group-data-rows/starters:py-(--row-py) group-data-rows/starters:shadow-none focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
          onclick={() => onpick(starter.text)}
          style:--row-px="calc(var(--space-3) - 1px)"
          style:--row-py="calc(var(--space-2) - 1px)"
          type="button"
        >
          <span class="mark-cell"
            ><Glyph
              data-starter-glyph
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-strong"
            /></span
          >
          <span class="flex min-w-0 flex-col gap-space-1" data-box>
            <span data-slot="starter-text" class="wrap-anywhere"
              >{starter.text}</span
            >
            {#if rows && starter.reason}
              <span
                data-slot="starter-reason"
                class="type-meta text-pretty wrap-anywhere text-ink-muted"
                >{starter.reason}</span
              >
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>
