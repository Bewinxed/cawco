<script lang="ts">
  /**
   * Every SkeletonOf in the dashboard, each drawn with its fixture, for
   * `bun run bones` (scripts/bones.ts): boneyard's CLI opens this page in
   * a headless browser at each breakpoint of boneyard.config.json, with its
   * build flag set, so each `<Skeleton>` draws its fixture, and writes the
   * boxes it reads to the skeleton's bones (src/lib/components/ui/skeleton/
   * bones/). A SkeletonOf that is not drawn here has no bones: a new one is
   * added here, under its own name, at the width it stands in.
   *
   * boneyard reads each fixture with the measure in ink-bones.ts, which
   * bones a run of words where its ink stands (cap height to baseline,
   * across its words) instead of at its line boxes. Every `<Skeleton>`
   * installs boneyard's own measure as it is made, so this page installs
   * its measure once they are all mounted.
   */
  import { onMount } from "svelte";
  import SkeletonOfFrame from "#lib/components/ui/skeleton/skeleton-of-frame.svelte";
  import { snapshotInk } from "./ink-bones.js";

  onMount(() => {
    window.__BONEYARD_SNAPSHOT = snapshotInk;
  });
</script>

<main class="flex flex-col gap-space-4">
  <SkeletonOfFrame piece="rows" />
  <SkeletonOfFrame piece="card" />
</main>
