<script lang="ts">
  /**
   * The landing-hero page as it stands after revision 7, in the well where
   * the preview frames it: the person's own page, with what the overlay
   * draws over it (overlay changes.ts and pins.ts): the done wash
   * (`--c-change-wash`) over each element changed since he looked, the 1px
   * chosen line (`--c-target-stroke`, 2px out) on the stepped one, and each
   * pin's pill (PinMark) where it was pinned.
   */
  import PinMark from "../PinMark.svelte";

  type Anchor = "#headline" | "#cta" | "#sub" | "#shot" | "#foot" | "#nav-docs";

  let {
    washed = [],
    chosen = null,
    marks = [],
    compact = false,
  }: {
    /** The anchors still washed: changed, not looked at. */
    washed?: string[];
    /** The anchor a step chose. */
    chosen?: string | null;
    /** The pins on the page: which, where, and their dot. */
    marks?: {
      number: number;
      anchor: Anchor;
      dot?: "unread" | null;
      focused?: boolean;
    }[];
    /** A phone's well: the page's own narrow layout. */
    compact?: boolean;
  } = $props();

  const mark = (anchor: Anchor) => marks.find((one) => one.anchor === anchor);
</script>

{#snippet wash(anchor: Anchor)}
  {#if washed.includes(anchor)}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute -inset-space-1 rounded-sm bg-c-change-wash"
      data-wash={anchor}
    ></span>
  {/if}
  {#if chosen === anchor}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute -inset-space-1 rounded-sm outline-1 outline-solid outline-(--c-target-stroke) outline-offset-2"
      data-chosen={anchor}
    ></span>
  {/if}
{/snippet}

{#snippet pin(anchor: Anchor, at: string)}
  {@const one = mark(anchor)}
  {#if one}
    <span class={["absolute z-1 -top-space-4", at]} data-page-pin={one.number}>
      <PinMark
        dot={one.dot ?? null}
        focused={one.focused}
        number={one.number}
      />
    </span>
  {/if}
{/snippet}

<!-- The page fills the well as the frame does; it scrolls in the frame, so here its foot is cut by the well. -->
<div
  data-slot="hero-page"
  data-compact={compact || undefined}
  class="absolute inset-0 overflow-y-auto overscroll-contain bg-surface-page text-ink-strong"
>
  <nav
    class="flex items-center gap-space-4 px-space-5 py-space-3 in-data-compact:px-space-4"
  >
    <span class="type-label font-medium">Caw&amp;Co</span>
    <span
      class="ms-auto flex items-center gap-space-4 type-meta text-ink-muted"
    >
      <span class="relative" id="nav-docs">{@render wash("#nav-docs")}Docs</span
      >
      <span>GitHub</span>
    </span>
  </nav>
  <div
    class="flex flex-col items-start gap-space-4 px-space-5 pt-space-6 in-data-compact:px-space-4 in-data-compact:pt-space-4"
  >
    <h1
      class="relative m-0 max-w-c-measure-short text-balance text-size-display leading-tight font-medium"
      id="headline"
    >
      {@render wash("#headline")}
      {@render pin("#headline", "start-space-7")}
      <span class="relative">One board for every agent</span>
    </h1>
    <span class="relative" id="cta">
      {@render wash("#cta")}
      <span
        class="relative inline-flex h-c-btn-h-lg items-center rounded-md bg-action-solid px-space-4 type-label text-on-action"
        >Connect a machine</span
      >
    </span>
    <p
      class="relative m-0 max-w-c-measure type-body text-pretty text-ink-muted"
      id="sub"
    >
      {@render wash("#sub")}
      <span class="relative"
        >Claude Code, OpenCode and pi sessions across every machine, on one
        board you host yourself.</span
      >
    </p>
    <figure class="relative m-0 mt-space-2 w-full" id="shot">
      {@render wash("#shot")}
      {@render pin("#shot", "start-space-4")}
      <div
        class="relative flex flex-col gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-xs"
      >
        {#each [["obelisk", "Fix tray chip overflow", "working"], ["outpost", "Ship the relay journey", "waiting on you"], ["obelisk", "Profile the board", "done"]] as [machine, title, state] (title)}
          <div
            class="flex flex-wrap items-center gap-x-space-2 rounded-sm bg-surface-recess px-space-2 py-space-1 type-meta"
          >
            <span
              class="size-(--status-dot-size) flex-none rounded-pill bg-status-done-glyph"
            ></span>
            <span class="min-w-0 wrap-anywhere text-ink-strong">{title}</span>
            <span class="ms-auto text-ink-muted">{machine} · {state}</span>
          </div>
        {/each}
      </div>
      <figcaption class="relative mt-space-1 type-meta text-ink-muted">
        Session list at 100%
      </figcaption>
    </figure>
    <p class="relative m-0 type-meta text-ink-muted" id="foot">
      {@render wash("#foot")}<span class="relative">Self-hosted. Free.</span>
    </p>
  </div>
</div>
