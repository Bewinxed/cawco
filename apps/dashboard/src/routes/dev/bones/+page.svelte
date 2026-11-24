<script lang="ts">
  /**
   * Every SkeletonOf in the dashboard, each drawn with its fixture, for
   * `bun run bones` (scripts/bones.ts): boneyard's CLI opens this page in
   * a headless browser at each breakpoint of boneyard.config.json, with its
   * build flag set, so each `<Skeleton>` draws its fixture, and writes the
   * boxes it reads to the skeleton's bones (src/lib/components/ui/skeleton/
   * bones/). A SkeletonOf that is not drawn here has no bones: a new one is
   * added here, under its own name, at the width it stands in.
   */
  import SkeletonOfFrame from "#lib/components/ui/skeleton/skeleton-of-frame.svelte";
</script>

<main class="flex flex-col gap-space-4">
  <SkeletonOfFrame piece="rows" />
  <SkeletonOfFrame piece="card" />
</main>
