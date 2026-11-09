<script lang="ts">
  /**
   * The board's empty states (`EmptyState` with `centre`) as their callers
   * draw them, for their states files: `setup`, the board before it is set
   * up as Caw offers it (the real SetupScene with his seat, a short block
   * centred as one, one outline button); `starters`, the empty board as
   * ProjectPage draws it (`centre="mark"`): Caw at 80 centred over the
   * starters, the title, the line and the starters on their left edge;
   * `panel`, the same board while his panel is open and holds the
   * starters, so nothing is drawn under the words and Caw stands over
   * their middle; `none`, the not-set-up board where Caw can't start: the
   * folder glyph, no action, centred as one block. Caw stands in at rest,
   * with no head to sit down in.
   */
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { RESTING_LEAD } from "#lib/cawco/project/caw-lead.fixture.js";
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";

  let {
    look,
    starters = [],
  }: {
    look: "setup" | "starters" | "panel" | "none";
    starters?: Starter[];
  } = $props();
</script>

{#if look === "starters" || look === "panel"}
  <div class="mx-auto w-full max-w-c-starters-w">
    <EmptyState
      centre="mark"
      line="Tell Caw what to do: the tasks Caw files move through Backlog, In progress, Review and Done. One waiting on you shows in Review."
      title="Nothing on the board yet"
    >
      {#snippet mark()}
        <div data-slot="caw-80" class="mb-space-3 grid justify-items-center">
          <CawSeat
            lead={RESTING_LEAD}
            projectId="launch"
            projectName="Launch"
            size={80}
          />
        </div>
      {/snippet}
      {#snippet action()}
        {#if look === "starters"}
          <StarterCards onpick={() => undefined} {starters} />
        {/if}
      {/snippet}
    </EmptyState>
  </div>
{:else if look === "setup"}
  <SetupScene act={{ kind: "ask", ask: () => undefined }} {seat} />
{:else}
  <SetupScene act={{ kind: "none" }} />
{/if}

{#snippet seat()}
  <div data-slot="caw-80" class="grid justify-items-center">
    <CawSeat
      lead={RESTING_LEAD}
      projectId="launch"
      projectName="Launch"
      size={80}
    />
  </div>
{/snippet}
