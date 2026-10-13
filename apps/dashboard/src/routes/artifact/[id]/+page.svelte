<!-- An artifact in a tab of its own (Projects spec §5.10): the artifact
     panel's head and the page under it at the tab's full width, joined to
     the same document as the session's panel, so a pick here is a pick
     there. The session's panel shows this artifact while the tab is open on
     it: the hub serves a session one artifact at a time. -->
<script lang="ts">
  import {
    cawco,
    findArtifact,
    showArtifact,
  } from "#lib/cawco/client.svelte.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconAlert } from "#lib/icons.js";
  import { page } from "$app/state";

  const id = $derived(page.params.id ?? "");
  let found = $state<{ instanceId: string; name: string } | null>(null);
  let problem = $state<string | null>(null);

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
          found = { instanceId: artifact.instanceId, name: artifact.name };
        }
      })
      .catch((error: unknown) => {
        if (live) {
          problem = error instanceof Error ? error.message : String(error);
        }
      });
    return () => {
      live = false;
    };
  });

  const open = $derived(
    !!found && cawco.previews[found.instanceId]?.state === "open"
  );
</script>

<svelte:head><title>{found?.name ?? "Artifact"} · CawCo</title></svelte:head>

<div class="artifact-tab">
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
        class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
      ></span>
    </div>
  {/if}
</div>

<style>
  /* The panel's card at the page's full width and height, with the gap the
     card keeps from its column beside a conversation. */
  .artifact-tab {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
  }
  .opening {
    flex: 1;
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-recess);
  }
</style>
