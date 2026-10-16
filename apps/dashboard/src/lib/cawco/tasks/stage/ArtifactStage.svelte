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
  import PreviewPane from "../../preview/PreviewPane.svelte";
  import RowFault from "../../RowFault.svelte";

  let { artifactId }: { artifactId: string } = $props();

  /** The artifact's session, once its panel shows it. */
  let staged = $state<{ id: string; instanceId: string } | null>(null);
  let problem = $state<string | null>(null);
  $effect(() => {
    const id = artifactId;
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

{#if problem}
  <RowFault reason={problem} />
{:else if staged && drawn}
  <PreviewPane inset instanceId={staged.instanceId} />
{:else}
  <div data-slot="cover" aria-hidden="true" class="cover">
    <span
      data-slot="block"
      class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
    ></span>
  </div>
{/if}

<style>
  .cover {
    flex: 1;
    padding: var(--space-5);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
</style>
