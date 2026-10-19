<script lang="ts">
  /**
   * A presented artifact (`kind: "artifact"`: a page, a preview, a canvas)
   * drawn by the artifact panel's own renderer (PreviewPane, inset). The hub
   * serves a session one artifact at a time, so it is put on its session's
   * panel first, as the artifact's own tab does (routes/artifact/[id]), and
   * put back should the panel move on to another.
   */
  import { findArtifact, showArtifact } from "../../artifact-api";
  import { cawco } from "../../client.svelte";
  import { failureWords as message } from "../../hub-read";
  import { crossIn, crossOutWith } from "../../motion/curves.svelte";
  import PreviewPane from "../../preview/PreviewPane.svelte";
  import RowFault from "../../RowFault.svelte";

  let { artifactId }: { artifactId: string } = $props();

  /** The artifact's session, once its panel shows it. */
  let staged = $state<{ id: string; instanceId: string } | null>(null);
  let problem = $state<string | null>(null);
  /** When the wait for this artifact began: the pane's cover carries it on. */
  let since = $state(performance.now());
  $effect(() => {
    const id = artifactId;
    since = performance.now();
    staged = null;
    problem = null;
    let live = true;
    findArtifact(id)
      .then(async (found) => {
        if (!found.shown) {
          await showArtifact(found.instanceId, id);
        }
        if (live) {
          staged = { id, instanceId: found.instanceId };
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = message(error);
        }
      });
    return () => {
      live = false;
    };
  });
  const panel = $derived(
    staged ? cawco.previews[staged.instanceId] : undefined
  );
  /** Its panel shows this artifact now. */
  const drawn = $derived(
    !!staged && panel?.state === "open" && panel.artifact?.id === staged.id
  );
  /** The cover leaving: pinned where it stands (crossOut), down to the stage's foot. */
  const leave = (node: HTMLElement) =>
    crossOutWith(node, () => ({ bottom: "0" }));
  // Its panel moved on to another artifact: this one is brought back to it.
  $effect(() => {
    const on = staged;
    const showing = panel?.artifact?.id;
    if (on && showing && showing !== on.id) {
      showArtifact(on.instanceId, on.id).catch((error: unknown) => {
        problem = message(error);
      });
    }
  });
</script>

<!-- The panel's well holding the house opening line (the kit's skeleton,
     unseen for the wait's grace) until its panel shows the artifact; what
     comes takes its place in one cross-fade (crossOut pinned to the stage's
     foot, crossIn). -->
<div data-slot="artifact-stage" class="stage">
  {#if problem}
    <div class="arrived" in:crossIn><RowFault reason={problem} /></div>
  {:else if staged && drawn}
    <div class="arrived" data-artifact-stage-arrived in:crossIn>
      <PreviewPane inset instanceId={staged.instanceId} waitingSince={since} />
    </div>
  {:else}
    <div
      data-slot="cover"
      aria-hidden="true"
      class="cover"
      data-artifact-stage-opening
      out:leave
    >
      <span
        data-slot="block"
        class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
      ></span>
    </div>
  {/if}
</div>

<style>
  .stage,
  .arrived {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }
  .stage {
    position: relative;
  }
  .cover {
    flex: 1;
    padding: var(--space-5);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
</style>
