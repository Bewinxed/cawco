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
   * An empty state that starts Caw's work on it (The Empty Starts Work
   * Rule): three or four starters, each a sentence the person would say to
   * Caw with the glyph for its kind of work, then the field to Caw under
   * them. The starters are the hub's, written for the project's template
   * (stages.ts `startersFor`), so they name this kind of project's work.
   *
   * A press puts the starter's sentence into the field and the caret after
   * it: nothing is sent. The words are written for Caw and editable before
   * they go; the field's own send sends them (CawField: pending, the hub's
   * refusal under it, the words flying to their row with `flies`). Another
   * press replaces the field's words with that card's.
   *
   * Starters are cards on the kit's card recipe (12px radius, raised
   * surface, the tile shadow, no border), every card the tallest card's
   * height with its words centred, and tint under a press as wide controls
   * do (The Press Rule). One column on a phone; wider, as many columns of
   * at least --c-starter-w as fit (3 + 1, then 4 across at
   * --c-starters-w).
   */
  import { tick } from "svelte";
  import CawField from "./CawField.svelte";

  let {
    starters,
    onsend,
    label = "Ask Caw",
    placeholder = "Message the project…",
    flies = false,
  }: {
    starters: Starter[];
    /** Sends the words to Caw as message `id`; a throw is the hub's refusal. */
    onsend: (text: string, id: string) => Promise<unknown>;
    /** The field's label, read out. */
    label?: string;
    placeholder?: string;
    /** The sent words fly to the row they become (CawField). */
    flies?: boolean;
  } = $props();

  /** The field's words: a starter's once pressed, then the person's. */
  let text = $state("");
  let root = $state<HTMLElement | null>(null);

  /** The starter's words go into the field, the caret after them; nothing is sent. */
  async function start(starter: Starter) {
    ({ text } = starter);
    await tick();
    const field = root?.querySelector<HTMLTextAreaElement>(
      "textarea:not([aria-hidden])"
    );
    if (field) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }

  async function send(words: string, id: string) {
    await onsend(words, id);
  }
</script>

<div class="caw-starters" bind:this={root}>
  {#if starters.length > 0}
    <ul aria-label="Starters" class="cards">
      {#each starters as starter (starter.text)}
        {@const Glyph = GLYPHS[starter.glyph]}
        <li>
          <button
            class="starter press-tint"
            onclick={() => start(starter)}
            type="button"
          >
            <Glyph aria-hidden="true" class="starter-glyph" />
            <span class="starter-text">{starter.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <CawField {flies} {label} onsend={send} {placeholder} bind:text />
</div>

<style>
  .caw-starters {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 100%;
    container-type: inline-size;
  }
  .cards {
    display: grid;
    /* One column on a phone. */
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
