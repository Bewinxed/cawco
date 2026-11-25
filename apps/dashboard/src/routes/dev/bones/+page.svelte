<script lang="ts">
  /**
   * Every piece the kit draws a skeleton of (SkeletonOf), each drawn by its
   * fixture with the capture's data, for `bun run bones` (scripts/bones.ts):
   * it opens this page in a headless browser under a phone and a desk
   * viewport, and the capture (capture.ts) sweeps each piece's box across
   * every width, reading it with boneyard's snapshot at its words' ink
   * (ink-bones.ts). A piece is captured under the name on its box
   * (`data-bones-piece`); a list's empty state as `<name>.empty`. A piece
   * not drawn here has no bones: a new one is added here.
   */
  import { onMount } from "svelte";
  import SkeletonPieces from "#lib/components/ui/skeleton/skeleton-pieces.svelte";
  import { installCapture } from "./capture.js";

  onMount(installCapture);
</script>

<main class="flex flex-col items-start gap-space-4">
  <div data-bones-piece="kit-rows">
    <div><SkeletonPieces piece="rows" /></div>
  </div>
  <div data-bones-piece="kit-rows.empty">
    <div><SkeletonPieces machines={[]} piece="rows" /></div>
  </div>
  <div data-bones-piece="kit-card">
    <div><SkeletonPieces piece="card" /></div>
  </div>
  <div data-bones-piece="kit-picture">
    <div><SkeletonPieces piece="picture" /></div>
  </div>
</main>
