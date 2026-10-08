<script lang="ts" module>
  /**
   * While its work runs a pending button keeps its focus, so it is never
   * disabled: its press handler swallows the press instead, including a
   * form's implicit submit (the synthetic click is cancelled).
   */
  export function whileIdle<E extends Event>(
    pending: () => boolean,
    run: ((event: E) => void) | null | undefined
  ): (event: E) => void {
    return (event) => {
      if (pending()) {
        event.preventDefault();
        return;
      }
      run?.(event);
    };
  }
</script>

<script lang="ts">
  /**
   * What a button that runs something draws inside itself: the icon slot (its
   * icon at rest, the spinner while the work runs, a drawn check when it
   * ends well, cross-fading in one cell) and the label, which morphs to
   * `pendingLabel` and back through TextMorph while the width follows over
   * --dur-morph. The kit Button draws it; a button in another skin (the
   * new-session dialog, a workflow form) draws it in its own element, sets
   * --btn-gap and --btn-icon to its gap and icon size, and takes presses
   * through `whileIdle`. An icon-only button passes no `label`: only its
   * icon slot changes, and its name stays its aria-label.
   *
   * Work that counts (`progress`, the share done): once any of it is done the
   * spinner gives way to a ring, the spinner's own track with its arc wound
   * from the top to the share and easing to each new one over --dur-pop
   * (DESIGN.md, the TaskRing recipe). The arc starts where the spinner's was,
   * so the turning arc is seen to stop and fill. Whole, it gives way to the
   * check when the work ends well; ended failed, it holds where it got to.
   * `arrivals` is drawn in the slot over the ring: what lands in it (a
   * forget's session tiles, each flying in from its row).
   */
  import type { Component, Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconTick } from "#lib/icons.js";

  let {
    label,
    icon: Icon,
    pending = false,
    pendingLabel,
    failed = false,
    progress,
    arrivals,
  }: {
    label?: string;
    /** The icon in the slot at rest. */
    icon?: Component<SVGAttributes<SVGSVGElement>>;
    pending?: boolean;
    /** What the label says while pending ("Saving…"); unchanged if unset. */
    pendingLabel?: string;
    /** The work that just ended failed: no check. */
    failed?: boolean;
    /** The share of the work done (0 to 1): above 0, the ring in the spinner's place. */
    progress?: number;
    /** Drawn in the slot over its icon: what lands there. */
    arrivals?: Snippet;
  } = $props();

  /** The work ended well a moment ago: the check is up for --dur-hold. */
  let done = $state(false);
  let running = false;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const now = pending;
    if (now) {
      clearTimeout(doneTimer);
      done = false;
    } else if (running && !failed) {
      done = true;
      doneTimer = setTimeout(() => {
        done = false;
      }, dur("--dur-hold"));
    }
    running = now;
  });
  $effect(() => () => clearTimeout(doneTimer));

  const phase = $derived.by(() => {
    if (pending) {
      return "pending";
    }
    return done ? "done" : "idle";
  });
  const text = $derived(pending && pendingLabel ? pendingLabel : (label ?? ""));

  /**
   * The ring stands in the slot: some of the work is done and it is still
   * running, or it ended failed and holds where it got to.
   */
  const ringShown = $derived(
    (progress ?? 0) > 0 && (phase === "pending" || (phase === "idle" && failed))
  );
  const share = $derived(Math.min(1, Math.max(0, progress ?? 0)));

  let spinnerCell = $state<HTMLElement | null>(null);
  let arc = $state<SVGCircleElement | null>(null);
  /** Where the spinner's arc was when the ring took its place (degrees from 3 o'clock). */
  let handover: number | null = null;
  let ringWas = false;
  $effect.pre(() => {
    const now = ringShown;
    if (now && !ringWas && phase === "pending") {
      const turning = spinnerCell?.querySelector("svg")?.getAnimations()[0];
      const loop = Number(turning?.effect?.getComputedTiming().duration);
      handover =
        turning && loop > 0
          ? ((Number(turning.currentTime) % loop) / loop) * 360
          : null;
    }
    ringWas = now;
  });
  /**
   * The first fill runs from the spinner's arc: its angle and its quarter
   * length, wound round to the top as it eases to the share.
   */
  $effect(() => {
    if (!(ringShown && arc && handover !== null)) {
      return;
    }
    const from = handover;
    handover = null;
    if (!motionOk.current) {
      return;
    }
    let to = 270;
    while (to < from) {
      to += 360;
    }
    arc.animate(
      [
        { rotate: `${from}deg`, strokeDasharray: "25 100" },
        { rotate: `${to}deg`, strokeDasharray: `${share * 100} 100` },
      ],
      { duration: dur("--dur-pop"), easing: CURVE.out }
    );
  });
</script>

<span
  class="icon-swap kit-slot"
  data-shown={Icon !== undefined || phase !== "idle" || ringShown}
>
  {#if Icon}
    <span data-active={phase === "idle" && !ringShown}
      ><Icon class="size-(--btn-icon)" /></span
    >
  {/if}
  <span data-active={phase === "pending" && !ringShown} bind:this={spinnerCell}
    ><Spinner
      aria-hidden="true"
      class="size-(--btn-icon)"
      role="presentation"
    /></span
  >
  {#if progress !== undefined}
    <span data-active={ringShown}
      ><svg
        aria-hidden="true"
        class="kit-ring size-(--btn-icon)"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" opacity="0.25" r="9" stroke-width="2.5" />
        <circle
          class="kit-ring-arc"
          cx="12"
          cy="12"
          pathLength="100"
          r="9"
          stroke-dasharray="{share * 100} 100"
          stroke-linecap="round"
          stroke-width="2.5"
          bind:this={arc}
        />
      </svg></span
    >
  {/if}
  <span data-active={phase === "done"}
    ><IconTick
      class="kit-tick size-(--btn-icon)"
      data-on={phase === "done"}
    /></span
  >
  {#if arrivals}
    <span aria-hidden="true" class="kit-arrivals">{@render arrivals()}</span>
  {/if}
</span>

<style>
  /* Wound from the top, as a clock is read; each new share eases in. */
  .kit-ring-arc {
    transform-box: view-box;
    transform-origin: center;
    rotate: -90deg;
    transition: stroke-dasharray var(--dur-pop) var(--ease-out);
  }
  /* With less motion the arc lands at its share at once. */
  @media (prefers-reduced-motion: reduce) {
    .kit-ring-arc {
      transition: none;
    }
  }
  /* What lands in the slot stands over the ring, in the slot's own box. */
  .kit-arrivals {
    position: relative;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }
</style>
{#if label === undefined}
  <!-- Icon only: nothing to morph. -->
{:else}
  <span class="kit-label"><MorphText {text} /></span>
{/if}
