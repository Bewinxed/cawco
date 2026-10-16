<script lang="ts" module>
  import type { ResultArtifact } from "@cawco/core";

  /** What a session can present: the kinds a stage draws. */
  export type PresentedArtifact = Extract<ResultArtifact, { kind: "artifact" }>;

  /** The kinds the stage draws, each by its own renderer below. */
  const DRAWN = new Set<ResultArtifact["kind"]>(["artifact"]);

  export const isPresented = (
    artifact: ResultArtifact
  ): artifact is PresentedArtifact => DRAWN.has(artifact.kind);
</script>

<script lang="ts">
  /**
   * The review's stage for what a session presented: one renderer per kind
   * of presented artifact. `artifact` (a page, a preview, a canvas) is the
   * artifact panel's own (ArtifactStage); a new kind adds its renderer here
   * and its kind to DRAWN.
   */
  import ArtifactStage from "./ArtifactStage.svelte";

  let { presented }: { presented: PresentedArtifact } = $props();
</script>

{#if presented.kind === "artifact"}
  <ArtifactStage artifactId={presented.artifactId} />
{/if}
