<script lang="ts">
  /**
   * Spacing as it is used: real kit pieces, with every padding and gap the
   * browser lays out drawn over them and named by its step on the 4px scale.
   * The overlay measures the rendered layout; no value is written here.
   */
  import { type Snippet, untrack } from "svelte";
  import AlertFrame from "#lib/components/ui/alert/alert-frame.svelte";
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";
  import { IconInfo } from "#lib/icons.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import { type Band, bandsIn, onScale, stepOf } from "./spacing-bands.js";

  /** The pieces measured, in the order they stand. */
  const PIECES = ["A list of rows", "A notice"];

  /** Measures the piece's bands as it lays out, and again whenever it resizes. */
  const measure =
    (setBands: (bands: Band[]) => void) => (node: HTMLElement) => {
      const read = () => setBands(bandsIn(node));
      read();
      const sizes = frameObserver(read);
      sizes.observe(node);
      return () => sizes.disconnect();
    };

  let measured = $state.raw<Band[][]>(PIECES.map(() => []));
  // Written from the attachment, so the list it replaces is read untracked:
  // a read there would make the attachment re-run on its own write.
  const setFor = (index: number) => (bands: Band[]) => {
    measured = untrack(() => measured).with(index, bands);
  };
</script>

{#snippet piece(index: number, content: Snippet)}
  <figure class="flex min-w-0 flex-col gap-space-2">
    <figcaption class="text-ink-muted type-meta">{PIECES[index]}</figcaption>
    <div class="relative w-full max-w-sm" {@attach measure(setFor(index))}>
      {@render content()}
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        {#each measured[index] as band, at (at)}
          <span
            class={[
              "absolute start-(--band-x) top-(--band-y) grid h-(--band-h) w-(--band-w) place-items-center tabular-nums type-meta leading-none",
              onScale(band.px)
                ? "bg-status-live/16 text-status-live"
                : "bg-status-fail/28 text-status-fail outline outline-status-fail -outline-offset-1",
            ]}
            style:--band-x="{band.x}px"
            style:--band-y="{band.y}px"
            style:--band-w="{band.w}px"
            style:--band-h="{band.h}px"
          >
            {#if Math.max(band.w, band.h) >= 12 && Math.min(band.w, band.h) >= 8}
              {stepOf(band.px)}
            {/if}
          </span>
        {/each}
      </div>
    </div>
  </figure>
{/snippet}

{#snippet rows()}
  <RowFrame withBelow />
{/snippet}

{#snippet notice()}
  <AlertFrame
    icon={IconInfo}
    title="Sessions on obelisk pause while it updates"
    line="The daemon restarts in about a minute; nothing running is lost."
    action="Restart now"
  />
{/snippet}

<div class="grid gap-space-6 @phone:grid-cols-2">
  {@render piece(0, rows)}
  {@render piece(1, notice)}
</div>
