<script lang="ts">
  /**
   * The empty Routines block on a sheet, in the real Block with its head
   * (the clock glyph, "Routines", its count), its body the block's purpose
   * line and the starter cards on the card's own padding (WorkColumnEmpty,
   * no title): Routines said once, no borrowed composer. A routine is asked
   * for in Caw's panel: after the project's own starters stands "Ask Caw
   * for a routine", and every starter's press opens Caw with its words,
   * unsent (StarterCards, as Caw's empty view takes them).
   */
  import { routinesWords as words } from "@cawco/core/words/routines";
  import Block from "#lib/cawco/blocks/Block.svelte";
  import { BlockDragState } from "#lib/cawco/blocks/block-dnd.svelte.js";
  import type { ProjectStarter } from "#lib/cawco/project-tasks.js";
  import { IconClock } from "#lib/icons.js";
  import {
    PROJECT_NAME,
    ROUTINE_STARTERS,
  } from "../../tasks/preview/tidewater";
  import WorkColumnEmpty from "../WorkColumnEmpty.svelte";

  const drag = new BlockDragState();
  /** The block's own way in: its glyph is the ask, not the head's clock. */
  const starters: ProjectStarter[] = [
    ...ROUTINE_STARTERS,
    { glyph: "grill", text: "Ask Caw for a routine", reason: "", sources: [] },
  ];
</script>

{#snippet count()}
  <span data-num data-slot="count" class="num type-meta text-ink-subtle">0</span
  >
{/snippet}

<div class="grid bg-surface-recess pt-space-5 ps-space-7 pe-space-6 pb-space-6">
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
    <div class="p-space-3">
      <WorkColumnEmpty
        inBlock
        line="Caw runs work for {PROJECT_NAME} on a schedule, or when something happens."
        onpick={() => undefined}
        {starters}
      />
    </div>
  </Block>
</div>
