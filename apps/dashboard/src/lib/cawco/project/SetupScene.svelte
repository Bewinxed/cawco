<script lang="ts">
  /**
   * A project's board before it is set up, with no setup under way: Caw off,
   * or a project made without him, or a setup left long ago. The house
   * empty state (The Caw Stands On The Axis Rule): his live seat centred
   * over the column, "Not set up yet", what fills the board and the one way
   * to start (Set it up with Caw) on its left edge, as on the empty board
   * (`axis="mark"`); where he can't start, the folder glyph, the title and
   * the line centred as one block. Once he sets it up, his draft takes the board's place as the
   * board it becomes (SetupDraft).
   */
  import { setupWords } from "@cawco/core/words/onboarding";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconFolder } from "#lib/icons.js";

  type Action = { kind: "ask"; ask: () => void } | { kind: "none" };

  let {
    act,
    seat,
  }: {
    /** The board's one action: ask him to set it up, or none. */
    act: Action;
    /** His live seat over the middle; none where he can't start. */
    seat?: Snippet;
  } = $props();
</script>

{#snippet action()}
  {#if act.kind === "ask"}
    <Button label={setupWords.askSetup} onclick={act.ask} variant="outline" />
  {/if}
{/snippet}

{#snippet seated()}
  <div class="mb-space-3 grid justify-items-center">{@render seat?.()}</div>
{/snippet}

<div
  data-slot="setup-scene"
  class="flex h-full min-h-0 w-full flex-auto flex-col items-center justify-center px-space-5 pt-space-6 pb-space-4"
>
  <div class="w-full max-w-c-measure">
    {#if seat}
      <EmptyState
        actionWidth="fill"
        axis="mark"
        line={setupWords.notSetUpLine}
        mark={seated}
        title={setupWords.notSetUp}
        {action}
      />
    {:else}
      <EmptyState
        actionWidth="fill"
        axis
        icon={IconFolder}
        line={setupWords.notSetUpLine}
        title={setupWords.notSetUp}
        {action}
      />
    {/if}
  </div>
</div>
