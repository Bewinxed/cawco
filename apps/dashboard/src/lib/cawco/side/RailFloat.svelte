<script lang="ts">
  /**
   * What stands beside a side card's page as a floating glass panel (the
   * owner's pick "Beside the page" on the artifact panel's decision page):
   * under the head's room, inset from the card's edges, its corners the
   * card's own (`c-float-panel-r`), so the capsules of its bar stand
   * concentric in them. The page stops short of it (SideSurface's well
   * takes `c-rail-float-room` at its end while it stands) and the card's
   * ground runs on beneath the glass (Adopting Liquid Glass: content
   * "beneath sidebars and inspectors" without "placing content under it").
   *
   * It comes in from the card's end over `--dur-panel` on `--ease-drawer`
   * and goes over `--dur-exit`; with less motion it fades.
   */
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import {
    dur,
    easeDrawer,
    easeOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";

  let { children }: { children: Snippet } = $props();

  /** In from the card's end (its width away), or a fade without motion. */
  function enter(node: HTMLElement): TransitionConfig {
    const away = node.offsetWidth;
    return motionOk.current
      ? {
          duration: dur("--dur-panel"),
          easing: easeDrawer,
          css: (t: number) =>
            `translate: ${(1 - t) * away}px 0; opacity: ${Math.min(1, t * 2)}`,
        }
      : { duration: dur("--dur-fade"), css: (t: number) => `opacity: ${t}` };
  }
  /** Back out to the card's end, or a fade without motion. */
  function leave(node: HTMLElement): TransitionConfig {
    const away = node.offsetWidth;
    return motionOk.current
      ? {
          duration: dur("--dur-exit"),
          easing: easeOut,
          css: (t: number) => `translate: ${(1 - t) * away}px 0; opacity: ${t}`,
        }
      : { duration: dur("--dur-exit"), css: (t: number) => `opacity: ${t}` };
  }
</script>

<div
  class="absolute end-space-2 top-(--side-room) bottom-space-2 z-1 flex min-h-0 overflow-hidden rounded-(--c-float-panel-r) border border-border-hairline bg-material-panel shadow-overlay glass-backdrop reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none"
  data-rail-float="beside"
  in:enter
  out:leave
>
  {@render children()}
</div>
