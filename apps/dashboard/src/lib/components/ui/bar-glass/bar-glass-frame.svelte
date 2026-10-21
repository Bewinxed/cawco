<script lang="ts">
  /**
   * BarGlass in a frame of its own (its states file's): a `shell` container
   * of the width asked for, the bar's trailing edge in it, and stand-ins for
   * what the bar hands the glass, so no store is read. The head is a circle
   * in an item's box where Caw's head stands; Jump's glyph is the one
   * control, gone on the phone as the bar's is.
   *
   * What hangs from the glass (`children`, HangCard's frame) stands in the
   * same shell, drawn in place: the shell is its fixed place's box
   * (`contain: layout`, which a container has already, said so floating-ui
   * places the card in it), as tall as `height` asks.
   */
  import type { Snippet } from "svelte";
  import { IconSearch, IconServer } from "#lib/icons.js";
  import BarGlass from "./bar-glass.svelte";

  let {
    width,
    height,
    joined = false,
    instant = false,
    shell = $bindable(null),
    children,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    /** The frame's least height, px: room for what hangs from the glass. */
    height?: number;
    joined?: boolean;
    instant?: boolean;
    /** The shell container. */
    shell?: HTMLElement | null;
    /** What hangs from the glass, in the shell. */
    children?: Snippet;
  } = $props();
</script>

<div
  bind:this={shell}
  class="@container/shell contain-layout w-(--frame-w) min-h-(--frame-h) bg-surface-recess pbe-space-8"
  style:--frame-h={height === undefined ? undefined : `${height}px`}
  style:--frame-w={`${width}px`}
>
  <div
    class="flex h-c-top-bar-h items-center bg-surface-raised border-b border-b-border-hairline pe-space-6 @max-desk/shell:pe-0"
  >
    <div class="ms-auto flex min-w-0 items-center @max-desk/shell:self-stretch">
      <BarGlass {instant} {joined}>
        {#snippet head()}
          <button
            data-bar-item
            aria-label="Caw"
            class="select-none touch-hit press-tint"
            type="button"
          >
            <span
              data-slot="bar-symbol"
              aria-hidden="true"
              class="block rounded-pill bg-ink-muted"
            ></span>
          </button>
        {/snippet}
        <button
          data-bar-item
          aria-label="Jump to session"
          class="select-none touch-hit press-tint @max-desk/shell:hidden"
          type="button"
        >
          <IconSearch aria-hidden="true" class="size-icon-md text-ink-muted" />
        </button>
        <button
          data-bar-item
          aria-label="Machines"
          class="select-none touch-hit press-tint @max-desk/shell:hidden"
          type="button"
        >
          <IconServer data-slot="bar-symbol" aria-hidden="true" />
        </button>
      </BarGlass>
    </div>
  </div>
  {@render children?.()}
</div>
