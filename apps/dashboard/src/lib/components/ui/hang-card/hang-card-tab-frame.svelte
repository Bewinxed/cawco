<script lang="ts">
  /**
   * The session card (HangCard `details`, `tab`) in a frame of its own (its
   * states file's): hung open from the chosen folder tab of a session strip,
   * placed by the strip's own rule (hang-place `placeUnder`), with stand-in
   * rows where SessionDetails stands, so no store is read. The frame is the
   * card's hang layer (hang-layer): a `shell` container of the width asked
   * for, its height said as `--shell-h`, the card portaled into it as the
   * app portals it into the Shell's. Its form is the frame's: the desk's
   * 416px card at 1440, the phone's margin to margin at 390, its height held
   * under the phone's screen.
   */
  // bits-ui's own popover, as PaneTabs hangs it: its bare content in one portal.
  import { transcriptWords } from "@cawco/core";
  import { Popover } from "bits-ui";
  import { cardWidthIn, placeUnder } from "#lib/cawco/workspace/hang-place.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import HangCard from "./hang-card.svelte";
  import { provideHangLayer } from "./hang-layer";

  let {
    width,
    height,
    tabs,
    rows,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    /** The frame's height, px: the screen the card hangs in. */
    height: number;
    /** The strip's tabs, the first one chosen; the card hangs from it. */
    tabs: string[];
    /** The card's rows, each a line of words. */
    rows: string[];
  } = $props();

  const layerId = $props.id();
  const layer = provideHangLayer(layerId);
  let shell = $state<HTMLElement | null>(null);
  let joined = $state(false);
  let flush = $state<"start" | "end" | null>(null);
  const chosen = $derived(tabs[0] ?? "");
  /** The chosen tab's box, the card's anchor, once the strip is drawn. */
  let anchor = $state<HTMLElement | null>(null);
  let place = $state<ReturnType<typeof placeUnder> | null>(null);
  $effect(() => {
    const at = shell
      ?.querySelector(`[data-session-tab="${CSS.escape(chosen)}"]`)
      ?.closest<HTMLElement>('[data-slot="tab"]');
    if (!at) {
      return;
    }
    const room = layer.room();
    // A finger's screen under the phone line, as the strip's own `touch` reads it.
    const placed = placeUnder(at, cardWidthIn(room), room, width < 640);
    place = placed;
    ({ flush } = placed);
    anchor = at;
  });
</script>

<div
  bind:this={shell}
  class="@container/shell contain-layout relative w-(--frame-w) h-(--frame-h) bg-surface-recess [--shell-h:var(--frame-h)]"
  data-hang-layer={layer.id}
  style:--frame-h={`${height}px`}
  style:--frame-w={`${width}px`}
>
  <Tabs
    data-session-tabs
    strip="session"
    value={chosen}
    values={tabs}
    variant="folder"
  >
    <TabsList aria-label="Open sessions in this group">
      {#each tabs as tab (tab)}
        {@const hung = tab === chosen && joined}
        <!-- The tab's box the card hangs from, as PaneTabs wraps its tabs. -->
        <div
          class="group/tab pane-tab-pads pane-tab-rims relative flex max-w-c-tab-max-w min-w-0 flex-none"
          data-chosen={tab === chosen ? "" : undefined}
          data-flush={hung ? (flush ?? undefined) : undefined}
          data-hung={hung ? "" : undefined}
          data-slot="tab"
        >
          <TabItem
            data-session-tab={tab}
            flush={hung ? (flush ?? undefined) : undefined}
            {hung}
            label={tab}
            value={tab}
          />
        </div>
      {/each}
    </TabsList>
  </Tabs>
  {#if anchor && place}
    <Popover.Root open>
      <Popover.Portal to={layer.to}>
        <HangCard
          align="start"
          alignOffset={place.offset}
          {anchor}
          aria-label={transcriptWords.sessionDetails}
          as={Popover.Content}
          class="z-(--layer-float) w-(--hang-width)"
          collisionPadding={12}
          customAnchor={anchor}
          data-safe-bottom
          data-session-details-popover
          frame="details"
          onneck={(neck) => {
            ({ flush } = neck);
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          side="bottom"
          sideOffset={0}
          style={`--hang-width: ${place.width}px`}
          tab
          trapFocus={false}
          bind:joined
        >
          <div class="flex w-full flex-col p-space-3">
            {#each rows as row (row)}
              <p class="py-space-2 text-label text-ink-strong">{row}</p>
            {/each}
          </div>
        </HangCard>
      </Popover.Portal>
    </Popover.Root>
  {/if}
</div>
