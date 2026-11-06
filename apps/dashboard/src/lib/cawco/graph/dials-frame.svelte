<script lang="ts">
  /**
   * The Controls face where DesignGraph stands it, with no store read: the
   * room's surface at its width and height, its head holding the faces'
   * switch with Controls shown, the face at the room's inset under it, so a
   * list or a picker the face opens has the room's height to open into.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { ComponentProps } from "svelte";
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

  const faces = [
    { value: "states", label: words.statesFace, icon: IconListRows },
    { value: "map", label: words.wholeSet, icon: IconStructure },
    { value: "move", label: words.moveFace, icon: IconPlay },
    { value: "dials", label: words.dialsFace, icon: IconTuning },
  ] as const;
</script>

<div class="bg-surface-page p-space-5">
  <div
    class="flex h-(--frame-h) w-(--frame-w) flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
    style:--frame-h={`${height}px`}
    style:--frame-w={`${width}px`}
  >
    <div
      class="flex min-h-c-top-bar-h min-w-0 flex-none items-center gap-space-2 border-b border-border-hairline ps-space-4 pe-space-2"
    >
      <RoomFaces
        {faces}
        label={words.room(faces.map((one) => one.label))}
        onchoose={() => undefined}
        value="dials"
      />
    </div>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col p-space-4">
      <Dials {...face} />
    </div>
  </div>
</div>
