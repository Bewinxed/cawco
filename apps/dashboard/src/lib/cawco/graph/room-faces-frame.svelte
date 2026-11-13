<script lang="ts">
  /**
   * The room's head holding its faces' switch (RoomFaces), with no store
   * read, where DesignGraph stands it: beside the stage at 1440, the room's
   * own surface and head line; at 390 (`drawer`) the kit's bottom drawer,
   * contained in a layer the frame's size, open at its head, its grabber a
   * control over the faces' row, as the graph's drawer draws it. Under a
   * finger the faces' areas meet the grabber's there. Its head floats over
   * the room as the graph's does, with no hairline and no Close: the room's
   * one switch stands in the stage's glass.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    IconListRows,
    IconPlay,
    IconStructure,
    IconTuning,
  } from "#lib/icons.js";
  import RoomFaces from "./RoomFaces.svelte";

  type Face = "states" | "map" | "move" | "dials";

  let {
    width,
    chosen = "states",
    dials = false,
    drawer = false,
  }: {
    /** The room's width, px. */
    width: number;
    /** The face shown. */
    chosen?: Face;
    /** The routine put controls on the drawing: the Controls face stands. */
    dials?: boolean;
    /** The room is the phone's drawer, open at its head. */
    drawer?: boolean;
  } = $props();

  const faces = $derived<
    { value: Face; label: string; icon: typeof IconPlay }[]
  >([
    { value: "states", label: words.statesFace, icon: IconListRows },
    { value: "map", label: words.wholeSet, icon: IconStructure },
    { value: "move", label: words.moveFace, icon: IconPlay },
    ...(dials
      ? [{ value: "dials" as const, label: words.dialsFace, icon: IconTuning }]
      : []),
  ]);
  const roomName = $derived(words.room(faces.map((one) => one.label)));

  // The story's face until a press picks another (house/follows-props).
  let face = $derived<Face>(chosen);
  let layer = $state<HTMLElement | null>(null);
</script>

{#snippet switcher()}
  <RoomFaces
    {faces}
    glyphs={drawer}
    label={roomName}
    onchoose={(next) => {
      face = next;
    }}
    value={face}
  />
{/snippet}

{#if drawer}
  <div
    class="relative h-37 w-(--frame-w) overflow-clip bg-surface-page"
    style:--frame-w={`${width}px`}
    bind:this={layer}
  >
    {#if layer}
      <Drawer.Root
        container={layer}
        dismissible={false}
        modal={false}
        open
        shouldScaleBackground={false}
      >
        <Drawer.Content
          contained
          grabber={{
            label: words.nextStop(roomName, true),
            onpress: () => undefined,
          }}
          modal={false}
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
          ownHead
          portalProps={{ disabled: true }}
          title={roomName}
          trapFocus={false}
        >
          <div class="flex min-h-0 flex-auto flex-col gap-space-3 px-space-4">
            <div class="flex min-w-0 items-center">
              {@render switcher()}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {/if}
  </div>
{:else}
  <div class="bg-surface-page p-space-5">
    <div
      class="relative flex w-(--frame-w) flex-col overflow-clip rounded-lg border border-border-hairline bg-surface-raised shadow-tile"
      style:--frame-w={`${width}px`}
    >
      <div
        class="absolute inset-x-0 top-0 z-2 flex h-c-head-room min-w-0 items-center ps-space-4 pe-space-2"
      >
        {@render switcher()}
      </div>
      <div class="h-space-8 mt-c-head-room"></div>
    </div>
  </div>
{/if}
