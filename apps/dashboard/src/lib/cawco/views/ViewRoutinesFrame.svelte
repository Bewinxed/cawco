<script lang="ts">
  /**
   * The states file's seam (ViewRoutines.stories.ts): the live Routines
   * page (ViewRoutines) for Cawco-Dev, its reads answered by the story's
   * stand-in hub (hub-stand-in `hubAs`). Its other blocks stand hidden: the
   * suggestion is judged in the routines' own. A state with no routine
   * names the chips the empty state offers and Caw able to start; one where
   * he can't says why. `pressed` presses Caw's chip once it is drawn, as
   * the person would. Caw stands in at rest (`lead`), with no head to
   * sit down in.
   */
  import { routinesWords } from "@cawco/core/words/routines";
  import { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
  import {
    RESTING_LEAD,
    sitDownNowhere,
  } from "#lib/cawco/project/caw-lead.fixture.js";
  import type { ProjectStarter } from "#lib/cawco/project-tasks.js";
  import { PROJECT } from "./routines-fixture";
  import ViewRoutines from "./ViewRoutines.svelte";

  let {
    starters = [],
    canTalk = false,
    pressed = false,
  }: {
    /** What the empty page offers to ask Caw for. */
    starters?: ProjectStarter[];
    /** Caw can start: the empty page's chips and composer stand. */
    canTalk?: boolean;
    /** Caw's chip pressed: its ask in the composer, unsent. */
    pressed?: boolean;
  } = $props();

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

  let root = $state<HTMLElement | null>(null);
  // The chip stands once the page's read lands: it is pressed when drawn.
  $effect(() => {
    const within = root;
    if (!(pressed && within)) {
      return;
    }
    const press = (): boolean => {
      const chip = [...within.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === routinesWords.trimAsk
      );
      chip?.click();
      return chip !== undefined;
    };
    if (press()) {
      return;
    }
    const drawn = new MutationObserver(() => {
      if (press()) {
        drawn.disconnect();
      }
    });
    drawn.observe(within, { childList: true, subtree: true });
    return () => drawn.disconnect();
  });
</script>

<div
  bind:this={root}
  class="flex min-h-0 w-full flex-auto flex-col bg-surface-page p-space-5"
>
  <ViewRoutines
    {blocks}
    {canTalk}
    lead={RESTING_LEAD}
    sitDown={sitDownNowhere}
    cawProblem={canTalk ? null : "Caw's machine is away in this frame."}
    project={PROJECT}
    {starters}
    viewItems={{}}
  />
</div>
