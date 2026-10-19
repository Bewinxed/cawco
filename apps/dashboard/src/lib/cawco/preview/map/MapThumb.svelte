<script lang="ts">
  /**
   * A component's frames as a browser last drew them, in miniature (core
   * `DesignThumb`, from the stage's kept reports): each frame's box where it
   * stood on its canvas, drawn by its state. Drawn on the raised surface,
   * empty with a dashed edge, failed in the fail status, not seen since its
   * file changed or not shown at its page's width on the skeleton's fill.
   * Nothing drawn yet says so.
   */
  import type { DesignThumb } from "@cawco/core/stage";

  let { name, thumb }: { name: string; thumb: DesignThumb | null } = $props();
  const counts = $derived.by(() => {
    const by = { drawn: 0, empty: 0, failed: 0, unseen: 0, unshown: 0 };
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
      counts.unshown ? `${counts.unshown} not shown at its width` : "",
    ]
      .filter(Boolean)
      .join(", ")
  );
</script>

{#if thumb}
  <svg
    data-slot="map-thumb"
    aria-label={`${name}'s frames as last drawn: ${said}`}
    class="block size-full p-space-2"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    viewBox={`0 0 ${thumb.w} ${thumb.h}`}
  >
    {#each thumb.frames as frame, at (at)}
      <rect
        data-state={frame.state}
        class="fill-surface-raised stroke-border-control stroke-1 state-empty:fill-none state-failed:fill-status-fail-bg state-failed:stroke-status-fail-glyph state-unseen:fill-surface-fill state-unseen:stroke-none state-unshown:fill-surface-fill state-unshown:stroke-none"
        height={frame.h}
        rx="8"
        stroke-dasharray={frame.state === "empty" ? "3 3" : undefined}
        vector-effect="non-scaling-stroke"
        width={frame.w}
        x={frame.x}
        y={frame.y}
      />
    {/each}
  </svg>
{:else}
  <p
    data-slot="map-thumb"
    class="grid place-items-center h-full m-0 p-space-2 text-ink-muted type-meta"
  >
    Not drawn yet
  </p>
{/if}
