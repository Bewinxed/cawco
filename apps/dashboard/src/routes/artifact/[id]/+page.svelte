<!-- An artifact in a tab of its own (Projects spec §5.10): the artifact
     panel's head and the page under it at the tab's full width, joined to
     the same document as the session's panel, so a pick here is a pick
     there. The session's panel shows this artifact while the tab is open on
     it: the hub serves a session one artifact at a time. -->
<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { findArtifact, showArtifact } from "#lib/cawco/artifact-api.js";
  import CanvasStages from "#lib/cawco/canvas/CanvasStages.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import Overlays from "#lib/cawco/Overlays.svelte";
  import { ArtifactSession } from "#lib/cawco/preview/artifact-session.svelte.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import { setPaneFleet } from "#lib/cawco/preview/pane-fleet.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { IconAlert, IconEyeClosed } from "#lib/icons.js";
  import { page } from "$app/state";

  const id = $derived(page.params.id ?? "");
  let found = $state<{ instanceId: string; name: string } | null>(null);
  let problem = $state<string | null>(null);
  /**
   * The one session the artifact's tab follows (artifact-session.svelte.ts),
   * the pane's store: the pane reads it, never the fleet's.
   */
  const session = new ArtifactSession();
  setPaneFleet(session);

  $effect(() => {
    const wanted = id;
    let live = true;
    found = null;
    problem = null;
    findArtifact(wanted)
      .then(async (artifact) => {
        if (!artifact.shown) {
          await showArtifact(artifact.instanceId, wanted);
        }
        if (live) {
          session.follow(artifact.instanceId, wanted);
          found = { instanceId: artifact.instanceId, name: artifact.name };
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = failureWords(error);
        }
      });
    return () => {
      live = false;
      session.end();
    };
  });

  /** The panel as the hub last said: undefined until its first frame, which the opening block stands for. */
  const shown = $derived(
    found ? session.preview(found.instanceId)?.state : undefined
  );
  let reopening = $state(false);

  /** Shows the artifact in its session's panel again; the hub's next frame opens it here. */
  async function reopen(instanceId: string) {
    reopening = true;
    try {
      await showArtifact(instanceId, id);
    } catch (error) {
      problem = failureWords(error);
    } finally {
      reopening = false;
    }
  }

  /** A phone's toasts drop from the top, as the app's do; a desk keeps the corner. */
  const narrowToasts = new MediaQuery("(max-width: 640px)");
</script>

<svelte:head><title>{found?.name ?? "Artifact"} · CawCo</title></svelte:head>

<!-- Outside the app's group: nothing of the app around it, only what the pane
     stands in (Overlays: the tooltip provider and the lightbox), the stage
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
    {:else if problem}
      <div class="flex min-h-0 flex-1 flex-col" in:reveal>
        <EmptyState icon={IconAlert} title="This artifact didn't open">
          {#snippet line()}
            {problem}
            Open it again from its session's panel.
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
    {:else if found && shown === "open"}
      <div class="flex min-h-0 flex-1 flex-col" in:reveal>
        <PreviewPane instanceId={found.instanceId} ownTab />
      </div>
    {:else if found && shown === "closed"}
      {@const instanceId = found.instanceId}
      <div class="flex min-h-0 flex-1 flex-col" in:reveal>
        <EmptyState
          icon={IconEyeClosed}
          title="This artifact's panel is closed"
        >
          {#snippet line()}
            {found?.name} is still in its session. Show it again to open it here and
            in its session's panel.
          {/snippet}
          {#snippet action()}
            <Button
              label="Show it again"
              onclick={() => reopen(instanceId)}
              pending={reopening}
              pendingLabel="Showing…"
            />
          {/snippet}
        </EmptyState>
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
