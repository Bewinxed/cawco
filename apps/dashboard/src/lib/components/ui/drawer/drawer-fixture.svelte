<script lang="ts">
  /**
   * The kit's Drawer in a frame of its own (its states file's): a bottom
   * sheet open at its head, contained in a layer the frame's size (the
   * portal off), its grabber, its header and a body of the kit's Buttons,
   * as the phone's sheets compose it.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "./index.js";

  let {
    title,
    rows,
    height,
  }: {
    /** Its title. */
    title: string;
    /** What it lists. */
    rows: string[];
    /** The frame's height, px. */
    height: number;
  } = $props();

  let layer = $state<HTMLElement | null>(null);
</script>

<div
  class="relative h-(--frame-h) w-full overflow-clip bg-surface-page"
  style:--frame-h={`${height}px`}
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
        modal={false}
        onOpenAutoFocus={(event: Event) => event.preventDefault()}
        portalProps={{ disabled: true }}
        {title}
        trapFocus={false}
      >
        <div
          class={[
            "flex min-h-0 flex-col gap-space-1 overflow-y-auto p-space-4",
            Drawer.scroller,
          ]}
        >
          {#each rows as row (row)}
            <Button align="row" press="tint" variant="ghost">{row}</Button>
          {/each}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>
