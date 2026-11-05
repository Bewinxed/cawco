<script lang="ts">
  /**
   * The artifact panel whole, for judging it at its widths: its head (the
   * artifact's title and its menu, the mode, the glass, Close), the page in
   * its well, the Comments rail beside the page on a desk and the Comments
   * sheet over it on a phone (under 640px), and a thread opened. The real
   * parts (SideSurface, ArtifactMenu, CommentRail, ThreadSheet, PinCard) on
   * real records (records.ts): the decision page title-bars-close, its five
   * pins as they stand, and the session's artifacts. The page is its own
   * picture (the bench reaches no hub, and the page's doc is the hub's), and
   * the artifacts menu's read of the hub is answered here from the records.
   *
   * `?state=`: `rest` (the rail shut), `rail` (the open comments; on a
   * phone the sheet at half its room), `full` (the phone's sheet at its
   * whole room), `resolved`, `none` (no comments at all), `check` (To check
   * holds two while Open is in front), `list` (the rail's title menu open),
   * `search` (searching "HIG", with hits), `miss` (searching, none),
   * `artifacts` (the title's menu open), `thread` (comment 4 opened).
   */
  import type { Pin } from "@cawco/core/comments";
  import { commentWords } from "@cawco/core/words/comments";
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import ArtifactMenu from "#lib/cawco/preview/ArtifactMenu.svelte";
  import CommentRail from "#lib/cawco/preview/CommentRail.svelte";
  import type { RailSort } from "#lib/cawco/preview/comment-rows.js";
  import PinCard from "#lib/cawco/preview/PinCard.svelte";
  import ThreadSheet from "#lib/cawco/preview/ThreadSheet.svelte";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import { HEAD_PRIORITY, type HeadItem } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconChat,
    IconExternal,
    IconInteract,
    IconPen,
    IconPin,
    IconRefresh,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import pageDesk from "./page-desk.webp";
  import pagePhone from "./page-phone.webp";
  import { ARTIFACTS, PINS } from "./records";

  const INSTANCE = "bench-artifact-panel";
  const asked = page.url.searchParams.get("state") ?? "rail";
  const phone = new MediaQuery("(width < 640px)");

  // The artifacts menu reads the session's artifacts from the hub: answered here from the records.
  const hubFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    String(input).startsWith(`/api/instances/${INSTANCE}/artifacts`)
      ? Promise.resolve(Response.json(ARTIFACTS))
      : hubFetch(input, init);

  const [shown] = ARTIFACTS;
  /** The pins as the state has them: none, or resolved three, or as they stand. */
  const pins: Pin[] = $derived.by(() => {
    if (asked === "none") {
      return [];
    }
    if (asked === "resolved") {
      return PINS.map((one, at) =>
        at < 3 ? { ...one, resolvedAt: "2026-11-05T10:00:00.000Z" } : one
      );
    }
    return PINS;
  });
  let listOpen = $state(asked !== "rest");
  let filter = $state<"check" | "open" | "resolved">(
    asked === "resolved" ? "resolved" : "open"
  );
  let sort = $state<RailSort>("newest");
  let openPin = $state<string | null>(
    asked === "thread" ? (PINS[3]?.id ?? null) : null
  );
  const thread = $derived(pins.find((one) => one.id === openPin) ?? null);
  const draft = new ComposerDraft();
  const openCount = $derived(pins.filter((one) => !one.resolvedAt).length);
  const checked = asked === "check" ? [PINS[3]?.id, PINS[4]?.id] : [];
  let mode = $state("interact");

  setSideExpand({
    available: true,
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });

  let rail = $state<ReturnType<typeof CommentRail>>();
  /** Opens what the state names once the panel stands: a menu, the search with its words, the sheet's whole room. */
  onMount(() => {
    const press = (selector: string) =>
      document.querySelector<HTMLElement>(selector)?.click();
    requestAnimationFrame(() => {
      if (asked === "list") {
        press('[data-slot="list"]');
      } else if (asked === "artifacts") {
        press("[data-artifact-trigger]");
      } else if (asked === "full") {
        press("[data-thread-grab]");
      } else if (asked === "search" || asked === "miss") {
        rail?.focusSearch();
        requestAnimationFrame(() => {
          const field = document.querySelector<HTMLInputElement>(
            'input[data-slot="search"]'
          );
          if (field) {
            field.value = asked === "search" ? "HIG" : "zebra";
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
      }
    });
  });
  // The bench names no fleet: the panel's own words stand for the session's.
  const agent = "The session";
</script>

{#snippet modeBar()}
  <Tabs
    onValueChange={(next) => {
      mode = next;
    }}
    value={mode}
    values={["interact", "comment", "draw"]}
  >
    <TabsList aria-label="Preview mode">
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
{/snippet}
{#snippet modeMenu()}
  <DropdownMenu.Item><IconInteract /><span>Interact</span></DropdownMenu.Item>
{/snippet}
{#snippet commentsBar()}
  <!-- The rail's toggle as PreviewPane draws it: its bubble, and the count while shut. -->
  <button
    aria-expanded={listOpen}
    aria-label={`Comments, ${openCount} open`}
    class="select-none touch-hit press-tint mark-line aria-expanded:bg-surface-pressed"
    data-bar-item
    data-box
    data-counted={openCount > 0 && !listOpen ? "" : undefined}
    onclick={() => {
      listOpen = !listOpen;
    }}
    type="button"
  >
    <IconChat aria-hidden="true" data-slot="bar-symbol" />
    {#if openCount > 0 && !listOpen}<span data-slot="num">{openCount}</span
      >{/if}
  </button>
{/snippet}
{#snippet commentsMenu()}
  <DropdownMenu.Item
    onSelect={() => {
      listOpen = !listOpen;
    }}><IconChat /><span>Comments</span></DropdownMenu.Item
  >
{/snippet}
{#snippet reloadBar()}
  <BarItem icon={IconRefresh} label="Reload" onclick={() => undefined} />
{/snippet}
{#snippet reloadMenu()}
  <DropdownMenu.Item><IconRefresh /><span>Reload</span></DropdownMenu.Item>
{/snippet}
{#snippet openBar()}
  <BarItem href="#open" icon={IconExternal} label="Open in new tab" />
{/snippet}
{#snippet openMenu()}
  <DropdownMenu.Item
    ><IconExternal /><span>Open in new tab</span></DropdownMenu.Item
  >
{/snippet}

{#snippet title()}
  <ArtifactMenu
    held={ARTIFACTS.map((one) => one.id)}
    instanceId={INSTANCE}
    line={shown?.ask ?? ""}
    lineId="bench-line"
    onrefused={() => undefined}
    shown={{
      id: shown?.id ?? "",
      kind: "page",
      name: shown?.name ?? "",
      title: shown?.title,
    }}
  />
{/snippet}

{#snippet railOf(layout: "beside" | "sheet")}
  <CommentRail
    bind:this={rail}
    checks={{
      count: checked.length,
      pins: checked.filter((id): id is string => !!id),
      changes: noChanges,
      unasked: null,
    }}
    down={null}
    focused={openPin}
    hold="ready"
    {layout}
    live={new Set()}
    onclose={() => {
      listOpen = false;
    }}
    onhover={() => undefined}
    onopen={(id) => {
      openPin = id;
    }}
    onpage={() => undefined}
    onresolve={() => undefined}
    onretry={() => undefined}
    onretrypin={() => undefined}
    open={openPin}
    {pins}
    unread={new Set(checked.filter((id): id is string => !!id))}
    bind:filter
    bind:sort
  />
{/snippet}
{#snippet noChanges(_pin: Pin)}{/snippet}

{#snippet railBeside()}
  {#if listOpen && !phone.current}
    <div class="flex flex-none min-h-0 overflow-hidden">
      {@render railOf("beside")}
    </div>
  {/if}
{/snippet}

{#snippet card(one: Pin)}
  <PinCard
    agentName={agent}
    {draft}
    link={`#comment-${one.number}`}
    name={one.title ?? ""}
    onclose={() => {
      openPin = null;
    }}
    ondelete={() => Promise.resolve()}
    onfind={() => undefined}
    onplace={() => undefined}
    onreply={() => undefined}
    onresolve={() => undefined}
    onretry={() => undefined}
    parent={null}
    pin={one}
    problem={null}
  />
{/snippet}

<Tooltip.Provider>
  <div
    class="h-dvh bg-surface-recess p-space-2 max-phone:p-0"
    data-bench-panel={asked}
  >
    <SideSurface
      beside={railBeside}
      items={[
        {
          key: "mode",
          priority: HEAD_PRIORITY.mode,
          bar: modeBar,
          menu: modeMenu,
          group: true,
          place: "centre",
        },
        {
          key: "comments",
          priority: HEAD_PRIORITY.comments,
          bar: commentsBar,
          menu: commentsMenu,
          count: {
            glyph: IconChat,
            n: listOpen ? 0 : openCount,
            of: "Comments",
          },
        },
        {
          key: "reload",
          priority: HEAD_PRIORITY.reload,
          bar: reloadBar,
          menu: reloadMenu,
        },
        {
          key: "open",
          priority: HEAD_PRIORITY.open,
          bar: openBar,
          menu: openMenu,
        },
      ] satisfies HeadItem[]}
      label="Preview"
      mode="interact"
      of="preview"
      onclose={() => undefined}
      placement={phone.current ? "sheet" : "beside"}
      subtitle={shown?.ask}
      subtitleId="bench-line"
      titleControl={title}
    >
      <img
        alt={shown?.title}
        class="size-full object-cover object-top"
        src={phone.current ? pagePhone : pageDesk}
      />
      {#if phone.current}
        <ThreadSheet
          label={commentWords.comments}
          onclose={() => {
            listOpen = false;
          }}
          open={listOpen && !thread}
        >
          {@render railOf("sheet")}
        </ThreadSheet>
        {#if thread}
          <ThreadSheet
            label={`Comment ${thread.number}`}
            onclose={() => {
              openPin = null;
            }}
            open
          >
            {@render card(thread)}
          </ThreadSheet>
        {/if}
      {:else if thread}
        <div
          class="absolute end-space-4 top-space-8 w-c-pin-card-w max-h-full flex flex-col p-space-3 rounded-lg bg-surface-raised shadow-overlay"
        >
          {@render card(thread)}
        </div>
      {/if}
    </SideSurface>
  </div>
</Tooltip.Provider>
