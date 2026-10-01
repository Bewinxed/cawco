<script lang="ts">
  /** One session's state, in the one glance the fleet view is built around. */
  import { IconMoonSleep } from "$lib/icons";
  import {
    ACTIVITY_LABEL,
    type Activity,
    FAILED_LABEL,
    SLEEPING_LABEL,
    UNKNOWN_LABEL,
  } from "./activity";
  import { dur, easeOut, motionOk, popScale } from "./motion/curves.svelte";

  interface Props {
    activity: Activity;
    /**
     * The session's process exited badly (`isFailed`). Wins over every other
     * state — a failed run is not idle, asleep, or unreachable. Red and still:
     * nothing about it is going to change on its own, so nothing about it
     * moves.
     */
    failed?: boolean;
    /** `1.5` for the sidebar's denser rows, `2.5` where the dot is a row's
     *  only status and wants the extra presence. */
    size?: 1.5 | 2 | 2.5;
    /**
     * The session's process is gone but its conversation is not — its own
     * glyph rather than a colour, since `idle` already owns the fleet's one
     * neutral dot (leaf Y1: this used to be a second, word-based vocabulary
     * — a "Sleeping" pill — living beside this one). Wins over `activity`.
     */
    sleeping?: boolean;
    /**
     * The hub can't currently reach this row's machine — hollow, not filled:
     * there is no fact here to tint, only the admission that one is missing,
     * same recipe as the Quiet Ledger's outline pill. Wins over `activity`
     * and `sleeping`.
     */
    stale?: boolean;
  }

  let {
    activity,
    size = 2,
    sleeping = false,
    stale = false,
    failed = false,
  }: Props = $props();

  const SIZE_CLASS: Record<string, string> = {
    "1.5": "size-1.5",
    "2": "size-2",
    "2.5": "size-2.5",
  };

  /* The Quiet Ledger status hues: blue-live is a session mid-turn, amber-attn is
     one parked on a human, and a session at rest carries a quiet neutral — idle
     is the absence of a signal, not a colour of its own. */
  const tone = $derived(
    {
      blocked: "bg-[var(--status-attn-glyph)]",
      working: "bg-[var(--status-live-glyph)]",
      idle: "bg-muted-foreground/40",
    }[activity]
  );

  /**
   * One glyph handing its place to the next (failed, unknown, asleep, a dot):
   * the new one fades in over --dur-control as it settles from --pop-scale,
   * the old one fades out in the same cell. With reduced motion, only the
   * fade.
   */
  function swap(_node: Element) {
    const grow = motionOk.current;
    const from = grow ? popScale() : 1;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) =>
        grow
          ? `opacity: ${t}; scale: ${from + (1 - from) * t}`
          : `opacity: ${t}`,
    };
  }

  const label = $derived.by(() => {
    if (failed) {
      return FAILED_LABEL;
    }
    if (stale) {
      return UNKNOWN_LABEL;
    }
    if (sleeping) {
      return SLEEPING_LABEL;
    }
    return ACTIVITY_LABEL[activity];
  });
</script>

<span
  aria-label={label}
  class="relative inline-flex shrink-0 items-center justify-center {SIZE_CLASS[
    String(size)
  ]}"
  role="img"
  title={label}
>
  {#if failed}
    <!-- Red and still, as every state is: nothing here loops; a change
         cross-fades once (swap) and holds. -->
    <span
      class="absolute inset-0 rounded-full bg-[var(--status-fail-glyph)]"
      transition:swap
    ></span>
  {:else if stale}
    <!-- Hollow, not filled: distinguishable from every filled state by shape
         alone, not only by colour — the honest rendering of "the hub does
         not know", never flattened into idle's quiet fill. -->
    <span
      class="absolute inset-0 rounded-full border border-muted-foreground/60"
      transition:swap
    ></span>
  {:else if sleeping}
    <!-- A glyph, not a tint: distinguishable from idle's plain dot by shape
         even with colour vision switched off, and named for what it means —
         resumable, not merely quiet. -->
    <span class="absolute inset-0" transition:swap>
      <IconMoonSleep
        class="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/70"
      />
    </span>
  {:else}
    <!-- One dot for every activity: its colour moves between them. -->
    <span
      class="tone absolute inset-0 rounded-full {tone}"
      transition:swap
    ></span>
  {/if}
</span>

<style>
  .tone {
    transition: background-color var(--dur-panel) var(--ease-out);
  }
</style>
