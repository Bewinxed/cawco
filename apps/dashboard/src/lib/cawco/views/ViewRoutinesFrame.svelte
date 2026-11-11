<script lang="ts">
  /**
   * The states file's seam (ViewRoutines.stories.ts): the live Routines
   * page (ViewRoutines) for Cawco-Dev, its reads answered by the story's
   * stand-in hub (hub-stand-in `hubAs`), Caw unable to start so no
   * composer reaches for the live client. Its other blocks stand hidden: the
   * suggestion is judged in the routines' own.
   */
  import { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
  import { PROJECT } from "./routines-fixture";
  import ViewRoutines from "./ViewRoutines.svelte";

  const blocks = new ProjectBlocks(
    () => PROJECT.id,
    () => []
  );
  $effect.pre(() => {
    blocks.arrangement = {
      pages: {
        routines: [
          { block: "routines", width: "wide", hidden: false },
          { block: "sources", width: "narrow", hidden: true },
          { block: "actions", width: "narrow", hidden: true },
        ],
      },
      proposed: [],
    };
  });
</script>

<div class="flex min-h-0 w-full flex-auto flex-col bg-surface-page p-space-5">
  <ViewRoutines
    {blocks}
    canTalk={false}
    cawProblem="Caw's machine is away in this frame."
    project={PROJECT}
    starters={[]}
    viewItems={{}}
  />
</div>
