<script lang="ts">
  /**
   * The bars the owner picks between (the title-bars decision page), each
   * drawn from the kit's own parts (BarGlass, BarItem, the sheet head's
   * recipe) at a screen's width, with real words, so an option is judged at
   * its real size. No store is read.
   *
   * - `sheet`: a bottom sheet's bar ("Usage limits"), Close `leading` (HIG,
   *   Sheets) or `trailing` (DESIGN.md:720, :912).
   * - `rail`: the Comments rail's bar, Sort, Comment on the whole page and
   *   Close as `one` glass group (DESIGN.md:998) or Close in a group of its
   *   `own` (HIG, Toolbars).
   * - `card`: the plan card over the composer, with its Close (`kept`) or
   *   without (`gone`, HIG, Popovers).
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { planWords } from "@cawco/core/words/plan";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconClose, IconPlus, IconSearch, IconSort } from "#lib/icons.js";
  import { sheetHeadVariants } from "../../drawer/sheet-head.js";
  import BarGlass from "../bar-glass.svelte";
  import BarItem from "../bar-item.svelte";

  let {
    width,
    of,
    close = "trailing",
    group = "one",
    card = "kept",
  }: {
    /** The screen's width, px. */
    width: number;
    of: "sheet" | "rail" | "card";
    close?: "leading" | "trailing";
    group?: "one" | "own";
    card?: "kept" | "gone";
  } = $props();

  const head = sheetHeadVariants();
  /** A desk's sheet comes in from the right, full height; a phone's rises from the foot. */
  const desk = $derived(width >= 900);
  /** Where the surface stands in the screen: a sheet at the foot or the right edge, the others at the foot, inset. */
  const sheetPlace = $derived.by(() => {
    if (of !== "sheet") {
      return "items-center justify-end px-space-5 pb-space-5";
    }
    return desk ? "items-end" : "justify-end";
  });
  const noop = () => undefined;
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
      <aside
        class="flex w-c-comments-w max-w-full flex-col self-end rounded-lg bg-surface-raised shadow-tile"
      >
        <div
          class="flex h-c-top-bar-h items-center justify-end gap-space-2 px-space-2"
        >
          <BarGlass form="group">
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
        <div class="flex flex-col gap-space-3 px-space-3 pb-space-5">
          <InputGroup.Root>
            <InputGroup.Addon><IconSearch /></InputGroup.Addon>
            <InputGroup.Input
              aria-label={commentWords.searchComments}
              placeholder={commentWords.searchComments}
            />
          </InputGroup.Root>
          <p class="m-0 type-label text-ink-strong">No open comments</p>
          <p class="m-0 type-meta text-ink-muted">
            Choose Comment, then click something on the page.
          </p>
        </div>
      </aside>
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
