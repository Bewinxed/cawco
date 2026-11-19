<!-- An artifact in a tab of its own (Projects spec §5.10): the artifact
     panel's head and the page under it at the tab's full width, joined to
     the same document as the session's panel, so a pick here is a pick
     there. It shows its own artifact whatever the session's panel shows,
     and opening it moves no panel: a machine's preview is served on its
     artifact's own origin, a page at its own place (hub server.ts
     `tabTarget`). -->
<script lang="ts">
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import CanvasStages from "#lib/cawco/canvas/CanvasStages.svelte";
  import Overlays from "#lib/cawco/Overlays.svelte";
  import { ArtifactSession } from "#lib/cawco/preview/artifact-session.svelte.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import { setPaneFleet } from "#lib/cawco/preview/pane-fleet.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { IconAlert } from "#lib/icons.js";
  import { reveal, revealOut } from "#lib/platform/motion/curves.svelte.js";
  import { page } from "$app/state";

  const id = $derived(page.params.id ?? "");
  /**
   * The one session the artifact's tab follows (artifact-session.svelte.ts),
   * the pane's store: the pane reads it, never the fleet's. Its socket opens
   * by the artifact alone as the tab starts, and its first frame names the
   * session.
   */
  const session = new ArtifactSession();
  setPaneFleet(session);

  $effect(() => {
    const wanted = id;
    untrack(() => session.follow(wanted));
    return () => session.end();
  });

  /** The session the hub's first frame named; null until then. */
  const instanceId = $derived(session.instanceId);
  /** The tab's artifact as the hub last said: undefined until its first frame, which the opening block stands for. */
  const preview = $derived(
    instanceId ? session.preview(instanceId) : undefined
  );

  /** A phone's toasts drop from the top, as the app's do; a desk keeps the corner. */
  const narrowToasts = new MediaQuery("(max-width: 640px)");
</script>

<svelte:head
  ><title>{preview?.artifact.title || "Artifact"} · CawCo</title></svelte:head
>

<!-- Outside the app's group: nothing of the app around it, only what the pane
     stands in (Overlays: the lightbox; the root layout holds the tooltip
     provider), the stage
     a canvas stands on over the pane's slot, and the toasts the artifact
     menu says a refusal in. -->
<Overlays>
  <!-- The panel's card at the tab's full width and height, on the page's
       surface, with the gap the card keeps from its column beside a
       conversation. -->
  <div
    data-slot="artifact-tab"
    class="flex h-dvh flex-col overflow-hidden bg-surface-page p-space-2"
  >
    {#if session.refused}
      <div class="flex min-h-0 flex-1 flex-col" in:reveal>
        <EmptyState icon={IconAlert} title="This artifact didn't open">
          {#snippet line()}
            {session.refused}
          {/snippet}
          {#snippet action()}
            <Button
              href="/session"
              label="Back to the fleet"
              variant="outline"
            />
          {/snippet}
        </EmptyState>
      </div>
    {:else if instanceId && preview?.state === "open"}
      <div class="flex min-h-0 flex-1 flex-col" in:reveal>
        <PreviewPane {instanceId} ownTab />
      </div>
    {:else}
      <div
        aria-hidden="true"
        class="flex-1 rounded-lg bg-surface-recess p-space-5"
        out:revealOut
      >
        <Skeleton class="w-5/12" data-slot="block" line="body" radius="text" />
      </div>
    {/if}
  </div>
</Overlays>
<CanvasStages />
<Toaster
  data-safe-bottom
  expand
  position={narrowToasts.current ? "top-center" : "bottom-right"}
/>
