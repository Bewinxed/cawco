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
   * ends well, cross-fading in one cell) and the label, which beside a rest
   * icon cross-fades to `pendingLabel` and back in a cell as wide as the
   * wider of the two, all on one clock (--dur-morph, ease-out), so the
   * button keeps its width. A button with no rest icon keeps no slot: what
   * the slot shows stands over its label's start while the words fade out,
   * and its pending wording is its name alone, never drawn, so its label's
   * cell is the label's own and stands at the button's centre. The kit
   * Button draws it; a button in another skin (the
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
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { tickVariants } from "#lib/components/ui/checkbox/checkbox.svelte";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconTick } from "#lib/icons.js";

  let {
    label,
    icon: Icon,
    pending = false,
    pendingLabel,
    failed: failedFlag = false,
    reason = null,
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
    /**
     * Why the work just ended failed, said under the label (a menu item that
     * runs something: PendingSelect's `reason`). Implies `failed`.
     */
    reason?: string | null;
    /** The share of the work done (0 to 1): above 0, the ring in the spinner's place. */
    progress?: number;
    /** Drawn in the slot over its icon: what lands there. */
    arrivals?: Snippet;
  } = $props();

  const failed = $derived(failedFlag || Boolean(reason));

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
  /**
   * The label has a pending wording of its own. Beside a rest icon both
   * stand in one cell, so the button is as wide as the wider of them from
   * the start and never changes width as the work starts or ends, and they
   * cross-fade on one transition. With no rest icon the pending wording is
   * never drawn (DESIGN.md, Pending), so only a reader is given it: the
   * label's cell is the label's own.
   */
  const swapsLabel = $derived(
    pendingLabel !== undefined && pendingLabel !== label
  );

  /**
   * The ring stands in the slot: some of the work is done and it is still
   * running, or it ended failed and holds where it got to.
   */
  const ringShown = $derived(
    (progress ?? 0) > 0 && (phase === "pending" || (phase === "idle" && failed))
  );
  const share = $derived(Math.min(1, Math.max(0, progress ?? 0)));
  /**
   * A button with no rest icon has no slot of its own: the spinner, ring or
   * check stands over its label's start while the words fade, so the button
   * never changes width.
   */
  const covered = $derived(
    Icon === undefined && (phase !== "idle" || ringShown)
  );

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

<!-- The icon slot: its icon at rest, the spinner while its work runs, the
     check when it is done, cross-fading in one cell over --dur-morph, the
     clock its label crosses on. With no icon at rest it stays folded for
     good (no width and no gap) and draws what it shows over its label's
     start while the label fades, so its width never changes. -->
<span
  data-slot="btn-slot"
  class="icon-swap w-(--btn-icon) flex-none [--icon-swap-dur:var(--dur-morph)] data-over:-me-(--btn-gap) data-over:w-0 data-over:items-center data-over:justify-items-start"
  data-over={Icon === undefined || undefined}
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
        class="size-(--btn-icon)"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" opacity="0.25" r="9" stroke-width="2.5" />
        <circle
          class="origin-center -rotate-90 transform-view transition-[stroke-dasharray] dur-pop ease-out motion-reduce:transition-off"
          data-slot="ring-arc"
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
      data-slot="tick"
      class={[tickVariants({ clock: "morph" }), "size-(--btn-icon)"]}
      data-on={phase === "done"}
    /></span
  >
  {#if arrivals}
    <span aria-hidden="true" class="relative size-full pointer-events-none"
      >{@render arrivals()}</span
    >
  {/if}
</span>
{#if label === undefined}
  <!-- Icon only: nothing to morph. -->
{:else}
  <span
    class="has-data-reason:inline-flex has-data-reason:flex-col has-data-reason:items-box-start"
    ><span
      data-slot="label-text"
      class="transition-[opacity] dur-morph ease-out covered-true:opacity-0"
      data-covered={covered}
      >{#if swapsLabel && Icon === undefined}
        <!-- No rest icon: its pending wording is never drawn (the spinner
             stands over the label's start instead), so it never stands in
             the label's cell to widen it; a reader is still told it. -->
        <span aria-hidden={pending || undefined}
          ><MorphText text={label} /></span
        ><span class="sr-only" aria-hidden={!pending || undefined}
          >{pendingLabel}</span
        >
      {:else if swapsLabel}
        <!-- The wording that steps out goes soft (DESIGN.md, Buttons: Pending). -->
        <span class="inline-grid justify-items-start" data-slot="words"
          ><span
            aria-hidden={pending || undefined}
            class="col-start-1 row-start-1 transition-[opacity] dur-morph ease-out motion-safe:transition-morph-fade active-false:opacity-0 motion-safe:active-false:blur-(--c-btn-words-blur)"
            data-active={!pending}><MorphText text={label} /></span
          ><span
            aria-hidden={!pending || undefined}
            class="col-start-1 row-start-1 transition-[opacity] dur-morph ease-out motion-safe:transition-morph-fade active-false:opacity-0 motion-safe:active-false:blur-(--c-btn-words-blur)"
            data-active={pending}>{pendingLabel}</span
          ></span
        >
      {:else}
        <MorphText text={label} />
      {/if}</span
    >
    {#if reason}
      <span
        class="type-meta block max-w-c-measure-meta text-status-fail-ink whitespace-normal wrap-anywhere"
        data-reason
        role="alert"
        transition:unfold>{reason}</span
      >
    {/if}</span
  >
{/if}
