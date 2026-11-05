<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  /**
   * The artifact panel's bar symbols in one face (`?set=duotone|linear|
   * hugeicons`), for the owner's pick of the face: the head as it floats
   * over the page (title, mode, Comments with its badge, Reload, Open,
   * Expand, Close) and the Comments rail's bar (its title, Search, +), on a
   * desk; under 640px the phone's head and the Comments sheet's bar. Every
   * symbol stands in the house's bar recipe (BarGlass, `[data-bar-item]`,
   * `--c-bar-symbol`), so each face is drawn at the one size and place the
   * product would draw it.
   */
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
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
  <button
    aria-label={label}
    aria-pressed={pressed || undefined}
    class="select-none press-tint aria-pressed:bg-surface-pressed"
    data-bar-item
    data-box
    title={label}
    type="button"
  >
    {@render glyph(name)}
  </button>
{/snippet}

{#snippet comments()}
  <button
    aria-label="Comments, 5 open"
    class="select-none press-tint"
    data-bar-item
    data-box
    title="Comments"
    type="button"
  >
    <span class="relative grid" data-box>
      {@render glyph("comments")}
      <span
        aria-hidden="true"
        class="absolute start-[calc(100%-var(--space-2))] -top-space-2 grid h-c-count-badge-h min-w-c-count-badge-h place-items-center rounded-pill bg-ink-solid px-space-1 text-on-ink type-meta num leading-none ring-(length:--status-dot-cut) ring-material-panel"
        >5</span
      >
    </span>
  </button>
{/snippet}

{#snippet title(phone: boolean)}
  <button
    class="flex min-w-0 items-center gap-space-1 rounded-lg ps-space-2 pe-space-1 text-start"
    type="button"
  >
    <span
      class={[
        "min-w-0 text-ink-strong type-row",
        phone ? "line-clamp-2" : "truncate",
      ]}>{TITLE}</span
    >
    <svg
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
      fill="none"
      viewBox="0 0 {box} {box}"
      xmlns="http://www.w3.org/2000/svg"
      >{@html GLYPH_SETS[face].chevron}</svg
    >
  </button>
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
    <!-- The Comments rail's bar, in its floating glass (a desk), or the
         Comments sheet's (a phone). -->
    <div
      class={[
        "absolute end-space-2 z-1 flex w-c-comments-w max-w-[calc(100%-var(--space-2)*2)] items-center gap-space-1 rounded-[calc(var(--c-btn-h)/2)] border border-border-hairline bg-material-panel p-space-2 shadow-overlay glass-backdrop",
        phone.current ? "bottom-space-2" : "top-c-head-room",
      ]}
    >
      {#if phone.current}
        <BarGlass form="group">{@render item("close", "Close Comments")}</BarGlass>
      {/if}
      <button
        class="flex min-w-0 flex-1 items-center gap-space-2 ps-space-2 text-start"
        type="button"
      >
        <span class="text-ink-strong type-label">Open</span>
        <span class="text-ink-muted type-label num">5</span>
        <svg
          aria-hidden="true"
          class="size-icon-sm flex-none text-ink-muted"
          fill="none"
          viewBox="0 0 {box} {box}"
          xmlns="http://www.w3.org/2000/svg"
          >{@html GLYPH_SETS[face].chevron}</svg
        >
      </button>
      <BarGlass form="group">
        {@render item("search", "Search comments")}
        {@render item("plus", "Comment on the whole page")}
      </BarGlass>
    </div>
  </section>
</div>
