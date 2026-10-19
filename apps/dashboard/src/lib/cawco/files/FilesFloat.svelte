<script lang="ts">
  /**
   * The artifact chosen in Files, on a desk: the session's own panel
   * (PreviewPane, its head, its menu and its page as beside the
   * conversation) floating on Files' leading side, the two tops on one
   * line, its trailing edge `--space-3` clear of Files and never nearer the
   * rail than the same (owner: "selecting a file opens it floating on the
   * left"), the split's share of the page at most (files `floatPlace`).
   * Narrowed past the panel's least width (SIDE_FLOOR_PX), never a sliver:
   * the pick goes to the session's panel, which keeps it, and Files goes.
   * Neither it nor Files moves the conversation; no scrim. While it stands
   * the split leaves the panel to it (SideSplit `floatingPanel`).
   *
   * A region named for the artifact, placed in the page after Files' card,
   * so Tab goes on from Files into it. Chosen from the keyboard, the focus
   * goes to the panel's name; the panel's own Close closes it and gives the
   * focus back to the artifact's card in Files. It comes and goes as every
   * floating surface (`kit-pop`'s `data-state`), standing closed for
   * `--dur-exit` before it leaves the page.
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { barGlass } from "../bar-glass.svelte";
  import { cawco } from "../client.svelte";
  import { dur } from "../motion/curves.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import { SIDE_FLOOR_PX } from "../side/floor";
  import { files, floatPlace } from "./files.svelte";

  const picked = $derived(barGlass.open === "files" ? files.picked : null);
  const preview = $derived(
    picked ? cawco.previews[picked.instanceId] : undefined
  );
  const showing = $derived(
    !!picked && preview?.state === "open" && preview.artifact.id === picked.id
  );

  /** What stands: the pick on show, kept closed for its exit after it goes. */
  let standing = $state<{
    instanceId: string;
    id: string;
    name: string;
    open: boolean;
  } | null>(null);
  let place = $state<ReturnType<typeof floatPlace>>(null);
  let node = $state<HTMLElement | null>(null);

  $effect(() => {
    if (showing && picked && preview) {
      const next = {
        instanceId: picked.instanceId,
        id: picked.id,
        name: preview.artifact.name,
        open: true,
      };
      untrack(() => {
        standing = next;
      });
      return;
    }
    const was = untrack(() => standing);
    if (!was?.open) {
      return;
    }
    untrack(() => {
      standing = { ...was, open: false };
    });
    const gone = setTimeout(() => {
      if (standing && !standing.open) {
        standing = null;
      }
    }, dur("--dur-exit"));
    return () => clearTimeout(gone);
  });

  // The panel closed (its Close, or the agent's): the float goes, Files
  // stays, and the focus goes back to the artifact's card.
  $effect(() => {
    if (picked && preview && preview.state !== "open") {
      const { id } = picked;
      untrack(() => {
        files.picked = null;
      });
      document
        .querySelector<HTMLElement>(
          `[data-glass-card-frame="files-pop"] [data-files-card][data-artifact="${CSS.escape(id)}"]`
        )
        ?.focus({ preventScroll: true });
    }
  });

  // Every new page asks the pane for its picture, as a transcript card on
  // screen does: the hub keeps it as the artifact's thumbnail.
  $effect(() => {
    if (showing && preview && preview.thumbnailRevision !== preview.revision) {
      preview.thumbnailWanted = true;
    }
  });

  // Chosen from the keyboard: the focus goes to the panel's name, once it stands.
  $effect(() => {
    const at = node;
    if (!(at && showing && picked?.byKeyboard)) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      at.querySelector<HTMLElement>("[data-artifact-trigger]")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!standing) {
      place = null;
      return;
    }
    const measure = () => {
      const next = floatPlace();
      // Never a sliver: narrowed past the panel's least width, the pick
      // goes to the session's panel, which keeps it, and Files goes.
      if (next && next.width < SIDE_FLOOR_PX) {
        untrack(() => {
          if (files.picked) {
            files.picked = { ...files.picked, panelWasOpen: true };
          }
          barGlass.open = null;
        });
        return;
      }
      place = next ?? place;
    };
    measure();
    const card = document.querySelector<HTMLElement>(
      '.kit-pop[data-glass-card-frame="files-pop"]'
    );
    const seen = new ResizeObserver(measure);
    if (card) {
      seen.observe(card);
    }
    seen.observe(document.documentElement);
    return () => seen.disconnect();
  });

  /** Placed after Files' card in the page, so Tab goes on from Files into it. */
  const afterFiles: Attachment<HTMLElement> = (element) => {
    document.body.append(element);
    return () => element.remove();
  };
</script>

{#if standing && place}
  <!-- A floating panel: the kit popover (its raised surface, radius, overlay
       shadow, and its open and close on `data-state`), edge to edge inside,
       as tall as Caw's panel or the room under the glass less the 11px kept
       from the screen's foot. Its edge is the row outline's, which holds 3:1
       against the raised surface and the recess alike, so it stands clear of
       the page by day too. -->
  <section
    bind:this={node}
    aria-label={standing.name}
    class="kit-pop fixed end-(--float-right) top-(--float-top) z-50 flex h-(--float-h) w-(--float-w) flex-col overflow-hidden border-border-row-outline p-0 inner-side-card:flex-1 inner-side-card:rounded-none inner-side-card:shadow-none"
    data-files-float
    data-side="left"
    data-state={standing.open ? "open" : "closed"}
    inert={!standing.open}
    style:--float-top="{place.top}px"
    style:--float-right="{place.right}px"
    style:--float-w="{place.width}px"
    style:--float-h="min(var(--c-caw-panel-h), calc(100dvh - var(--float-top) - var(--space-3)))"
    {@attach afterFiles}
  >
    <RegionBoundary region="preview">
      <PreviewPane instanceId={standing.instanceId} onScreen />
    </RegionBoundary>
  </section>
{/if}
