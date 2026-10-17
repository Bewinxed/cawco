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
    IconArtifactSheet,
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
    sheet: IconArtifactSheet,
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
            `[data-artifact-row][data-artifact="${CSS.escape(heir)}"]:not([data-reflow-ghost])`
          );
    (next ?? list)?.focus();
  });
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    data-artifact-trigger
    class="mark-line min-w-0 max-w-full text-ink-strong type-label"
    data-artifact={shown.id}
  >
    {@const Glyph = GLYPHS[shown.kind]}
    <Glyph />
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap">{shown.name}</span>
    <IconChevronDown />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    data-artifact-list
    align="start"
    class="w-64"
    bind:ref={list}
  >
    <div {@attach reflow()} {@attach keepFocus}>
      {#each rows as artifact (artifact.id)}
        {@const Glyph = GLYPHS[artifact.kind]}
        <DropdownMenu.Item
          data-artifact-row
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
          class="group/artifact min-h-c-artifact-row-h aria-current:text-ink-strong aria-busy:opacity-50"
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
          <span
            data-slot="row-name"
            class="flex-auto min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label"
            id={part(artifact.id, "name")}>{artifact.name}</span
          >
          {#if artifact.promoted}
            <span
              data-slot="row-promoted"
              class="shrink-100 min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted text-size-meta num"
              id={part(artifact.id, "promoted")}
              title="Promoted into the project's folder at artifacts/{artifact.name}/"
              >Promoted {artifact.promoted.commit.slice(0, 7)}</span
            >
          {/if}
          {#if artifact.createdAt}
            <span
              data-slot="row-age"
              class="text-ink-muted text-size-meta num"
              id={part(artifact.id, "age")}
              >{formatAgeShort(Date.parse(artifact.createdAt))}</span
            >
          {/if}
          <button
            aria-label="Remove {artifact.name}"
            class="grid place-items-center me-(--remove-me) p-space-1 border-0 rounded-sm bg-transparent text-ink-muted opacity-0 transition-[opacity,color] dur-control ease-out hover:text-error-9 coarse:opacity-100 group-data-highlighted/artifact:opacity-100"
            data-box
            style:--remove-me="calc(-1 * var(--space-1))"
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
