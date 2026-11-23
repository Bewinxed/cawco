<script lang="ts">
  /**
   * Spacing as it is used: real kit pieces, each with thin dimension lines on
   * the few spaces that set its rhythm, measured off the layout. Measuring
   * any part is the design graph's own guides'; these only point the rhythm out.
   */
  import { type Snippet, untrack } from "svelte";
  import AlertFrame from "#lib/components/ui/alert/alert-frame.svelte";
  import RowFrame from "#lib/components/ui/row/row-frame.svelte";
  import { IconInfo } from "#lib/icons.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import { across, type Band, keySpacesIn } from "./spacing-bands.js";

  /** The pieces measured, in the order they stand. */
  const PIECES = ["A list of rows", "A notice"];

  /** Measures the piece's bands as it lays out, and again whenever it resizes. */
  const measure =
    (setBands: (bands: Band[]) => void) => (node: HTMLElement) => {
      const read = () => setBands(keySpacesIn(node));
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
              "absolute start-(--band-x) top-(--band-y) grid h-(--band-h) w-(--band-w) place-items-center text-accent-ink",
              across(band)
                ? "before:h-space-2 before:w-full before:border-x before:border-accent after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-accent"
                : "before:h-full before:w-space-2 before:border-y before:border-accent after:absolute after:inset-y-0 after:start-1/2 after:border-s after:border-accent",
            ]}
            style:--band-x="{band.x}px"
            style:--band-y="{band.y}px"
            style:--band-w="{band.w}px"
            style:--band-h="{band.h}px"
          >
            <span
              class={[
                "absolute tabular-nums type-meta",
                across(band) ? "-top-space-4" : "start-full ps-space-1",
              ]}>{band.px}</span
            >
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
