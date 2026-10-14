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
   * A press sends the starter's sentence as it stands, exactly as typing it
   * into the field and sending would: the same `onsend`, a new message id,
   * and the words fly from the card to the row they become (`flies`). The
   * card is pending (the kit's icon slot: its glyph gives way to the
   * spinner) until the hub has it; the other cards hold still meanwhile. A
   * refusal stands under the cards in the hub's words, and the card is
   * there to press again.
   *
   * Starters are cards on the kit's card recipe (12px radius, raised
   * surface, the tile shadow, no border), every card the tallest card's
   * height with its words centred, and tint under a press as wide controls
   * do (The Press Rule). One column on a phone; wider, as many columns of
   * at least --c-starter-w as fit (3 + 1, then 4 across at
   * --c-starters-w).
   */
  import { newId } from "#lib/cawco/id.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { departBox } from "#lib/cawco/motion/share.svelte.js";
  import PendingContent from "#lib/components/ui/button/pending-content.svelte";
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

  /** The starter whose words the hub is taking. */
  let sending = $state<string | null>(null);
  /** The starter the hub refused, and its words for it. */
  let refused = $state<{ text: string; reason: string } | null>(null);

  async function start(starter: Starter, card: HTMLElement) {
    if (sending) {
      return;
    }
    sending = starter.text;
    refused = null;
    const id = newId();
    const words = card.querySelector<HTMLElement>(".starter-text");
    if (flies && words) {
      departBox(`sent:${id}`, words);
    }
    try {
      await onsend(starter.text, id);
    } catch (error) {
      refused = {
        text: starter.text,
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      sending = null;
    }
  }

  async function send(text: string, id: string) {
    refused = null;
    await onsend(text, id);
  }
</script>

<div class="caw-starters">
  {#if starters.length > 0}
    <ul aria-label="Starters" class="cards">
      {#each starters as starter (starter.text)}
        <li>
          <button
            aria-busy={sending === starter.text || undefined}
            aria-disabled={sending !== null || undefined}
            class="starter press-tint"
            onclick={(event) => start(starter, event.currentTarget)}
            type="button"
          >
            <PendingContent
              failed={refused?.text === starter.text}
              icon={GLYPHS[starter.glyph]}
              pending={sending === starter.text}
            />
            <span class="starter-text">{starter.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if refused}
    <p class="refused" role="alert" transition:unfold>{refused.reason}</p>
  {/if}
  <CawField {flies} {label} onsend={send} {placeholder} />
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
    --btn-icon: var(--icon-md);
    --btn-gap: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--btn-gap);
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
  .starter :global(.kit-slot) {
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .starter:hover:not([aria-disabled="true"]) {
      background: var(--surface-hover);
    }
  }
  /* While one is sending the others wait: no hover, no press. */
  .starter[aria-disabled="true"] {
    cursor: default;
  }
  .starter:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .refused {
    font: var(--type-meta);
    color: var(--status-fail-ink);
    text-align: start;
  }
</style>
