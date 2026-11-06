<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  /**
   * The artifact panel's bar symbols in one face (`?set=duotone|linear|
   * hugeicons`), for the owner's pick of the face: the head as it floats
   * over the page (title, mode, Comments with its badge, Reload, Open,
   * Expand, Close) and the Comments rail's bar (its title, Search, +), on a
   * desk, with comment 4's card bar (Resolve, Delete, More, Close); under
   * 640px the phone's head and comment 4 opened in the Comments sheet (the
   * app's drawer), Back leading. Every
   * symbol stands in the house's bar recipe (BarGlass, BarItem,
   * `--c-bar-symbol`), so each face is drawn at the one size and place the
   * product would draw it.
   */
  import PinMark from "#lib/cawco/preview/PinMark.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { page } from "$app/state";
  import pageDesk from "../artifact-panel/page-desk.webp";
  import pagePhone from "../artifact-panel/page-phone.webp";
  import { GLYPH_SETS, type Glyph, VIEWBOX } from "./sets";

  type Face = keyof typeof GLYPH_SETS;
  const asked = page.url.searchParams.get("set") ?? "linear";
  const face: Face = asked in GLYPH_SETS ? (asked as Face) : "linear";
  const box = VIEWBOX[face];
  const TITLE = "Where Close stands in the glass bars";
  const phone = new MediaQuery("(width < 640px)");
  /** The open comments' count on the badge (`?count=`). */
  const count = Number(page.url.searchParams.get("count") ?? 5);
</script>

{#snippet glyph(name: Glyph)}
  <svg
    aria-hidden="true"
    data-slot="bar-symbol"
    fill="none"
    viewBox="0 0 {box} {box}"
    xmlns="http://www.w3.org/2000/svg">{@html GLYPH_SETS[face][name]}</svg
  >
{/snippet}

{#snippet item(name: Glyph, label: string, pressed = false)}
  <BarItem {label} {pressed} tip={false}>{@render glyph(name)}</BarItem>
{/snippet}

{#snippet comments()}
  <BarItem {count} label={`Comments, ${count} open`} tip={false}
    >{@render glyph("comments")}</BarItem
  >
{/snippet}

{#snippet title(phone: boolean)}
  <button
    class="mark-line flex min-w-0 items-center gap-space-1 rounded-lg ps-space-2 pe-space-1 text-start"
    type="button"
  >
    <span
      class={[
        "min-w-0 text-ink-strong type-row",
        phone
          ? "line-clamp-2"
          : "overflow-clip text-ellipsis whitespace-nowrap",
      ]}>{TITLE}</span
    >
    <svg
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
      fill="none"
      viewBox="0 0 {box} {box}"
      xmlns="http://www.w3.org/2000/svg">{@html GLYPH_SETS[face].chevron}</svg
    >
  </button>
{/snippet}

{#snippet listTitle()}
  <button
    class="mark-line flex min-w-0 flex-1 items-center gap-space-2 ps-space-2 text-start"
    type="button"
  >
    <span class="text-ink-strong type-label">Open</span>
    <span class="text-ink-muted type-label num">5</span>
    <svg
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
      fill="none"
      viewBox="0 0 {box} {box}"
      xmlns="http://www.w3.org/2000/svg">{@html GLYPH_SETS[face].chevron}</svg
    >
  </button>
{/snippet}

<!-- A comment's card bar (PinCard): Back where it was opened from a list,
     its pill, Resolve, Delete and More in one glass, Close in its own. -->
{#snippet cardBar(back: boolean)}
  <div class="flex items-center gap-space-2">
    {#if back}
      <BarGlass form="group"
        >{@render item("back", "Back to Comments")}</BarGlass
      >
    {/if}
    <PinMark number={4} state="sent" />
    <span class="me-auto"></span>
    <BarGlass form="group">
      {@render item("resolve", "Resolve")}
      {@render item("delete", "Delete comment")}
      {@render item("more", "More for comment 4")}
    </BarGlass>
    <BarGlass form="group">{@render item("close", "Close")}</BarGlass>
  </div>
{/snippet}

<div
  class="h-dvh bg-surface-recess p-space-2 max-phone:p-0"
  data-bar-glyphs={face}
>
  <section
    class="relative flex h-full flex-col overflow-hidden rounded-(--c-float-panel-r) bg-surface-well shadow-drawer max-phone:rounded-none"
  >
    <div class="absolute inset-0 overflow-hidden pt-c-head-room">
      <img
        alt={TITLE}
        class="block h-auto max-w-full"
        src={phone.current ? pagePhone : pageDesk}
      />
    </div>
    <!-- The desk's head, floating over the page. -->
    <header
      class="relative z-2 flex h-c-head-room items-center gap-space-1 px-space-2 max-phone:hidden"
    >
      <div class="flex min-w-0 flex-1">{@render title(false)}</div>
      <BarGlass form="group">
        {@render item("interact", "Interact", true)}
        {@render item("comment", "Comment")}
        {@render item("draw", "Draw")}
      </BarGlass>
      <BarGlass form="group">
        {@render comments()}
        {@render item("reload", "Reload")}
        {@render item("open", "Open in new tab")}
        {@render item("expand", "Expand")}
      </BarGlass>
      <BarGlass form="group">{@render item("close", "Close")}</BarGlass>
    </header>
    <!-- The phone's head: Close leading, the title in two lines, one glass. -->
    <header
      class="relative z-2 hidden h-c-head-room items-center gap-space-2 px-space-2 max-phone:flex"
    >
      <BarGlass form="group">{@render item("close", "Close")}</BarGlass>
      <div class="flex min-w-0 flex-1">{@render title(true)}</div>
      <BarGlass form="group">
        {@render item("interact", "Mode: Interact")}
        {@render comments()}
        {@render item("more", "More")}
      </BarGlass>
    </header>
    <!-- A desk: the Comments rail's bar in its floating glass, and comment
         4's card standing on the page, its own bar. -->
    {#if !phone.current}
      <div
        class="absolute end-space-2 top-c-head-room z-1 flex w-c-comments-w items-center gap-space-1 rounded-(--c-float-panel-r) border border-border-hairline bg-material-panel p-space-2 shadow-overlay glass-backdrop"
      >
        {@render listTitle()}
        <BarGlass form="group">
          {@render item("search", "Search comments")}
          {@render item("plus", "Comment on the whole page")}
        </BarGlass>
      </div>
      <div
        class="absolute start-space-6 bottom-space-6 z-1 w-c-pin-card-w rounded-lg border border-border-control bg-surface-raised p-space-3 shadow-overlay"
        data-slot="glyph-card"
      >
        {@render cardBar(false)}
      </div>
    {:else}
      <!-- A phone: comment 4 opened in the Comments sheet, the app's
           drawer, Back leading. -->
      <div
        class="absolute inset-x-0 bottom-0 z-1 rounded-t-lg border-t border-border-hairline bg-surface-raised px-space-3 pt-space-3 pb-space-6 shadow-drawer"
        data-slot="glyph-sheet"
      >
        {@render cardBar(true)}
      </div>
    {/if}
  </section>
</div>
