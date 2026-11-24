<script lang="ts">
  /**
   * The kit's Sheet in a frame of its own (its states file's): open from
   * its side over its scrim, drawn in place (the portal off) in a box that
   * holds it (`contain: layout`, so its fixed surface and scrim stand in the
   * frame), its floating header and a body of rows as the kit's Buttons. It
   * stays open: a press outside or Esc leaves it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Sheet from "./index.js";

  let {
    title,
    side,
    rows,
    height,
  }: {
    /** Its title. */
    title: string;
    /** The edge it comes from. */
    side: "left" | "right";
    /** What it lists. */
    rows: string[];
    /** The frame's height, px. */
    height: number;
  } = $props();
</script>

<div
  class="relative h-(--frame-h) w-full overflow-clip contain-layout"
  style:--frame-h={`${height}px`}
>
  <Sheet.Root open>
    <Sheet.Content
      escapeKeydownBehavior="ignore"
      interactOutsideBehavior="ignore"
      onOpenAutoFocus={(event) => event.preventDefault()}
      portalProps={{ disabled: true }}
      {side}
      {title}
      trapFocus={false}
    >
      <div
        class={[
          "flex min-h-0 flex-1 flex-col gap-space-1 overflow-y-auto p-space-4",
          Sheet.scroller,
        ]}
      >
        {#each rows as row (row)}
          <Button align="row" variant="ghost">{row}</Button>
        {/each}
      </div>
    </Sheet.Content>
  </Sheet.Root>
</div>
