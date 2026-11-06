<script lang="ts">
  /**
   * The room's head (DesignGraph's room, beside the stage at 1440 or in the
   * phone's drawer at 390) holding its faces' switch, with no store read:
   * the room's own surface and head line round RoomFaces, so the switch's
   * states are read where it stands.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import {
    IconDial,
    IconListRows,
    IconPlay,
    IconStructure,
  } from "#lib/icons.js";
  import RoomFaces from "./RoomFaces.svelte";

  type Face = "states" | "map" | "move" | "dials";

  let {
    width,
    chosen = "states",
    dials = false,
  }: {
    /** The room's width, px. */
    width: number;
    /** The face shown. */
    chosen?: Face;
    /** The routine put dials on the drawing: the Dials face stands. */
    dials?: boolean;
  } = $props();

  const faces = $derived<
    { value: Face; label: string; icon: typeof IconPlay }[]
  >([
    { value: "states", label: words.statesFace, icon: IconListRows },
    { value: "map", label: words.wholeSet, icon: IconStructure },
    { value: "move", label: words.moveFace, icon: IconPlay },
    ...(dials
      ? [{ value: "dials" as const, label: words.dialsFace, icon: IconDial }]
      : []),
  ]);

  // The story's face until a press picks another (house/follows-props).
  let face = $derived<Face>(chosen);
</script>

<div class="bg-surface-page p-space-5">
  <div
    class="flex w-(--frame-w) flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
    style:--frame-w={`${width}px`}
  >
    <div
      class="flex min-h-c-top-bar-h min-w-0 flex-none items-center gap-space-2 border-b border-border-hairline ps-space-4 pe-space-2"
    >
      <RoomFaces
        {faces}
        label={words.room(faces.map((one) => one.label))}
        onchoose={(next) => {
          face = next;
        }}
        value={face}
      />
    </div>
    <div class="h-space-8"></div>
  </div>
</div>
