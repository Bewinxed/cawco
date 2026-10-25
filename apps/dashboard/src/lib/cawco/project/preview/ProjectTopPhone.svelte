<script lang="ts">
  /**
   * The project page on a phone, as a design fixture (the project page's
   * states files): the shell's narrow bar (the rail's toggle, the project's
   * name as the bar's title, Caw's glass tab at the edge), the page under
   * it, and the views' bar docked at the foot (ViewBar), whose trailing
   * capsule is Ask Caw, drawn in `askGlyph`. Cawco-Dev's live data
   * (project-data.ts); no store is read.
   *
   * `head`: "row", the one-row head under the bar (the name again, the
   * place as an OS-mark item, Caw's 48px seat, a capsule holding More
   * alone); "bar", no head (the project-preview ruling under 901): the OS
   * mark follows the title in the bar, and More joins Caw in the bar's
   * trailing group at the bar's symbol size.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import { IconMore, IconSidebar } from "#lib/icons.js";
  import ViewBar from "../ViewBar.svelte";
  import { GLASS_CAPSULE } from "./glass";
  import { ASK_GLYPHS, type AskGlyph, PROJECT, VIEWS } from "./project-data";

  let {
    width,
    height,
    head = "row",
    askGlyph = "chat-add",
  }: {
    /** The phone's width, px. */
    width: number;
    /** How much of the page shows, px: the bar, the head, then the views' bar at its foot. */
    height: number;
    head?: "row" | "bar";
    askGlyph?: AskGlyph;
  } = $props();

  const SEAT = 48;
  /** Caw's head in the phone's glass tab (DESIGN.md, `c-bar-caw-head-phone`). */
  const BAR_HEAD = 24;

  /** The head dissolved into the bar (its prop, read where the glass's `head` snippet shadows it). */
  const inBar = $derived(head === "bar");
  let current = $state("board");
</script>

<div
  data-slot="project-phone"
  class="@container/shell relative h-(--frame-h) w-(--frame-w) overflow-clip bg-surface-recess"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  <!-- The shell's narrow bar: no ground; the rail's toggle, the title, the glass at the edge. -->
  <div class="flex h-c-top-bar-h items-center gap-space-2">
    <button
      data-box
      aria-label="Open the rail"
      class="select-none press-tint touch-hit grid size-c-btn-h-lg flex-none place-items-center rounded-sm bg-transparent text-ink-muted"
      type="button"
    >
      <IconSidebar aria-hidden="true" class="size-c-bar-toggle-glyph" />
    </button>
    <div
      class="mark-line flex min-w-0 grow items-center gap-space-1 pe-space-3"
    >
      <span
        data-slot="crumb"
        class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
        >{PROJECT.name}</span
      >
      {#if inBar}
        <button
          data-box
          aria-label="Project details"
          class="select-none press-tint touch-hit grid size-c-bar-item flex-none place-items-center rounded-pill bg-transparent"
          title={PROJECT.machine}
          type="button"
        >
          <OsMark class="size-c-bar-symbol text-ink-muted" os={PROJECT.os} />
        </button>
      {/if}
    </div>
    <div class="flex min-w-0 items-center self-stretch">
      <BarGlass>
        {#snippet head()}
          <button
            data-bar-item
            aria-label={inBar ? `Caw, lead of ${PROJECT.name}` : "Caw"}
            class="select-none touch-hit press-tint"
            type="button"
          >
            <CawFace size={BAR_HEAD} status="compacted" />
          </button>
        {/snippet}
        {#if inBar}
          <button
            data-bar-item
            aria-label="More for {PROJECT.name}"
            class="select-none touch-hit press-tint"
            title="More"
            type="button"
          >
            <IconMore data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/if}
      </BarGlass>
    </div>
  </div>
  {#if !inBar}
    <header
      data-slot="project-head"
      class="flex items-center gap-space-3 pt-space-5 pe-space-5 pb-space-3 ps-space-5"
    >
      <h1 class="min-w-0 type-title text-ink-strong">
        <span class="block overflow-hidden text-ellipsis whitespace-nowrap"
          >{PROJECT.name}</span
        >
      </h1>
      <button
        data-box
        aria-label="Project details"
        class="select-none press-tint touch-hit grid size-c-bar-item flex-none place-items-center rounded-pill bg-transparent"
        title={PROJECT.machine}
        type="button"
      >
        <OsMark class="size-c-bar-symbol text-ink-muted" os={PROJECT.os} />
      </button>
      <span class="flex-auto"></span>
      <button
        data-slot="caw-seat"
        aria-label="Caw, lead of {PROJECT.name}"
        class="select-none press-tint grid size-(--seat) flex-none place-items-center rounded-md bg-transparent"
        style:--seat="{SEAT}px"
        type="button"
      >
        <CawFace size={SEAT} status="ready" />
      </button>
      <div data-slot="tools" class={GLASS_CAPSULE}>
        <button
          data-bar-item
          aria-label="More for {PROJECT.name}"
          class="select-none touch-hit press-tint"
          title="More"
          type="button"
        >
          <IconMore data-slot="bar-symbol" aria-hidden="true" />
        </button>
      </div>
    </header>
  {/if}
  <ViewBar
    askIcon={ASK_GLYPHS[askGlyph]}
    {current}
    needs={0}
    needsOn={false}
    onchoose={(view) => {
      current = view;
    }}
    onnewsession={() => undefined}
    ontoggleneeds={() => undefined}
    views={VIEWS}
  />
</div>
