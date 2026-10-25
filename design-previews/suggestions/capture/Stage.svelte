<!--
  The capture stage (capture.ts): Suggestions drawn in every look, set and
  placement the preview shows, and today's StarterCards beside them, each
  mounted once with the club's starters (lib/cawco/suggestions/examples.ts),
  so the static page is made of their own markup laid out by the
  dashboard's own stylesheet. Nothing here is shown to anyone; capture.ts
  reads each `data-part` and writes it into parts.js.
-->
<script>
  import StarterCards from "../../../apps/dashboard/src/lib/cawco/project/StarterCards.svelte";
  import {
    DECISIONS,
    LONG,
    MANY,
    ONE,
    THREE,
  } from "../../../apps/dashboard/src/lib/cawco/suggestions/examples.ts";
  import Suggestions, {
    SUGGESTION_LOOKS,
  } from "../../../apps/dashboard/src/lib/cawco/suggestions/Suggestions.svelte";

  const none = () => undefined;
  const THREAD = "Things to ask Caw";
  const PANEL = "Choices to ask Caw for";
  /** [set, suggestions, placement, label, skeletons] */
  const SETS = [
    ["three", THREE, "thread", THREAD, 0],
    ["one", ONE, "thread", THREAD, 0],
    ["many", MANY, "thread", THREAD, 0],
    ["long", LONG, "thread", THREAD, 0],
    ["loading", THREE, "thread", THREAD, 3],
    ["decisions", DECISIONS, "panel", PANEL, 0],
  ];
  /** Today's: the rows Caw's panel hero draws, the cards an empty panel draws. */
  const today = (list) => list.map(({ glyph, text, reason }) => ({ glyph, text, reason }));
</script>

<main style="display: grid; gap: 24px; padding: 24px; inline-size: 1200px">
  {#each SUGGESTION_LOOKS as look (look)}
    {#each SETS as [set, suggestions, placement, label, loading] (set)}
      <div data-part="{look}:{set}" style="inline-size: 380px">
        <Suggestions {label} {loading} {look} onpick={none} {placement} {suggestions} />
      </div>
    {/each}
  {/each}
  <div data-part="today:three" style="inline-size: 380px">
    <StarterCards onpick={none} rows starters={today(THREE)} />
  </div>
  <div data-part="today:long" style="inline-size: 380px">
    <StarterCards onpick={none} rows starters={today(LONG)} />
  </div>
  <div data-part="today:decisions" style="inline-size: 760px">
    <StarterCards onpick={none} starters={today(DECISIONS)} />
  </div>
</main>
