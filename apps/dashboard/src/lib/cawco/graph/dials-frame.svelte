<script lang="ts">
  /**
   * The Controls face where DesignGraph stands it, with no store read: the
   * room's surface at its width and height, its head holding the faces'
   * switch with Controls shown, the face at the room's inset under it, so a
   * list or a picker the face opens has the room's height to open into.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { ComponentProps } from "svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import {
    IconListRows,
    IconPlay,
    IconStructure,
    IconTuning,
  } from "#lib/icons.js";
  import Dials from "./Dials.svelte";
  import RoomFaces from "./RoomFaces.svelte";

  let {
    width,
    height,
    ...face
  }: ComponentProps<typeof Dials> & {
    /** The room's width, px. */
    width: number;
    /** The room's height, px. */
    height: number;
  } = $props();

  /** Under this room width the room is the phone's drawer, px (a 390 screen's). */
  const PHONE_WIDE = 391;
  const faces = [
    { value: "states", label: words.statesFace, icon: IconListRows },
    { value: "map", label: words.wholeSet, icon: IconStructure },
    { value: "move", label: words.moveFace, icon: IconPlay },
    { value: "dials", label: words.dialsFace, icon: IconTuning },
  ] as const;
</script>

<div class="bg-surface-page p-space-5">
  <div
    class="relative flex h-(--frame-h) w-(--frame-w) flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile timeline-scope-transcript-head"
    style:--face-top="var(--spacing-c-head-room)"
    style:--frame-h={`${height}px`}
    style:--frame-w={`${width}px`}
  >
    <!-- The room's head floats over the face as the graph's does: the rows
         run up beneath it, clear it at rest and fade under it. -->
    <HeadFade band="var(--face-top)" tint="bg-surface-raised" />
    <div
      class="absolute inset-x-0 top-0 z-2 flex h-c-head-room min-w-0 items-center ps-space-4 pe-space-2"
    >
      <!-- At a phone drawer's width the faces' switch draws the shown face's
           name and the others' glyphs, as the graph's drawer does. -->
      <RoomFaces
        {faces}
        glyphs={width < PHONE_WIDE}
        label={words.room(faces.map((one) => one.label))}
        onchoose={() => undefined}
        value="dials"
      />
    </div>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col px-space-4 pb-space-4">
      <Dials {...face} />
    </div>
  </div>
</div>
