<script lang="ts">
  /**
   * A presented artifact (`kind: "artifact"`: a page, a preview, a canvas)
   * drawn by the artifact panel's own renderer (PreviewPane, inset), as its
   * own tab draws it (routes/artifact/[id]): its own artifact, followed on
   * its own socket (artifact-session.svelte.ts), whatever its session's
   * panel shows, which it never moves.
   */
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { findArtifact } from "../../artifact-api";
  import { failureWords as message } from "../../hub-read";
  import { ArtifactSession } from "../../preview/artifact-session.svelte";
  import PreviewPane from "../../preview/PreviewPane.svelte";
  import { setPaneFleet } from "../../preview/pane-fleet";
  import RowFault from "../../RowFault.svelte";

  let { artifactId }: { artifactId: string } = $props();

  /** The artifact's session, the pane's store: the pane reads it, never the fleet's. */
  const session = new ArtifactSession();
  setPaneFleet(session);
  /** The artifact's session, once found. */
  let staged = $state<string | null>(null);
  let problem = $state<string | null>(null);
  $effect(() => {
    const id = artifactId;
    staged = null;
    problem = null;
    let live = true;
    findArtifact(id)
      .then((found) => {
        if (live) {
          session.follow(found.instanceId, id);
          staged = found.instanceId;
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = message(error);
        }
      });
    return () => {
      live = false;
      session.end();
    };
  });
  /** The hub has sent its artifact's first frame. */
  const drawn = $derived(!!staged && session.preview(staged)?.state === "open");
</script>

{#if problem}
  <RowFault reason={problem} />
{:else if session.refused}
  <RowFault reason={session.refused} />
{:else if staged && drawn}
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" in:reveal>
    <PreviewPane inset instanceId={staged} />
  </div>
{:else}
  <div
    data-slot="cover"
    aria-hidden="true"
    class="flex-1 p-space-5 border border-border-well rounded-sm bg-surface-recess"
    out:revealOut
  >
    <Skeleton class="w-2/5" data-slot="block" line="body" radius="text" />
  </div>
{/if}
