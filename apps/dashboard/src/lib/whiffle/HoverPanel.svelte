<script lang="ts">
  /**
   * The house hover panel: the delegate tray's chip panel, and the rail's
   * session card. One surface for whichever thing the pointer rests on; when
   * it moves to the next one the panel glides there (translate on
   * --dur-morph, --ease-drawer) and takes the new content's size (morph)
   * while the content cross-fades, rather than closing and opening again.
   * It comes in with a 4px rise from .98 and leaves as a fade.
   *
   * `watch` is the session whose live tail the content draws: watched while
   * the panel shows it, and for 2s after, so a pointer that wanders off and
   * back does not drop the stream and fetch it again.
   *
   * Where it stands is the caller's: `above` a row of chips (`--x` along
   * the row, clamped to `--span`, growing from `--origin`), or to the
   * `right` of a list at `--x`/`--y` in the viewport. Either way a 4px
   * bridge on the side facing the trigger keeps the pointer over the panel
   * as it crosses the gap.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import type { TransitionConfig } from "svelte/transition";
  import {
    preloadHistory,
    unwatchDelegate,
    watchDelegate,
    whiffle,
  } from "./client.svelte";
  import { dur, easeOut, motionOk } from "./motion/curves.svelte";
  import { morph } from "./motion/morph.svelte";

  let {
    key,
    watch = null,
    gliding = false,
    side,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    /** What the panel shows; null closes it. A new key cross-fades. */
    key: string | null;
    /** The session whose live tail the content draws. */
    watch?: string | null;
    /** Moving from one trigger to the next: the panel travels. */
    gliding?: boolean;
    side: "above" | "right";
    children: Snippet<[string]>;
  } = $props();

  const releases = new Map<string, ReturnType<typeof setTimeout>>();
  $effect(() => {
    const id = watch;
    if (!id) {
      return;
    }
    untrack(() => {
      const release = releases.get(id);
      if (release) {
        clearTimeout(release);
        releases.delete(id);
        return;
      }
      watchDelegate(id);
      if (!whiffle.session(id)?.messages.length) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget; the tail draws whatever has arrived.
        void preloadHistory(id);
      }
    });
    return () => {
      releases.set(
        id,
        setTimeout(() => {
          releases.delete(id);
          unwatchDelegate(id);
        }, 2000)
      );
    };
  });

  function panelIn(_node: Element): TransitionConfig {
    if (!motionOk.current) {
      return { duration: dur("--dur-menu"), css: (t) => `opacity: ${t}` };
    }
    const lift = side === "above" ? "translateY" : "translateX";
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t, u) =>
        `opacity: ${t}; transform: ${lift}(${(u * (side === "above" ? 4 : -4)).toFixed(2)}px) scale(${(0.98 + 0.02 * t).toFixed(4)})`,
    };
  }
  function panelOut(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /** The content, when the panel moves to another trigger: the new one fades in. */
  function swapIn(_node: Element): TransitionConfig {
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /**
   * The old content fades out of the flow, so the panel's size tweens once,
   * straight to the new content's (morph), under both.
   */
  function swapOut(node: HTMLElement): TransitionConfig {
    node.style.position = "absolute";
    node.style.inset = "var(--space-3) var(--space-3) auto";
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t) => `opacity: ${t}`,
    };
  }
</script>

{#if key}
  <div
    {...rest}
    class="panel {side}"
    class:gliding
    in:panelIn
    out:panelOut
    {@attach morph({ width: true })}
  >
    <div class="cell">
      {#key key}
        <div class="pbody" in:swapIn out:swapOut>{@render children(key)}</div>
      {/key}
    </div>
  </div>
{/if}

<style>
  .panel {
    z-index: 2;
    inline-size: max-content;
    pointer-events: auto;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);

    /* The 4px between the panel and its trigger, so the pointer crossing
       it is still over the panel. */
    &::after {
      content: "";
      position: absolute;
    }
  }
  /* Over a row of chips: at its chip, pulled back inside the row's end. */
  .panel.above {
    position: absolute;
    inset-block-end: calc(100% + 4px);
    inset-inline-start: 0;
    translate: max(0px, min(var(--x), calc(var(--span) - 100%))) 0;
    transform-origin: var(--origin) 100%;

    &::after {
      inset-inline: 0;
      inset-block-start: 100%;
      block-size: 4px;
    }
  }
  /* Beside a list: level with its row, in the viewport. */
  .panel.right {
    position: fixed;
    inset-block-start: 0;
    inset-inline-start: var(--x);
    translate: 0 var(--y);
    transform-origin: 0 var(--origin);
    z-index: 40;

    &::after {
      inset-block: 0;
      inset-inline-end: 100%;
      inline-size: 4px;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .panel.gliding {
      transition: translate var(--dur-morph) var(--ease-drawer);
    }
  }
  /* The content's own width, capped at 440px or the room (less the
     border): never the panel's, so the panel's size tween (morph, which
     watches this box) does not resize what it is watching. */
  .cell {
    position: relative;
    display: grid;
    inline-size: max-content;
    max-inline-size: calc(min(440px, var(--span, 440px)) - 2px);
    max-block-size: var(--room, 320px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3);

    & > .pbody {
      grid-area: 1 / 1;
      min-inline-size: 0;
    }
  }
</style>
