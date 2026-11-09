<script lang="ts">
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconChatAdd } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  /**
   * The hero of Caw's panel before a conversation starts (ProjectConversation):
   * "What's next for {project}?", the line when he is off, and the board's
   * starters as rows. From the room's top, its inline padding the composer's
   * own column (centred, with half its desk nudge, c-composer-nudge), so its
   * glyph, the title, the line and the starters share the composer's start
   * edge (--spacing-space-3 where the composer goes edge to edge,
   * under 900px): words over rows take the rows' edge (DESIGN.md, The
   * Alignment Rule). It clears the composer as a transcript does, and the
   * panel's bar where one floats over it; its scroll is the bar's scroll edge
   * (BarFloat).
   */
  import { COMPOSER_EDGE } from "./composer-edge";
  import StarterCards from "./StarterCards.svelte";

  let {
    projectName,
    off,
    starters,
    onpick,
  }: {
    projectName: string;
    /** Caw is off: he acts only when written to, and the line says so. */
    off: boolean;
    starters: Starter[];
    /** A starter puts its words in the composer, unsent. */
    onpick: (text: string) => void;
  } = $props();
</script>

<div
  class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto scroll-timeline-transcript-head px-(--hero-px) pt-(--bar-room,0px) pb-(--composer-clearance) max-desk:px-space-3"
  data-slot="conversation-hero"
  style:--hero-px={COMPOSER_EDGE}
  in:crossIn
>
  <EmptyState
    actionWidth="fill"
    icon={IconChatAdd}
    line={off
      ? "Caw is off, so he acts only when you write to him."
      : undefined}
    title="What’s next for {projectName}?"
  >
    {#snippet action()}
      {#if starters.length > 0}
        <StarterCards {onpick} rows {starters} />
      {/if}
    {/snippet}
  </EmptyState>
</div>
