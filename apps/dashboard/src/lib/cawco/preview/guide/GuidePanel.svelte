<script lang="ts">
  /**
   * The artifact panel as PreviewPane stands it for the landing-hero page:
   * the side card (SideSurface) with its head's controls by the head's
   * priority rule (New canvas, Open in new tab, the mode, Comments, Reload;
   * on the artifact's own tab no New canvas and no Open in new tab), the
   * bar above the well (`above`), the page in the well, what stands over
   * the page (`over`: a thread's card, the rail's foot sheet) and the rail
   * beside it (`beside`). A fixture for the guide-after-a-reply canvases:
   * every part it mounts is the panel's own.
   */
  import type { ComponentProps, Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChat,
    IconComment,
    IconExternal,
    IconInteract,
    IconPen,
    IconPlus,
    IconRefresh,
  } from "#lib/icons.js";
  import { frameObserver, frameSize } from "../../frame-observer";
  import { HEAD_PRIORITY, type HeadItem } from "../../side/head";
  import SideSurface from "../../side/SideSurface.svelte";
  import { PAGE } from "./fixture";
  import HeroPage from "./HeroPage.svelte";

  let {
    page,
    railOpen = false,
    openCount = 2,
    ownTab = false,
    above,
    rail,
    railAway = false,
    over,
  }: {
    /** The page's washes, chosen element and pills. */
    page: ComponentProps<typeof HeroPage>;
    /** Comments stands pressed: the rail is open. */
    railOpen?: boolean;
    openCount?: number;
    /** The artifact's own tab: no New canvas, no Open in new tab. */
    ownTab?: boolean;
    above?: Snippet;
    /** The Comments rail: beside the well on a pane 640px or wider, else the well's foot sheet (DESIGN.md, The Comments rail). */
    rail?: Snippet<["beside" | "sheet"]>;
    /** A thread stands open: the rail's foot sheet stands aside, so neither covers the other. */
    railAway?: boolean;
    /** What stands over the page, given the well's room and each pill's box in it. */
    over?: Snippet<[Room]>;
  } = $props();

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }
  /** The well's room and the pills' boxes in it, as PinFloat places a card by them. */
  interface Room {
    pills: Record<number, Box>;
    room: { h: number; w: number };
  }

  /** The card's width: under 640px the rail is the foot sheet. */
  let cardWidth = $state(0);
  const narrow = $derived(cardWidth > 0 && cardWidth < 640);

  let pinRoom = $state<HTMLDivElement | null>(null);
  let measured = $state<Room>({
    pills: {},
    room: { w: 0, h: 0 },
  });
  // The room and the pills as laid out, again whenever the well resizes.
  $effect(() => {
    const el = pinRoom;
    const well = el?.parentElement;
    if (!(el && well)) {
      return;
    }
    const read = () => {
      const at = el.getBoundingClientRect();
      const pills: Record<number, Box> = {};
      for (const pill of well.querySelectorAll<HTMLElement>(
        "[data-page-pin]"
      )) {
        const r = pill.getBoundingClientRect();
        pills[Number(pill.dataset.pagePin)] = {
          x: r.left - at.left,
          y: r.top - at.top,
          w: r.width,
          h: r.height,
        };
      }
      measured = { pills, room: { w: at.width, h: at.height } };
    };
    read();
    const watch = frameObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  });

  const items = $derived<HeadItem[]>([
    ...(ownTab
      ? []
      : [
          {
            key: "create",
            priority: HEAD_PRIORITY.create,
            bar: createBar,
            menu: createMenu,
          },
          {
            key: "open",
            priority: HEAD_PRIORITY.open,
            bar: openBar,
            menu: openMenu,
          },
        ]),
    {
      key: "mode",
      priority: HEAD_PRIORITY.mode,
      bar: modeBar,
      compact: modeCompact,
      menu: modeMenu,
      group: true,
    },
    {
      key: "comments",
      priority: HEAD_PRIORITY.comments,
      bar: commentsBar,
      menu: commentsMenu,
      count: { glyph: IconChat, n: railOpen ? 0 : openCount, of: "Comments" },
      words: true,
    },
    {
      key: "reload",
      priority: HEAD_PRIORITY.reload,
      bar: reloadBar,
      menu: reloadMenu,
    },
  ]);
</script>

{#snippet createBar()}
  <Button
    aria-label="New canvas"
    icon={IconPlus}
    size="icon-sm"
    title="New canvas"
    variant="ghost"
  />
{/snippet}
{#snippet createMenu()}
  <DropdownMenu.Item><IconPlus /><span>New canvas</span></DropdownMenu.Item>
{/snippet}
{#snippet openBar()}
  <Button
    aria-label="Open in new tab"
    icon={IconExternal}
    size="icon-sm"
    title="Open in new tab"
    variant="ghost"
  />
{/snippet}
{#snippet openMenu()}
  <DropdownMenu.Item
    ><IconExternal /><span>Open in new tab</span></DropdownMenu.Item
  >
{/snippet}
{#snippet modeBar()}
  <div data-slot="modes">
    <Tabs
      size="compact"
      value="interact"
      values={["interact", "comment", "draw"]}
    >
      <TabsList aria-label="Preview mode">
        <TabItem
          glyphOnly
          icon={IconInteract}
          label="Interact"
          value="interact"
        />
        <TabItem glyphOnly icon={IconComment} label="Comment" value="comment" />
        <TabItem glyphOnly icon={IconPen} label="Draw" value="draw" />
      </TabsList>
    </Tabs>
  </div>
{/snippet}
{#snippet modeCompact()}
  <!-- The mode as one button where the head has no room for its three segments. -->
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Mode: Interact"
      size="icon-sm"
      title="Mode: Interact (V, C, D)"
      variant="ghost"
    >
      <IconInteract />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" width="compact">
      {@render modeMenu()}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.Item><IconInteract /><span>Interact</span></DropdownMenu.Item>
{/snippet}
{#snippet commentsBar()}
  <Button
    data-slot="comments"
    aria-expanded={railOpen}
    aria-label={`Comments${openCount > 0 ? `, ${openCount} open` : ""}`}
    expanded="pressed"
    size="sm"
    title="Comments"
    variant="ghost"
  >
    <IconChat /><span class="in-form-compact:hidden" data-slot="comments-label"
      >Comments</span
    >
    {#if openCount > 0 && !railOpen}
      <span data-slot="count" class="min-w-c-count-digit">{openCount}</span>
    {/if}
  </Button>
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item><IconChat /><span>Comments</span></DropdownMenu.Item>
{/snippet}
{#snippet reloadBar()}
  <Button
    aria-label="Reload"
    icon={IconRefresh}
    size="icon-sm"
    title="Reload"
    variant="ghost"
  />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item><IconRefresh /><span>Reload</span></DropdownMenu.Item>
{/snippet}

{#snippet railBeside()}
  {#if rail && !narrow}
    <div class="flex min-h-0 flex-none overflow-hidden" data-slot="rail-beside">
      {@render rail("beside")}
    </div>
  {/if}
{/snippet}

<div
  class="flex min-h-0 flex-1 flex-col"
  {@attach frameSize((node: HTMLDivElement) => {
    cardWidth = node.clientWidth;
  })}
>
  <SideSurface
    of="preview"
    mode="interact"
    {items}
    label="Preview"
    onclose={() => undefined}
    subtitle={PAGE.ask}
    title={PAGE.name}
    {above}
    beside={railBeside}
  >
    <HeroPage {...page} />
    {#if over}
      <!-- What stands over the page: the size container a card's width reads. -->
      <div
        data-slot="pin-room"
        class="@container absolute inset-0 pointer-events-none"
        bind:this={pinRoom}
      >
        {#if measured.room.w > 0}
          {@render over(measured)}
        {/if}
      </div>
    {/if}
    {#if rail && narrow && !railAway}
      <!-- The rail as the well's foot sheet, at most 60% of it. -->
      <div
        class="absolute inset-x-0 bottom-0 z-2 flex max-h-3/5"
        data-slot="rail-sheet"
      >
        {@render rail("sheet")}
      </div>
    {/if}
  </SideSurface>
</div>
