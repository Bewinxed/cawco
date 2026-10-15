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
  const GLYPHS: Record<
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
   * What to ask Caw (The Empty Starts Work Rule): the project's starters,
   * each a sentence the person would say to him with the glyph for its kind
   * of work. The starters are the hub's, written for the project's template
   * (stages.ts `startersFor`), so they name this kind of project's work.
   *
   * A press hands the starter's sentence to `onpick`, which puts it in Caw's
   * composer with the caret after it: nothing is sent. The words are
   * written for Caw and editable before they go.
   *
   * Each is the kit option chip (app.css `.kit-chip`, in a `.kit-chips`
   * row, as New project's starters are), its glyph leading, the row
   * wrapping whole chips and centred under Caw.
   */
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
  .caw-starters :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
</style>
