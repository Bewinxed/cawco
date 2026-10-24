<script lang="ts">
  /**
   * The empty Routines block's body (ViewRoutines). Its head already says
   * Routines with its glyph, so this says neither again (the owner's pin:
   * "ur repeating icons and titles again"), and no composer stands in it
   * ("why is the composer even there?"): the block's purpose line, then
   * the project's starters and Ask Caw for a routine, each opening Caw's
   * panel with its words, unsent (WorkColumnEmpty `inBlock`, StarterCards).
   * Where Caw can't start, his reason stands in its own line over the way
   * by hand (CantStart).
   */
  import { CAW_NO_MACHINE, projectWords, routinesWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import CantStart from "#lib/cawco/CantStart.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import WorkColumnEmpty from "#lib/cawco/project/WorkColumnEmpty.svelte";
  import type { ProjectStarter } from "#lib/cawco/project-tasks.js";

  let {
    projectName,
    starters,
    canTalk,
    cawProblem = null,
    onask,
    byHand,
  }: {
    projectName: string;
    /** What the project repeats or waits on, written for it (hub project-starters.ts). */
    starters: ProjectStarter[];
    /** Caw can start: the starters reach him. */
    canTalk: boolean;
    /** Why Caw can't start, said instead. */
    cawProblem?: string | null;
    /** Caw's panel with these words in his composer, unsent. */
    onask: (text: string) => void;
    /** The way by hand while Caw can't start: Create routine. */
    byHand: Snippet;
  } = $props();

  /** The project's own starters, then the block's own ask. */
  const shown = $derived<ProjectStarter[]>([
    ...starters,
    {
      glyph: "grill",
      text: projectWords.askForRoutine,
      reason: "",
      sources: [],
    },
  ]);
  /** A starter's words, into Caw's panel; the block's own ask, his words for a routine. */
  function pick(text: string) {
    onask(
      text === projectWords.askForRoutine
        ? projectWords.routineAsk(projectName)
        : text
    );
  }
</script>

<WorkColumnEmpty inBlock line={routinesWords.emptyWhat(projectName)}>
  {#if canTalk}
    <StarterCards onpick={pick} starters={shown} />
  {:else}
    <CantStart {byHand} reason={cawProblem ?? CAW_NO_MACHINE} />
  {/if}
</WorkColumnEmpty>
