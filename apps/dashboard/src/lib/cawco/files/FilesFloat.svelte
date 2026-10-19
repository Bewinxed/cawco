<script lang="ts">
  /**
   * The artifact chosen in Files, on a desk: the session's own panel
   * (PreviewPane, its head, its menu and its page as beside the
   * conversation) floating on Files' leading side, the two tops on one
   * line, its trailing edge `--space-3` clear of Files and never nearer the
   * rail than the same (owner: "selecting a file opens it floating on the
   * left"). It is the split's share of the page (Split's 45%) at most.
   * Neither it nor Files moves the conversation; no scrim. While it stands
   * the split leaves the panel to it (SideSplit `floatingPanel`); Files put
   * away, the split takes the panel back. The panel's Close closes it.
   */
  import { untrack } from "svelte";
  import { barGlass } from "../bar-glass.svelte";
  import { cawco } from "../client.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import { files } from "./files.svelte";

  /** The place the float stands, read off Files' card and the rail. */
  let place = $state<{ top: number; right: number; width: number } | null>(
    null
  );
  /** The split's share of the page (Split). */
  const SHARE = 0.45;

  const picked = $derived(barGlass.open === "files" ? files.picked : null);
  const preview = $derived(
    picked ? cawco.previews[picked.instanceId] : undefined
  );
  const showing = $derived(
    !!picked && preview?.state === "open" && preview.artifact.id === picked.id
  );

  // The panel closed (its Close, or the agent's), or showing another: the
  // float goes, and Files' card keeps standing.
  $effect(() => {
    if (picked && preview && preview.state !== "open") {
      untrack(() => {
        files.picked = null;
      });
    }
  });

  // Every new page asks the pane for its picture, as a transcript card on
  // screen does: the hub keeps it as the artifact's thumbnail.
  $effect(() => {
    if (showing && preview && preview.thumbnailRevision !== preview.revision) {
      preview.thumbnailWanted = true;
    }
  });

  $effect(() => {
    if (!picked) {
      place = null;
      return;
    }
    const gap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-3")
    );
    const measure = () => {
      const card = document.querySelector<HTMLElement>(".kit-pop.files-pop");
      if (!card) {
        return;
      }
      const box = card.getBoundingClientRect();
      const rail =
        document
          .querySelector<HTMLElement>("[data-slot='rail']")
          ?.getBoundingClientRect().right ?? 0;
      const room = box.left - gap - (rail + gap);
      place = {
        top: box.top,
        right: window.innerWidth - box.left + gap,
        width: Math.max(0, Math.min((window.innerWidth - rail) * SHARE, room)),
      };
    };
    measure();
    const card = document.querySelector<HTMLElement>(".kit-pop.files-pop");
    const seen = new ResizeObserver(measure);
    if (card) {
      seen.observe(card);
    }
    seen.observe(document.documentElement);
    return () => seen.disconnect();
  });
</script>

{#if picked && showing && place}
  <div
    class="kit-pop files-float"
    data-files-float
    data-state="open"
    style:--float-top="{place.top}px"
    style:inset-block-start="{place.top}px"
    style:inset-inline-end="{place.right}px"
    style:inline-size="{place.width}px"
  >
    <RegionBoundary region="preview">
      <PreviewPane instanceId={picked.instanceId} onScreen />
    </RegionBoundary>
  </div>
{/if}

<style>
  /* css-scope .files-float: the chosen artifact's floating panel, a kit popover */
  /* A floating panel: the kit popover (its raised surface, radius and
     overlay shadow), edge to edge inside, as tall as Caw's panel or the
     room under the glass less the 11px kept from the screen's foot. Its edge
     is the row outline's, which holds 3:1 against the raised surface and
     the recess alike, so it stands clear of the page by day too. */
  :global(.kit-pop.files-float) {
    position: fixed;
    z-index: 50;
    display: flex;
    flex-direction: column;
    block-size: min(
      var(--c-caw-panel-h),
      calc(100dvh - var(--float-top) - var(--space-3))
    );
    padding: 0;
    overflow: hidden;
    border-color: var(--border-row-outline);
  }
  :global(.kit-pop.files-float [data-slot="side-card"]) {
    flex: 1;
    border-radius: 0;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.kit-pop.files-float) {
      transition:
        opacity var(--dur-panel) var(--ease-drawer),
        translate var(--dur-panel) var(--ease-drawer);

      @starting-style {
        opacity: 0;
        translate: var(--space-3) 0;
      }
    }
  }
</style>
