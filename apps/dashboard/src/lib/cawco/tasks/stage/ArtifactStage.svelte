<script lang="ts">
  import { untrack } from "svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  /**
   * A presented artifact (`kind: "artifact"`: a page, a preview, a canvas)
   * drawn by the artifact panel's own renderer (PreviewPane, inset), as its
   * own tab draws it (routes/artifact/[id]): its own artifact, followed on
   * its own socket (artifact-session.svelte.ts), whatever its session's
   * panel shows, which it never moves.
   */
  import { reveal, revealOut } from "#lib/platform/motion/curves.svelte.js";
  import { ArtifactSession } from "../../preview/artifact-session.svelte";
  import PreviewPane from "../../preview/PreviewPane.svelte";
  import { setPaneFleet } from "../../preview/pane-fleet";
  import RowFault from "../../RowFault.svelte";

  let { artifactId }: { artifactId: string } = $props();

  /** The artifact's session, the pane's store: the pane reads it, never the fleet's. */
  const session = new ArtifactSession();
  setPaneFleet(session);
  $effect(() => {
    const id = artifactId;
    untrack(() => session.follow(id));
    return () => session.end();
  });
  /** The artifact's session, as the hub's first frame names it. */
  const staged = $derived(session.instanceId);
  /** The hub has sent its artifact's first frame. */
  const drawn = $derived(!!staged && session.preview(staged)?.state === "open");
</script>

{#if session.refused}
  <RowFault reason={session.refused} />
{:else if staged && drawn}
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" in:reveal>
    <PreviewPane inset instanceId={staged} />
  </div>
{:else}
  <div
    data-slot="cover"
    aria-hidden="true"
    class="flex-1 p-space-4 border border-border-control rounded-sm bg-surface-recess"
    out:revealOut
  >
    <Skeleton class="w-2/5" data-slot="block" line="body" radius="text" />
  </div>
{/if}
