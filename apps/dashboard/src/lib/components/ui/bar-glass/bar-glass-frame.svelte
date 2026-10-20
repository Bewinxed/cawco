<script lang="ts">
  /**
   * BarGlass in a frame of its own (its states file's): a `shell` container
   * of the width asked for, the bar's trailing edge in it, and stand-ins for
   * what the bar hands the glass, so no store is read. The head is a circle
   * in an item's box where Caw's head stands; Jump's glyph is the one
   * control, gone on the phone as the bar's is.
   */
  import { IconSearch, IconServer } from "#lib/icons.js";
  import BarGlass from "./bar-glass.svelte";

  let {
    width,
    joined = false,
    instant = false,
  }: {
    /** The frame's width, px: the shell container's. */
    width: number;
    joined?: boolean;
    instant?: boolean;
  } = $props();
</script>

<div
  class="@container/shell w-(--frame-w) bg-surface-recess pbe-space-8"
  style:--frame-w={`${width}px`}
>
  <div
    class="flex h-c-top-bar-h items-center bg-surface-raised border-b border-b-seam pe-space-6 @max-desk/shell:pe-0"
  >
    <div class="ms-auto flex min-w-0 items-center @max-desk/shell:self-stretch">
      <BarGlass {instant} {joined}>
        {#snippet head()}
          <button
            data-bar-item
            aria-label="Caw"
            class="touch-hit press-tint"
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
          class="touch-hit press-tint @max-desk/shell:hidden"
          type="button"
        >
          <IconSearch aria-hidden="true" class="size-icon-md text-ink-muted" />
        </button>
        <button
          data-bar-item
          aria-label="Machines"
          class="touch-hit press-tint @max-desk/shell:hidden"
          type="button"
        >
          <IconServer data-slot="bar-symbol" aria-hidden="true" />
        </button>
      </BarGlass>
    </div>
  </div>
</div>
