<script lang="ts">
  import DesignGraph from "#lib/cawco/graph/DesignGraph.svelte";
  import { pageStory } from "#lib/cawco/graph/preview/page-story.js";
  import { roster } from "#lib/cawco/graph/roster-review.js";
  import { routineForm } from "#lib/cawco/graph/routine-form-review.js";
  /**
   * The design graph, mounted once with its real records: the routine form
   * and Who decides' roster from their own states files, as an agent opens
   * them with the ask "Judge the Create routine form at Save failed".
   * `?link=lost` draws the hub's link down; `?face=whole` and `?face=move`
   * open the room on the map or the animation, as an ask may name them;
   * `?state=<story>` opens the routine form at another of its states.
   * `?story=<export>` draws one of the design graph's own states
   * (DesignGraph.stories.ts) on the page instead, its hardening cases
   * among them, so each is read at the window's own width.
   */
  import { page } from "$app/state";

  const said = page.url.searchParams;
  const story = pageStory(said.get("story") ?? "");
  const inputs = story?.alone
    ? [story.alone]
    : [routineForm, ...(story && !story.withRoster ? [] : [roster])];
  const face =
    (["states", "whole", "move"] as const).find(
      (one) => one === (said.get("face") ?? story?.ask?.face)
    ) ?? "states";
</script>

<svelte:head><title>Design graph</title></svelte:head>

<div class="h-dvh">
  <DesignGraph
    ask={{
      ...(story?.ask ?? {
        component: "Routine form",
        state: said.get("state") ?? "FailedSave",
      }),
      face,
    }}
    {inputs}
    lang={story?.lang}
    opensAt={story?.opensAt}
    stale={said.get("link") === "lost" || story?.stale === true}
  />
</div>
