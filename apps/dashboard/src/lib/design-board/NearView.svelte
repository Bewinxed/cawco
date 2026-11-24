<script lang="ts">
  /**
   * A section of the board, live only while it stands on the screen or
   * within a screen of it (owner's pick, 2026-11-24, after a trace of the
   * board: every open floating layer on it re-measured and moved itself on
   * each scroll, about 100ms a scroll). It mounts once at first so the
   * board's height and its index's jumps are right, then lets its live
   * components go while it is far off, holding the height they took, and
   * mounts them again as it comes near.
   */
  import type { Snippet } from "svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";

  let { children }: { children: Snippet } = $props();

  let near = $state(true);
  let height = $state(0);

  /** The height its live components take, kept while they are let go. */
  const size = frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().height,
    (value) => {
      if (near) {
        height = value;
      }
    }
  );

  const watch = (node: HTMLElement) => {
    const sight = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          near = entry.isIntersecting;
        }
      },
      { rootMargin: "100% 0px" }
    );
    // After the first mount has been measured, not before.
    const start = requestAnimationFrame(() => sight.observe(node));
    return () => {
      cancelAnimationFrame(start);
      sight.disconnect();
    };
  };
</script>

<div
  {@attach watch}
  {@attach size}
  class="min-h-(--held)"
  style:--held={near ? undefined : `${height}px`}
>
  {#if near}
    {@render children()}
  {/if}
</div>
