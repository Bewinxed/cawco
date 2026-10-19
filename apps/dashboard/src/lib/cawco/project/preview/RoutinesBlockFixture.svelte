<script lang="ts">
  /**
   * The empty Routines block on a sheet, in the real Block with its head
   * (the clock glyph, "Routines", its count), its body the block's purpose
   * line and the starter cards on the card's own padding (WorkColumnEmpty,
   * no title): Routines said once, no borrowed composer.
   */
  import { routinesWords as words } from "@cawco/core/words/routines";
  import Block from "#lib/cawco/blocks/Block.svelte";
  import { BlockDragState } from "#lib/cawco/blocks/block-dnd.svelte.js";
  import { IconClock } from "#lib/icons.js";
  import {
    PROJECT_NAME,
    ROUTINE_STARTERS,
  } from "../../tasks/preview/tidewater";
  import WorkColumnEmpty from "../WorkColumnEmpty.svelte";

  const drag = new BlockDragState();
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
    <div class="body">
      <WorkColumnEmpty
        inBlock
        line="Caw runs work for {PROJECT_NAME} on a schedule, or when something happens."
        onpick={() => undefined}
        starters={ROUTINE_STARTERS}
      />
    </div>
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
</style>
