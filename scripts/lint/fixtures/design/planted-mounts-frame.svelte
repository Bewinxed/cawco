<!--
  Planted mistakes for house/fixture-mounts (scripts/lint/fixtures/expected.txt):
  a fixture only a states file imports (planted-mounts.stories.ts) that draws
  a control, a surface and an element standing in for one by its role, and
  calls a kit recipe; beside them what the rule must leave alone: a mounted
  component, and a wrapper that only gives the frame room.
-->
<script lang="ts">
  import PlantedMountsPart from "./planted-mounts-part.svelte";

  /** A kit recipe, as the kit's index exports one. */
  const buttonVariants = (looks: { variant: string }): string => looks.variant;
  const look = buttonVariants({ variant: "outline" });
</script>

<div data-slot="room">
  <button type="button">Move</button>
  <article>{look}</article>
  <div role="option" aria-selected="true" tabindex="0">studio</div>
  <PlantedMountsPart />
</div>
