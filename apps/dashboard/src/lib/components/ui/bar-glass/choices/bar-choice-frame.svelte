<script lang="ts">
  /**
   * The bars the owner picks between (the title-bars decision page), each
   * drawn from the kit's own parts (BarGlass, BarItem, the sheet head's
   * recipe) at a screen's width, with real words, so an option is judged at
   * its real size. No store is read.
   *
   * - `sheet`: a bottom sheet's bar ("Usage limits"), Close `leading` (HIG,
   *   Sheets) or `trailing` (DESIGN.md:720, :912).
   * - `rail`: the Comments rail as a phone's foot sheet, Search, Sort and
   *   Comment on the whole page in its glass, Close in the same `one` group
   *   (DESIGN.md, The Comments rail) or in a group of its `own` (HIG,
   *   Toolbars). On a desk the rail has no Close: Comments shuts it.
   * - `card`: the plan card over the composer, with its Close (`kept`) or
   *   without (`gone`, HIG, Popovers).
   * - `head`: the artifact panel's head and its artifacts menu, the leading
   *   control naming the artifact by its `slug` (today), its name spelled
   *   as `words`, or its kind's `glyph` alone with each menu row saying the
   *   artifact's ask (HIG, Toolbars: "If titling a toolbar seems
   *   redundant, you can leave the title area empty").
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { planWords } from "@cawco/core/words/plan";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconChat,
    IconChevronDown,
    IconClose,
    IconMaximize,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSort,
  } from "#lib/icons.js";
  import { sheetHeadVariants } from "../../drawer/sheet-head.js";
  import BarGlass from "../bar-glass.svelte";
  import BarItem from "../bar-item.svelte";

  let {
    width,
    of,
    close = "trailing",
    group = "one",
    card = "kept",
    title = "slug",
  }: {
    /** The screen's width, px. */
    width: number;
    of: "sheet" | "rail" | "card" | "head";
    title?: "slug" | "words" | "glyph";
    close?: "leading" | "trailing";
    group?: "one" | "own";
    card?: "kept" | "gone";
  } = $props();

  const head = sheetHeadVariants();
  /** A desk's sheet comes in from the right, full height; a phone's rises from the foot. */
  const desk = $derived(width >= 900);
  /** Where the surface stands in the screen: a sheet at the foot or the right edge, the others at the foot, inset. */
  const sheetPlace = $derived.by(() => {
    if (of === "rail") {
      return "justify-end";
    }
    if (of !== "sheet") {
      return "items-center justify-end px-space-5 pb-space-5";
    }
    return desk ? "items-end" : "justify-end";
  });
  const noop = () => undefined;
  /** The session's artifacts as the menu lists them, newest first: real names, asks and kinds from this branch's work. */
  const ARTIFACTS = [
    {
      slug: "title-bars-close",
      words: "Title bars close",
      ask: "Pick where Close stands in the glass bars",
      glyph: IconArtifactPage,
      age: "2m",
    },
    {
      slug: "rail-phone-close-own",
      words: "Rail phone close own",
      ask: "Judge the phone rail with Close in a glass group of its own",
      glyph: IconArtifactCanvas,
      age: "9m",
    },
    {
      slug: "glass-page",
      words: "Glass page",
      ask: "Judge the glass bars page",
      glyph: IconArtifactPage,
      age: "1h",
    },
  ];
  const [shown] = ARTIFACTS;
  const rowName = (one: (typeof ARTIFACTS)[number]) =>
    title === "glyph" ? one.ask : one[title];
</script>

<Tooltip.Provider>
  <div
    class={[
      "flex w-(--frame-w) flex-col bg-surface-recess pt-space-8",
      sheetPlace,
    ]}
    style:--frame-w={`${width}px`}
  >
    {#if of === "sheet"}
      <section
        class={[
          "flex flex-col bg-surface-raised px-space-5 pb-space-6 shadow-drawer",
          desk
            ? "self-stretch w-c-peek-sheet-w rounded-ss-lg rounded-es-lg border-s border-s-border-hairline pt-space-5"
            : "w-full rounded-ss-lg rounded-se-lg border-t border-t-border-hairline pt-space-2",
        ]}
      >
        {#if !desk}
          <div
            class="mx-auto mb-space-3 h-space-1 w-c-btn-h-lg rounded-pill bg-border-control"
          ></div>
        {/if}
        <div class={head.head()}>
          {#if close === "leading"}
            <BarGlass form="group">
              <BarItem icon={IconClose} label="Close" onclick={noop} />
            </BarGlass>
          {/if}
          <h2
            class={[
              head.title(),
              "m-0 me-auto",
              close === "leading" && "ms-space-2",
            ]}
          >
            Usage limits
          </h2>
          {#if close === "trailing"}
            <BarGlass form="group">
              <BarItem icon={IconClose} label="Close" onclick={noop} />
            </BarGlass>
          {/if}
        </div>
        <div class="flex flex-col gap-space-3 type-body text-ink-strong">
          <p class="m-0">Claude · 5-hour window</p>
          <p class="m-0 type-meta text-ink-muted">42% used · resets at 16:40</p>
          <p class="m-0">Claude · this week</p>
          <p class="m-0 type-meta text-ink-muted">18% used · resets Monday</p>
        </div>
      </section>
    {:else if of === "rail"}
      <!-- The rail as a phone's foot sheet, with its layout today: Search,
           Sort and + in its floating glass, and Close either in the same
           group (`one`) or its own (`own`); the filter first under them. -->
      <aside
        class="flex w-full flex-col rounded-ss-lg rounded-se-lg border-t border-t-border-hairline bg-surface-raised shadow-drawer"
      >
        <div
          class="flex h-c-top-bar-h items-center justify-end gap-space-2 px-space-2"
        >
          <BarGlass form="group">
            <BarItem
              icon={IconSearch}
              label={commentWords.searchComments}
              onclick={noop}
            />
            <BarItem icon={IconSort} label={commentWords.sort} onclick={noop} />
            <BarItem
              icon={IconPlus}
              label={commentWords.onWholePage}
              onclick={noop}
            />
            {#if group === "one"}
              <BarItem
                icon={IconClose}
                label={commentWords.closeComments}
                onclick={noop}
              />
            {/if}
          </BarGlass>
          {#if group === "own"}
            <BarGlass form="group">
              <BarItem
                icon={IconClose}
                label={commentWords.closeComments}
                onclick={noop}
              />
            </BarGlass>
          {/if}
        </div>
        <div class="flex flex-col gap-space-1 px-space-3 pb-space-8">
          <Tabs size="compact" value="open" values={["open", "resolved"]}>
            <TabsList aria-label="Which comments">
              <TabItem label={commentWords.open} value="open" />
              <TabItem label={commentWords.resolved} value="resolved" />
            </TabsList>
          </Tabs>
          <p class="m-0 px-space-2 py-space-3 type-label text-ink-strong">
            {commentWords.noneOpen}
          </p>
        </div>
      </aside>
    {:else if of === "head"}
      <!-- The panel's head as it stands over a page, and its artifacts menu
           open under the leading control. -->
      <section
        class="flex w-full max-w-c-config-max-w flex-col gap-space-2 self-center rounded-lg bg-surface-recess px-space-2 pb-space-2 shadow-drawer"
      >
        <header class="flex h-c-btn-h-lg items-center gap-space-1">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={title === "glyph" ? shown.ask : undefined}
              face="title"
              size="sm"
              title={shown.ask}
              variant="ghost"
            >
              <shown.glyph data-box />
              {#if title !== "glyph"}
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{shown[title]}</span
                >
              {/if}
              <IconChevronDown />
            </DropdownMenu.Trigger>
          </DropdownMenu.Root>
          <span class="flex-1"></span>
          <BarGlass form="group">
            <BarItem icon={IconChat} label="Comments" onclick={noop} />
            <BarItem icon={IconRefresh} label="Reload" onclick={noop} />
            <BarItem icon={IconMaximize} label="Expand" onclick={noop} />
          </BarGlass>
          <BarGlass form="group">
            <BarItem icon={IconClose} label="Close" onclick={noop} />
          </BarGlass>
        </header>
        <ul
          class="m-0 flex w-full max-w-c-pin-card-reading-w list-none flex-col rounded-md border border-border-control bg-surface-raised p-space-1 shadow-tile"
        >
          {#if title !== "glyph"}
            <li class="px-space-2 py-space-1 type-meta text-ink-muted">
              {shown.ask}
            </li>
          {/if}
          {#each ARTIFACTS as one (one.slug)}
            <li
              class="mark-line flex min-h-c-btn-h items-center gap-space-2 rounded-sm px-space-2 first-of-type:bg-surface-hover"
            >
              <one.glyph
                aria-hidden="true"
                class="size-icon-md flex-none"
                data-box
              />
              <span
                class="min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
                >{rowName(one)}</span
              >
              <span class="type-meta num text-ink-muted">{one.age}</span>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <section
        class="flex w-full max-w-c-config-max-w flex-col rounded-lg bg-surface-raised shadow-drawer"
      >
        <header
          class="flex h-c-top-bar-h items-center gap-space-2 pe-space-2 ps-space-4"
        >
          <h2
            class="m-0 min-w-0 flex-auto truncate text-size-label font-medium text-ink-strong"
          >
            {planWords.plan}
          </h2>
          {#if card === "kept"}
            <BarGlass form="group">
              <BarItem icon={IconClose} label="Close" onclick={noop} />
            </BarGlass>
          {/if}
        </header>
        <ol
          class="m-0 flex list-none flex-col gap-space-2 px-space-4 pb-space-4 ps-space-4 type-body text-ink-strong"
        >
          <li>Read the Title Bars rule and its HIG pages</li>
          <li>Cut Caw's column over to floating glass</li>
          <li class="text-ink-muted">Hand the previews up</li>
        </ol>
      </section>
    {/if}
  </div>
</Tooltip.Provider>
