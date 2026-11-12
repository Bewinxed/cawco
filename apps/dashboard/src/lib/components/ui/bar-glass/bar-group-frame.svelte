<script lang="ts">
  /**
   * A head's floating group (BarGlass `form="group"`) in a frame of its own
   * (bar-glass.stories.ts), on a head's row of the width asked for, holding
   * stand-in controls with no store read, so the canvas forces every state
   * of each: `three`, a group of three bar items, leading, middle and
   * trailing; `selected`, the same with its middle item on; `counted`, a
   * counted item beside a plain neighbour; `mode`, the mode switch
   * (BarSegments, its three glyphs, `chosen` the chosen one) alone in its
   * glass; `toolbar`, a group of four bar items `c-bar-groups-gap` before
   * the mode switch; `kit`, a kit Button and Toggle standing in one glass.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import {
    IconChatLinear,
    IconFolderLinear,
    IconInteractLinear,
    IconMoreLinear,
    IconPenLinear,
    IconPinLinear,
    IconRefresh,
    IconRefreshLinear,
    IconSearch,
    IconTuning,
    IconTuningLinear,
  } from "#lib/icons.js";
  import { BarGlass, BarItem, BarSegments } from "./index.js";

  type Mode = "interact" | "comment" | "draw";
  const MODES: readonly {
    value: Mode;
    label: string;
    icon: typeof IconPinLinear;
    keys: string;
  }[] = [
    {
      value: "interact",
      label: "Interact",
      icon: IconInteractLinear,
      keys: "V",
    },
    { value: "comment", label: "Comment", icon: IconPinLinear, keys: "C" },
    { value: "draw", label: "Draw", icon: IconPenLinear, keys: "D" },
  ];

  let {
    width,
    holds,
    count = 3,
    pressed = false,
    chosen = "interact",
  }: {
    /** The frame's width, px. */
    width: number;
    /** What the glass holds. */
    holds: "three" | "selected" | "counted" | "mode" | "toolbar" | "kit";
    /** The counted item's number (`counted`). */
    count?: number;
    /** The counted item is on (`counted`): a toggle held pressed. */
    pressed?: boolean;
    /** The mode switch's chosen segment (`mode`, `toolbar`). */
    chosen?: Mode;
  } = $props();

  // The story's chosen mode, until a press picks another (it follows the
  // story's args while mounted: house/follows-props).
  let mode = $derived(chosen);
</script>

{#snippet modes()}
  <BarSegments label="Mode" segments={MODES} bind:value={mode} />
{/snippet}

<div
  class="@container/shell contain-layout w-(--frame-w) bg-surface-recess pbe-space-8"
  style:--frame-w={`${width}px`}
>
  <header
    class="flex h-c-btn-h-lg items-center justify-end gap-space-1 bg-surface-raised pe-space-3 ps-space-3"
  >
    <span class="me-auto truncate type-label text-ink-strong">index.html</span>
    {#if holds === "mode"}
      {@render modes()}
    {:else if holds === "toolbar"}
      <div class="flex items-center gap-2">
        <BarGlass form="group">
          <BarItem icon={IconSearch} label="Search" tip={false} />
          <BarItem
            count={3}
            icon={IconFolderLinear}
            label="Files, 3"
            tip={false}
          />
          <BarItem
            icon={IconTuningLinear}
            label="Inspect"
            pressed
            tip={false}
          />
          <BarItem icon={IconMoreLinear} label="More" tip={false} />
        </BarGlass>
        {@render modes()}
      </div>
    {:else}
      <BarGlass form="group">
        {#if holds === "three" || holds === "selected"}
          <BarItem icon={IconSearch} label="Search" tip={false} />
          <BarItem
            icon={IconTuningLinear}
            label="Inspect"
            pressed={holds === "selected"}
            tip={false}
          />
          <BarItem icon={IconRefreshLinear} label="Reload" tip={false} />
        {:else if holds === "counted"}
          <BarItem
            {count}
            icon={IconChatLinear}
            label={`Comments, ${count} open`}
            {pressed}
            tip={false}
          />
          <BarItem icon={IconRefreshLinear} label="Reload" tip={false} />
        {:else}
          <Button aria-label="Reload" size="icon-sm" variant="ghost">
            <IconRefresh />
          </Button>
          <Toggle aria-label="Inspect" size="sm">
            <IconTuning />
          </Toggle>
        {/if}
      </BarGlass>
    {/if}
  </header>
</div>
