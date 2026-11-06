<script lang="ts">
  /**
   * A head's floating group (BarGlass `form="group"`) in a frame of its own
   * (bar-glass.stories.ts), on a head's row of the width asked for, holding
   * stand-in controls with no store read, so the canvas forces every state
   * of each: `three`, a group of three bar items, leading, middle and
   * trailing; `selected`, the same with its middle item on; `counted`, a
   * counted item beside a plain neighbour; `mode`, the mode switch (the
   * fluid Tabs' segmented track, its three glyphs) alone in its glass;
   * `kit`, a kit Button, Toggle and Tabs list standing in one glass.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as KitTabs from "#lib/components/ui/tabs/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import {
    IconChat,
    IconInteract,
    IconPen,
    IconPin,
    IconPlus,
    IconRefresh,
    IconTuning,
  } from "#lib/icons.js";
  import BarGlass from "./bar-glass.svelte";
  import BarItem from "./bar-item.svelte";

  let {
    width,
    holds,
    count = 3,
    pressed = false,
  }: {
    /** The frame's width, px. */
    width: number;
    /** What the glass holds. */
    holds: "three" | "selected" | "counted" | "mode" | "kit";
    /** The counted item's number (`counted`). */
    count?: number;
    /** The counted item is on (`counted`): a toggle held pressed. */
    pressed?: boolean;
  } = $props();

  // The mode the switch stands on, and the kit Tabs' chosen segment, until a
  // press picks another.
  let mode = $state("interact");
  let segment = $state("pin");
</script>

<div
  class="@container/shell contain-layout w-(--frame-w) bg-surface-recess pbe-space-8"
  style:--frame-w={`${width}px`}
>
  <header
    class="flex h-c-btn-h-lg items-center justify-end gap-space-1 bg-surface-raised pe-space-3 ps-space-3"
  >
    <span class="me-auto truncate type-label text-ink-strong">index.html</span>
    <BarGlass form="group">
      {#if holds === "three" || holds === "selected"}
        <BarItem icon={IconPlus} label="New canvas" tip={false} />
        <BarItem
          icon={IconTuning}
          label="Inspect"
          pressed={holds === "selected"}
          tip={false}
        />
        <BarItem icon={IconRefresh} label="Reload" tip={false} />
      {:else if holds === "counted"}
        <BarItem
          {count}
          icon={IconChat}
          label={`Comments, ${count} open`}
          {pressed}
          tip={false}
        />
        <BarItem icon={IconRefresh} label="Reload" tip={false} />
      {:else if holds === "mode"}
        <Tabs
          onValueChange={(next) => {
            mode = next;
          }}
          size="compact"
          value={mode}
          values={["interact", "comment", "draw"]}
        >
          <TabsList aria-label="Mode">
            <TabItem
              glyphOnly
              icon={IconInteract}
              label="Interact"
              value="interact"
            />
            <TabItem glyphOnly icon={IconPin} label="Comment" value="comment" />
            <TabItem glyphOnly icon={IconPen} label="Draw" value="draw" />
          </TabsList>
        </Tabs>
      {:else}
        <Button aria-label="Reload" size="icon-sm" variant="ghost">
          <IconRefresh />
        </Button>
        <Toggle aria-label="Inspect" size="sm">
          <IconTuning />
        </Toggle>
        <KitTabs.Root bind:value={segment}>
          <KitTabs.List aria-label="Mode">
            <KitTabs.Trigger aria-label="Comment" value="pin"
              ><IconPin /></KitTabs.Trigger
            >
            <KitTabs.Trigger aria-label="Draw" value="pen"
              ><IconPen /></KitTabs.Trigger
            >
          </KitTabs.List>
        </KitTabs.Root>
      {/if}
    </BarGlass>
  </header>
</div>
