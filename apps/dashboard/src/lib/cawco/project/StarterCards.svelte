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
   * Every card one size wherever they stand (the owner's pin: "why are
   * these not having the consistent size?"): in Caw's panel, as narrow as
   * one column, each card the panel's width and the tallest's height. A
   * card's reason (`reasons`, Caw's panel), when the hub wrote one, stands
   * under its words in the
   * muted meta caption, so the words lead and the reason says why.
   */
  let {
    starters,
    onpick,
    reasons = false,
  }: {
    starters: (Starter & { reason?: string })[];
    onpick: (text: string) => void;
    /** Each card's reason under its words (Caw's panel). */
    reasons?: boolean;
  } = $props();
</script>

<div data-slot="starter-cards" class="@container w-full">
  <!-- One column in a narrow container; wider, as many columns as fit,
       every row the tallest card's height. -->
  <ul
    data-slot="cards"
    aria-label="Starters"
    class="m-0 grid list-none auto-rows-(--cards-rows) grid-cols-1 gap-space-2 p-0 @details:grid-cols-(--cards-cols)"
    style:--cards-cols={"repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))"}
    style:--cards-rows="1fr"
  >
    {#each starters as starter (starter.text)}
      {@const Glyph = GLYPHS[starter.glyph]}
      <li class="min-w-0">
        <button
          data-slot="starter"
          class="select-none mark-line press-tint type-label flex size-full min-h-c-starter-h items-box-start gap-space-2 rounded-lg border border-solid border-border-row-outline bg-surface-raised p-space-3 text-start text-pretty text-ink-strong shadow-tile transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
          onclick={() => onpick(starter.text)}
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
            {#if reasons && starter.reason}
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
