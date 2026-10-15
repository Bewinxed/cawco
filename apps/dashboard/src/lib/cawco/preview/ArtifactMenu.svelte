<script lang="ts">
  /**
   * The artifact panel's title control (DESIGN.md Artifact panel, canvas and
   * ink): the shown artifact's name as a menu button listing the session's
   * artifacts, newest first, each promoted one tagged with its commit;
   * choosing one shows it. Each row's Remove (its trailing glyph, or Delete
   * or Backspace on the highlighted row) removes it where it stands: a light
   * action, no confirm; focus goes on to the row that takes its place. The row leaves once the hub says it is gone, closing as the
   * rows under it slide up (motion/rows), in every tab: the panel's frame
   * lists the session's artifacts (`held`), and the panel follows that frame
   * when the removed one was shown.
   */
  import type { ArtifactKind, ArtifactSummary } from "@cawco/core";
  import type { Component } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteSet } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconChevronDown,
    IconTrash,
    IconWindow,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { listArtifacts, removeArtifact, showArtifact } from "../artifact-api";
  import { reflow } from "../motion/rows.svelte";
  import { toast } from "../toasts.js";

  let {
    instanceId,
    held,
    shown,
  }: {
    instanceId: string;
    /**
     * The session's artifacts by id, as its panel's frame lists them: a row
     * whose id leaves it (removed in any tab, or by the agent) leaves the
     * open list at once, and a new id reads the list again.
     */
    held: string[] | undefined;
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
  /** Until the list is read, the one the panel shows, with no age or promote to say. */
  const rows = $derived<
    (Pick<ArtifactSummary, "id" | "kind" | "name"> & {
      createdAt: string | null;
      promoted: ArtifactSummary["promoted"];
    })[]
  >(
    listed?.filter((row) => held?.includes(row.id) ?? true) ?? [
      { ...shown, createdAt: null, promoted: null },
    ]
  );

  /** An id the frame lists that the list read has not: the list is read again. */
  const unread = $derived(
    listed !== null &&
      (held?.some((id) => !listed?.some((row) => row.id === id)) ?? false)
  );

  function readList() {
    listArtifacts(instanceId).then(
      (artifacts) => {
        listed = artifacts;
      },
      (error: Error) => toast.error(error.message)
    );
  }

  // Read on every open, and again when the frame names one it hasn't.
  $effect(() => {
    if (open) {
      readList();
    }
  });
  $effect(() => {
    if (open && unread) {
      readList();
    }
  });

  function choose(artifact: { id: string }) {
    if (artifact.id === shown.id) {
      return;
    }
    showArtifact(instanceId, artifact.id).catch((error: Error) =>
      toast.error(error.message)
    );
  }

  /** Rows whose removal the hub has not answered yet. */
  const removing = new SvelteSet<string>();

  function remove(artifact: { id: string; name: string }) {
    if (removing.has(artifact.id)) {
      return;
    }
    removing.add(artifact.id);
    removeArtifact(instanceId, artifact.id).then(
      () => {
        removing.delete(artifact.id);
        listed = listed?.filter((row) => row.id !== artifact.id) ?? null;
      },
      (error: Error) => {
        removing.delete(artifact.id);
        toast.error(`${artifact.name} wasn't removed: ${error.message}`);
      }
    );
  }

  /** The row's own control, apart from the row's choose. */
  const own = (event: Event) => {
    event.stopPropagation();
  };

  /** Each row's name is its name and tags, never its Remove's words. */
  const uid = $props.id();
  const part = (id: string, what: "name" | "promoted" | "age") =>
    `${uid}-${what}-${id}`;

  /**
   * A row that leaves while it holds focus (removed here, in another tab, or
   * by the agent) hands it to the row that took its place, else the one above
   * it, else the menu, so the keys keep working where the reader was.
   */
  let list = $state<HTMLElement | null>(null);
  /** The rows as last drawn, to find a leaving row's neighbours. */
  let drawn: string[] = [];
  /**
   * The row that holds focus, kept from its own focus events: the row's
   * element is gone, and focus with it, before the list's effects run.
   */
  let focusedRow: string | undefined;
  const keepFocus: Attachment<HTMLElement> = (node) => {
    const into = (event: FocusEvent) => {
      focusedRow = (event.target as Element).closest<HTMLElement>(
        "[data-artifact]"
      )?.dataset.artifact;
    };
    // Focus the reader moved out of the menu is no longer the menu's to keep.
    const out = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        !node.contains(event.relatedTarget)
      ) {
        focusedRow = undefined;
      }
    };
    node.addEventListener("focusin", into);
    node.addEventListener("focusout", out);
    return () => {
      node.removeEventListener("focusin", into);
      node.removeEventListener("focusout", out);
    };
  };
  $effect(() => {
    const ids = rows.map((row) => row.id);
    const before = drawn;
    drawn = ids;
    const left = focusedRow;
    if (
      left === undefined ||
      ids.includes(left) ||
      list?.contains(document.activeElement)
    ) {
      return;
    }
    const at = before.indexOf(left);
    const heir =
      before.slice(at + 1).find((id) => ids.includes(id)) ??
      before
        .slice(0, at)
        .reverse()
        .find((id) => ids.includes(id));
    const next =
      heir === undefined
        ? null
        : list?.querySelector<HTMLElement>(
            `.artifact-row[data-artifact="${CSS.escape(heir)}"]:not([data-reflow-ghost])`
          );
    (next ?? list)?.focus();
  });
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    class="artifact-trigger mark-line"
    data-artifact={shown.id}
  >
    {@const Glyph = GLYPHS[shown.kind]}
    <Glyph />
    <span class="artifact-name">{shown.name}</span>
    <IconChevronDown />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    align="start"
    class="artifact-list w-64"
    bind:ref={list}
  >
    <div {@attach reflow()} {@attach keepFocus}>
      {#each rows as artifact (artifact.id)}
        {@const Glyph = GLYPHS[artifact.kind]}
        <DropdownMenu.Item
          aria-busy={removing.has(artifact.id) || undefined}
          aria-current={artifact.id === shown.id || undefined}
          aria-keyshortcuts="Delete Backspace"
          aria-labelledby={[
            part(artifact.id, "name"),
            artifact.promoted ? part(artifact.id, "promoted") : "",
            artifact.createdAt ? part(artifact.id, "age") : "",
          ]
            .filter(Boolean)
            .join(" ")}
          class="artifact-row"
          data-artifact={artifact.id}
          data-flip
          onkeydown={(event: KeyboardEvent) => {
            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              remove(artifact);
            }
          }}
          onSelect={() => choose(artifact)}
        >
          <Glyph />
          <span class="row-name" id={part(artifact.id, "name")}
            >{artifact.name}</span
          >
          {#if artifact.promoted}
            <span
              class="row-promoted"
              id={part(artifact.id, "promoted")}
              title="Promoted into the project's folder at artifacts/{artifact.name}/"
              >Promoted {artifact.promoted.commit.slice(0, 7)}</span
            >
          {/if}
          {#if artifact.createdAt}
            <span class="row-age" id={part(artifact.id, "age")}
              >{formatAgeShort(Date.parse(artifact.createdAt))}</span
            >
          {/if}
          <button
            aria-label="Remove {artifact.name}"
            class="row-remove"
            data-box
            disabled={removing.has(artifact.id)}
            onclick={(event) => {
              own(event);
              remove(artifact);
            }}
            onpointerdown={own}
            onpointerup={own}
            tabindex={-1}
            title="Remove"
            type="button"
          >
            <IconTrash />
          </button>
        </DropdownMenu.Item>
      {/each}
    </div>
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
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.artifact-list .artifact-row) {
    min-block-size: var(--c-artifact-row-h);
  }
  :global(.artifact-list .artifact-row[aria-current="true"]) {
    color: var(--ink-strong);
  }
  /* The name is what a row is chosen by: it keeps its own width, and in a
     row too narrow for everything the promoted tag gives up its room first
     (its title and the row's name still say it). */
  .row-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  .row-promoted,
  .row-age {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
  }
  .row-promoted {
    flex-shrink: 100;
    min-width: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.artifact-list .artifact-row[aria-busy="true"]) {
    opacity: 0.5;
  }
  /* Shown on the highlighted row (pointer or arrow keys), always under a
     finger; red under the pointer, as a destructive item's glyph is. */
  .row-remove {
    display: grid;
    place-items: center;
    margin-inline-end: calc(-1 * var(--space-1));
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    opacity: 0;
    transition:
      opacity var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  :global(.artifact-row[data-highlighted]) .row-remove {
    opacity: 1;
  }
  @media (hover: hover) {
    .row-remove:hover {
      color: var(--destructive);
    }
  }
  @media (pointer: coarse) {
    .row-remove {
      opacity: 1;
    }
  }
</style>
