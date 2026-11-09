<script lang="ts">
  /**
   * The axis empty state (`EmptyState` with `axis`) as its callers draw it,
   * for its states file: `setup`, the board before it is set up (the real
   * SetupScene, one outline button); `starters`, an empty board's column of
   * starters filling the block; `none`, the not-set-up board with no action.
   */
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import { IconFolder } from "#lib/icons.js";

  let {
    look,
    starters = [],
  }: {
    look: "setup" | "starters" | "none";
    starters?: Starter[];
  } = $props();
</script>

{#if look === "starters"}
  <div class="mx-auto w-full max-w-c-starters-w">
    <EmptyState
      actionWidth="fill"
      axis
      icon={IconFolder}
      line="Pick one to start, or tell Caw what you need."
      title="Nothing on the board yet"
    >
      {#snippet action()}
        <StarterCards onpick={() => undefined} {starters} />
      {/snippet}
    </EmptyState>
  </div>
{:else}
  <SetupScene
    act={look === "setup"
      ? { kind: "ask", ask: () => undefined }
      : { kind: "none" }}
  />
{/if}
