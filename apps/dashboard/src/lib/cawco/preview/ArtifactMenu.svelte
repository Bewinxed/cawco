<script lang="ts">
  /**
   * The artifact panel's title control (DESIGN.md Artifact panel, canvas and
   * ink): the shown artifact's name as a menu button listing the session's
   * artifacts, newest first; choosing one shows it.
   */
  import type { ArtifactKind, ArtifactSummary } from "@cawco/core";
  import type { Component } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconChevronDown,
    IconWindow,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { listArtifacts, showArtifact } from "../client.svelte";
  import { toast } from "../toasts.js";

  let {
    instanceId,
    shown,
  }: {
    instanceId: string;
    /** The artifact the panel shows. */
    shown: { id: string; kind: ArtifactKind; name: string };
  } = $props();

  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
  };

  let open = $state(false);
  let listed = $state<ArtifactSummary[] | null>(null);
  /** Until the list is read, the one the panel shows, with no age to say. */
  const rows = $derived<
    (Pick<ArtifactSummary, "id" | "kind" | "name"> & {
      createdAt: string | null;
    })[]
  >(listed ?? [{ ...shown, createdAt: null }]);

  $effect(() => {
    if (!open) {
      return;
    }
    listArtifacts(instanceId).then(
      (artifacts) => {
        listed = artifacts;
      },
      (error: Error) => toast.error(error.message)
    );
  });

  function choose(artifact: { id: string }) {
    if (artifact.id === shown.id) {
      return;
    }
    showArtifact(instanceId, artifact.id).catch((error: Error) =>
      toast.error(error.message)
    );
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="artifact-trigger" data-artifact={shown.id}>
    {@const Glyph = GLYPHS[shown.kind]}
    <Glyph />
    <span class="artifact-name">{shown.name}</span>
    <IconChevronDown />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="artifact-list w-64">
    {#each rows as artifact (artifact.id)}
      {@const Glyph = GLYPHS[artifact.kind]}
      <DropdownMenu.Item
        aria-current={artifact.id === shown.id || undefined}
        class="artifact-row"
        data-artifact={artifact.id}
        onSelect={() => choose(artifact)}
      >
        <Glyph />
        <span class="row-name">{artifact.name}</span>
        {#if artifact.createdAt}
          <span class="row-age"
            >{formatAgeShort(Date.parse(artifact.createdAt))}</span
          >
        {/if}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  /* The head's first control: the name in the label role, the button
     recipe the head gives every control (SideSurface). */
  :global(.artifact-trigger) {
    min-width: 0;
    max-width: 100%;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .artifact-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.artifact-list .artifact-row) {
    min-block-size: var(--c-artifact-row-h);
  }
  :global(.artifact-list .artifact-row[aria-current="true"]) {
    color: var(--ink-strong);
  }
  .row-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  .row-age {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }
</style>
