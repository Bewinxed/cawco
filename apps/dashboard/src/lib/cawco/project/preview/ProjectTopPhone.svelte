<script lang="ts">
  /**
   * The project page on a phone, as a design fixture (the project page's
   * states files): the one-row head (the name, the place as an OS-mark
   * item, Caw's 48px seat, and a capsule holding More alone), the page
   * under it, and the views' bar docked at the foot (ViewBar), whose
   * trailing capsule is Ask Caw, drawn in `askGlyph`. Cawco-Dev's live data
   * (project-data.ts); no store is read.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { IconMore } from "#lib/icons.js";
  import ViewBar from "../ViewBar.svelte";
  import { GLASS_CAPSULE } from "./glass";
  import { ASK_GLYPHS, type AskGlyph, PROJECT, VIEWS } from "./project-data";

  let {
    width,
    height,
    askGlyph = "chat-add",
  }: {
    /** The phone's width, px. */
    width: number;
    /** How much of the page shows, px: the head, then the bar at its foot. */
    height: number;
    askGlyph?: AskGlyph;
  } = $props();

  const SEAT = 48;

  let current = $state("board");
</script>

<div
  data-slot="project-phone"
  class="relative h-(--frame-h) w-(--frame-w) overflow-clip bg-surface-recess"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
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
      <CawFace size={48} status="ready" />
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
