<script lang="ts">
  /**
   * One independently failing part of the dashboard (the composer, a
   * transcript, a side panel, a conversation, the sidebar, the tabs, a page,
   * a view, one comment): the house boundary (fault/FaultBoundary) with the
   * part's words and the dashboard's Caw. Everything outside it keeps
   * working; before this, a duplicate key in the `/` menu replaced the whole
   * dashboard with a 500.
   */
  import {
    type FaultPart,
    regionFaultWords,
  } from "@cawco/core/words/region-fault";
  import type { Snippet } from "svelte";
  import FaultBoundary from "./fault/FaultBoundary.svelte";
  import { animatedCaw } from "./home/FaultCaw.svelte";

  let {
    part,
    face = "panel",
    barOver = false,
    as = "div",
    chrome,
    children,
  }: {
    /** Which part it is: what its face calls it and what it says is safe. */
    part: FaultPart;
    face?: "panel" | "page" | "line" | "strip" | "composer";
    /** A strip under the phone's floating bar (FaultBoundary). */
    barOver?: boolean;
    /** The element a line face stands in: `li` for an item of a list. */
    as?: "div" | "li";
    /** The part's own head around its face. */
    chrome?: Snippet<[Snippet]>;
    children: Snippet;
  } = $props();

  const words = $derived(regionFaultWords.parts[part]);
</script>

<FaultBoundary
  {as}
  {barOver}
  caw={animatedCaw}
  {chrome}
  {face}
  kept={"kept" in words ? words.kept : undefined}
  what={words.what}
>
  {@render children()}
</FaultBoundary>
