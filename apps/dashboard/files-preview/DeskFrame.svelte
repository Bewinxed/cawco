<script lang="ts">
  /**
   * A desk at 1440 × 900: the session view as it stands (the live capture by
   * day, its surfaces at night), and over it what changes. Files hangs from
   * the bar's glass as its other cards do (FilesGlass, GlassCard's
   * HangCard): one shape with the glass, drawn down out of its foot, the
   * glass drawing its join while it stands. Choosing an artifact opens it
   * floating beside Files on its leading side, the two tops on one line,
   * the preview's head and well as today, at the split's share of the page,
   * so the conversation shows past it. Neither moves the conversation; no
   * scrim.
   */
  import { untrack } from "svelte";
  import ArtifactShown from "./ArtifactShown.svelte";
  import BarGlass from "./BarGlass.svelte";
  import FilesGlass from "./FilesGlass.svelte";
  import FilesList from "./FilesList.svelte";
  import {
    boardPage,
    CHOSEN,
    type Count,
    type Fill,
    filesOf,
    READ_ERROR,
    type Stage,
    shotDesk,
  } from "./fixtures";

  let {
    stage,
    fill = "typical",
    count: countTake = "none",
    query = "",
  }: { stage: Stage; fill?: Fill; count?: Count; query?: string } = $props();

  const files = $derived(filesOf(fill));
  const count = $derived(files.artifacts.length + files.attachments.length);
  const chosenName = $derived(
    files.artifacts.find((row) => row.id === CHOSEN)?.name ?? "Site task board"
  );
  const picked = $derived(stage === "picked");
  let glass = $state<HTMLElement | null>(null);
  let joined = $state(false);
  /**
   * Files asked open: the stage's, from the frame's first moment, while the
   * glass may still grow as the machines' figure takes its face (HangCard
   * redraws its neck as its anchor's span changes); or the sweep's own press
   * (`filesPreview.open`).
   */
  let filesOpen = $state(untrack(() => stage !== "closed"));
  (window as unknown as { filesPreview: unknown }).filesPreview = {
    open: (next: boolean) => {
      filesOpen = next;
    },
  };
</script>

<div class="desk" data-stage={stage}>
  <div
    aria-hidden="true"
    class="rail shot"
    style:--shot="url({shotDesk})"
  ></div>
  <div class="bar shot" style:--shot="url({shotDesk})">
    <div class="bar-end">
      <BarGlass
        {count}
        {joined}
        mark={countTake === "mark"}
        open={filesOpen}
        bind:group={glass}
      />
    </div>
  </div>
  <div aria-hidden="true" class="main" data-transcript>
    <div class="transcript shot" style:--shot="url({shotDesk})"></div>
    <div class="composer shot" style:--shot="url({shotDesk})"></div>
  </div>
  {#if picked}
    <div class="float shown" data-float="file">
      <div class="kit-pop float-pop" data-state="open">
        <ArtifactShown name={chosenName} page={boardPage} />
      </div>
    </div>
  {/if}
  <FilesGlass {glass} open={filesOpen} bind:joined>
    <FilesList
      artifacts={files.artifacts}
      attachments={files.attachments}
      chosen={picked ? CHOSEN : null}
      details={fill === "faileddetails"}
      failed={fill === "failed" || fill === "faileddetails" ? READ_ERROR : null}
      loading={fill === "loading"}
      {query}
    />
  </FilesGlass>
</div>

<style>
  :global(html[data-frame="desk"]),
  :global(html[data-frame="desk"] body) {
    margin: 0;
    overflow: hidden;
    background: var(--background);
  }
  .desk {
    --bar: 44px;
    --rail: 228px;
    /* Files' top: the glass's foot, its 36px a group pad in from the bar's
       top (`.bar-end`). */
    --float-top: calc(var(--c-bar-group-pad) + var(--c-btn-h));
    /* The room under that line, less the 11px kept from the screen's foot
       (CawFloat). */
    --float-h: min(
      var(--c-caw-panel-h),
      calc(100% - var(--float-top) - var(--space-3))
    );
    position: relative;
    inline-size: 100vw;
    block-size: 100vh;
    overflow: clip;
    background: var(--tab-sheet);
  }
  /* Under 900px the rail is the burger's sheet (DESIGN.md, Breakpoints):
     the page runs from the screen's edge. */
  @media (max-width: 899px) {
    .desk {
      --rail: 0px;
    }
    .rail {
      display: none;
    }
  }
  /* Today's screen, by day: cut from the live capture where it stands. At
     night its surfaces alone, since the capture is a day one. */
  .shot {
    background-image: var(--shot);
    background-repeat: no-repeat;
  }
  :global(html.dark) .shot {
    background-image: none;
  }
  .rail {
    position: absolute;
    inset: 0 auto 0 0;
    inline-size: var(--rail);
    background-color: var(--background);
    background-position: 0 0;
    border-inline-end: 1px solid var(--border-hairline);
    box-sizing: border-box;
  }
  .bar {
    position: absolute;
    inset: 0 0 auto var(--rail);
    block-size: var(--bar);
    background-color: var(--surface-shelf);
    background-position: -228px 0;
  }
  /* The bar's trailing group, where Shell stands it: the page's 21px end
     inset, 4px in from the bar's top (DESIGN.md, Top bar's trailing edge),
     on the shelf over the capture's group. */
  .bar-end {
    position: absolute;
    inset-block: 0 1px;
    inset-inline-end: 0;
    display: flex;
    align-items: flex-start;
    padding-block-start: var(--c-bar-group-pad);
    padding-inline: var(--space-3) var(--space-6);
    background: var(--surface-shelf);
  }
  .main {
    position: absolute;
    inset: var(--bar) 0 0 var(--rail);
    overflow: clip;
  }
  .transcript {
    position: absolute;
    inset: 0 auto auto 0;
    inline-size: 1212px;
    block-size: 748px;
    background-position: -228px calc(-1 * var(--bar));
  }
  /* Centred as today; on a page narrower than it, held to the page's start
     at the composer's 11px margin. */
  .composer {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: max(var(--space-3), calc(50% - 360px));
    inline-size: 720px;
    block-size: 108px;
    background-position: -474px -792px;
  }
  /* A floating panel: CawFloat's kit popover, edge to edge inside. */
  .float {
    position: absolute;
    inset-block-start: var(--float-top);
    display: flex;
    block-size: var(--float-h);
  }
  .float-pop {
    display: flex;
    flex: 1;
    min-inline-size: 0;
    padding: 0;
    overflow: hidden;
  }
  /* Inside the popover the card's own surface is the popover's: no second
     shadow, radius or inset. */
  .float-pop > :global([data-slot="side-card"]) {
    flex: 1;
    border-radius: 0;
    box-shadow: none;
  }
  /* The file beside Files, on its leading side: its top on Files' top, its
     trailing edge 11px clear of Files' leading one (Files hangs flush with
     the glass's trailing flank, the bar's 21px in from the page's end, the
     panel's width wide), the split's share of the page (Split's 45%), and
     never nearer the rail than the same 11px on a narrower desk. */
  .float[data-float="file"] {
    --beside-files: calc(var(--space-6) + var(--c-panel-w) + var(--space-3));
    inset-inline-end: var(--beside-files);
    inline-size: min(
      calc((100% - var(--rail)) * 0.45),
      calc(100% - var(--rail) - var(--space-3) - var(--beside-files))
    );
  }
</style>
