<script lang="ts">
  /**
   * A component's frames as a browser last drew them, in miniature (core
   * `DesignThumb`, from the stage's kept reports): each frame's box where it
   * stood on its canvas, drawn by its state. Drawn on the raised surface,
   * empty with a dashed edge, failed in the fail status, not seen since its
   * file changed on the skeleton's fill. Nothing drawn yet says so.
   */
  import type { DesignThumb } from "@cawco/core/stage";

  let { name, thumb }: { name: string; thumb: DesignThumb | null } = $props();
  const counts = $derived.by(() => {
    const by = { drawn: 0, empty: 0, failed: 0, unseen: 0 };
    for (const frame of thumb?.frames ?? []) {
      by[frame.state] += 1;
    }
    return by;
  });
  /** Its frames in words, for the reader who can't see them. */
  const said = $derived(
    [
      `${counts.drawn} drawn`,
      counts.failed ? `${counts.failed} failed` : "",
      counts.empty ? `${counts.empty} empty` : "",
      counts.unseen ? `${counts.unseen} not seen since a change` : "",
    ]
      .filter(Boolean)
      .join(", ")
  );
</script>

{#if thumb}
  <svg
    data-slot="map-thumb"
    aria-label={`${name}'s frames as last drawn: ${said}`}
    class="thumb"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    viewBox={`0 0 ${thumb.w} ${thumb.h}`}
  >
    {#each thumb.frames as frame, at (at)}
      <rect
        data-state={frame.state}
        height={frame.h}
        rx="8"
        width={frame.w}
        x={frame.x}
        y={frame.y}
      />
    {/each}
  </svg>
{:else}
  <p data-slot="map-thumb" class="none">Not drawn yet</p>
{/if}

<style>
  .thumb {
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }
  rect {
    fill: var(--surface-raised);
    stroke: var(--border-control);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  rect[data-state="empty"] {
    fill: none;
    stroke-dasharray: 3 3;
  }
  rect[data-state="failed"] {
    fill: var(--status-fail-bg);
    stroke: var(--status-fail-glyph);
  }
  rect[data-state="unseen"] {
    fill: var(--surface-fill);
    stroke: none;
  }
  .none {
    display: grid;
    place-items: center;
    block-size: 100%;
    margin: 0;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
</style>
