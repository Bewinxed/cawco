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
  import Overlays from "#lib/cawco/Overlays.svelte";
  import { ArtifactSession } from "#lib/cawco/preview/artifact-session.svelte.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import { setPaneFleet } from "#lib/cawco/preview/pane-fleet.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { IconAlert } from "#lib/icons.js";
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
          session.follow(artifact.instanceId);
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

  const open = $derived(
    !!found && session.preview(found.instanceId)?.state === "open"
  );

  /** A phone's toasts drop from the top, as the app's do; a desk keeps the corner. */
  const narrowToasts = new MediaQuery("(max-width: 640px)");
</script>

<svelte:head><title>{found?.name ?? "Artifact"} · CawCo</title></svelte:head>

<!-- Outside the app's group: nothing of the app around it, only what the pane
     stands in (Overlays: the tooltip provider and the lightbox), the stage
     a canvas stands on over the pane's slot, and the toasts the artifact
     menu says a refusal in. -->
<Overlays>
  <div data-slot="artifact-tab" class="artifact-tab">
    {#if problem}
      <EmptyState icon={IconAlert} title="This artifact didn't open">
        {#snippet line()}
          {problem}
          Open it again from its session's panel.
        {/snippet}
        {#snippet action()}
          <Button href="/session" label="Back to the fleet" variant="outline" />
        {/snippet}
      </EmptyState>
    {:else if found && open}
      <PreviewPane instanceId={found.instanceId} ownTab />
    {:else}
      <div aria-hidden="true" class="opening">
        <span
          data-slot="block"
          class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
        ></span>
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

<style>
  /* The panel's card at the tab's full width and height, on the page's
     surface, with the gap the card keeps from its column beside a
     conversation. */
  .artifact-tab {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    padding: var(--space-2);
    background: var(--surface-page);
  }
  .opening {
    flex: 1;
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-recess);
  }
</style>
