<script lang="ts">
  /**
   * The axis empty state (`EmptyState` with `axis`) as its callers draw it,
   * for its states file: `setup`, the board before it is set up as Caw
   * offers it (the real SetupScene with his seat, the whole block on the
   * axis, one outline button);
   * `starters`, the empty board as ProjectPage draws it (`axis="mark"`):
   * Caw at 80 centred over the column, the title, the line and the
   * starters on its left edge; `none`, the not-set-up board where Caw
   * can't start: the folder glyph, no action, the whole block on the axis.
   * Caw stands in at rest, with no head to sit down in.
   */
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { RESTING_LEAD } from "#lib/cawco/project/caw-lead.fixture.js";
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import EmptyState from "./empty-state.svelte";

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
      axis="mark"
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
        <StarterCards onpick={() => undefined} {starters} />
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
