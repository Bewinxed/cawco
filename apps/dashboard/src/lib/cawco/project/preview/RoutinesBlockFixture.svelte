<script lang="ts">
  /**
   * The empty Routines block on a sheet, in the real Block with its head
   * (the clock glyph, "Routines", its count). Today: what ViewRoutines draws
   * in its body (`routinesBody`, empty): the clock again with "No routines
   * yet" (EmptyState), the starters as option chips, and the session
   * Composer, words alone. Proposed: the block's purpose line and the
   * starter cards on the card's own padding (WorkColumnEmpty, no title).
   */
  import { routinesWords as words } from "@cawco/core";
  import Block from "#lib/cawco/blocks/Block.svelte";
  import { BlockDragState } from "#lib/cawco/blocks/block-dnd.svelte.js";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconClock } from "#lib/icons.js";
  import {
    PROJECT_NAME,
    ROUTINE_STARTERS,
  } from "../../tasks/preview/tidewater";
  import { GLYPHS } from "../StarterCards.svelte";
  import WorkColumnEmpty from "../WorkColumnEmpty.svelte";

  let { proposed = false }: { proposed?: boolean } = $props();

  const drag = new BlockDragState();
  const draft = new ComposerDraft();
  let foot = $state(0);
</script>

{#snippet count()}
  <span data-num data-slot="count" class="count num">0</span>
{/snippet}

<div class="page">
  <Block
    body="capped"
    card
    columns={1}
    {drag}
    first
    glyph={IconClock}
    hideable
    id="routines"
    last
    meta={count}
    onhide={() => undefined}
    onmove={() => undefined}
    ontab={() => undefined}
    onwidth={() => undefined}
    page="routines"
    resizing={false}
    span={1}
    title={words.tab}
    view={null}
    wideOnly={false}
    width="wide"
  >
    {#if proposed}
      <div class="body">
        <WorkColumnEmpty
          inBlock
          line="Caw runs work for {PROJECT_NAME} on a schedule, or when something happens."
          onpick={() => undefined}
          starters={ROUTINE_STARTERS}
        />
      </div>
    {:else}
      <div class="starters">
        <EmptyState
          icon={IconClock}
          line={words.emptyCaw(PROJECT_NAME)}
          title={words.empty}
        >
          {#snippet action()}
            <ul
              data-slot="routine-starters"
              aria-label={words.startersLabel}
              class="routine-starters kit-chips"
            >
              {#each ROUTINE_STARTERS as starter (starter.text)}
                {@const Glyph = GLYPHS[starter.glyph]}
                <li>
                  <button class="kit-chip touch-hit" type="button">
                    <Glyph aria-hidden="true" class="starter-glyph" />
                    <span>{starter.text}</span>
                  </button>
                </li>
              {/each}
            </ul>
            <div
              data-slot="ask-caw"
              class="ask-caw"
              style:block-size="calc({foot}px + var(--space-4))"
            >
              <Composer
                agentName="Caw"
                attach={false}
                {draft}
                onfoot={(next) => {
                  foot = next.stack;
                }}
                onstop={() => undefined}
                onsubmit={() => undefined}
                placeholder={words.placeholder}
              />
            </div>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  </Block>
</div>

<style>
  .page {
    display: grid;
    padding: var(--space-5) var(--space-6) var(--space-6) var(--space-7);
    background: var(--surface-recess);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .body {
    padding: var(--space-3);
  }
  /* ViewRoutines' own (.starters, .routine-starters, .ask-caw). */
  .starters {
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
    padding: var(--space-3);
  }
  .starters :global(.kit-empty-action) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-self: stretch;
  }
  .routine-starters {
    margin: 0;
    padding: 0;
    padding-inline: calc((100% - var(--c-composer-w)) / 2);
    list-style: none;

    @media (width < 900px) {
      padding-inline: var(--space-3);
    }
  }
  .routine-starters li {
    display: flex;
    max-inline-size: 100%;
  }
  .routine-starters :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .ask-caw {
    position: relative;
    flex: none;
    inline-size: 100%;
  }
</style>
