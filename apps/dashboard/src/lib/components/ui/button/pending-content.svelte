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
   * wider of the two, each centred in it, the slot beside the one drawn,
   * all on one clock (--duration-base, ease-out), so the button keeps its width
   * and its inset is even at both ends in every state. A button with no rest icon keeps no slot: what
   * the slot shows stands over its label's start while the words fade out,
   * and its pending wording is its name alone, never drawn, so its label's
   * cell is the label's own and stands at the button's centre. The kit
   * Button draws it; a button in another skin (the
   * new-session dialog) draws it in its own element, sets
   * --btn-gap and --btn-icon to its gap and icon size, and takes presses
   * through `whileIdle`. An icon-only button passes no `label`: only its
   * icon slot changes, and its name stays its aria-label.
   *
   * Work that counts (`progress`, the share done): once any of it is done the
   * spinner gives way to a ring, the spinner's own track with its arc wound
   * from the top to the share and easing to each new one over --duration-slow
   * (DESIGN.md, the TaskRing recipe). The arc starts where the spinner's was,
   * so the turning arc is seen to stop and fill. Whole, it gives way to the
   * check when the work ends well; ended failed, it holds where it got to.
   * `arrivals` is drawn in the slot over the ring: what lands in it (a
   * forget's session tiles, each flying in from its row).
   */
  import type { Component, Snippet } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { tickVariants } from "#lib/components/ui/checkbox/checkbox.svelte";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconClose, IconTick } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import {
    CURVE,
    crossIn,
    dur,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { glyphIn, glyphOut } from "#lib/platform/motion/glyph.js";

  let {
    label,
    icon: Icon,
    pending = false,
    pendingLabel,
    failed: failedFlag = false,
    reason = null,
    progress,
    arrivals,
    words = [],
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
    /**
     * Every wording the label takes in the run (Button `words`): each
     * stands unseen in the label's cell, so the cell is as wide as the
     * widest of them and the button never changes width as its words do.
     */
    words?: readonly string[];
  } = $props();

  const failed = $derived(failedFlag || Boolean(reason));

  /**
   * How the work that just ended went, held for --duration-loop: a drawn
   * check when it went well, a cross when it failed (unless the ring holds
   * where it got to), then the slot's icon again.
   */
  /**
   * Derived as the work ends, in the same pass that sees `pending` turn
   * false: set from an effect instead, the slot drew its rest icon for one
   * pass in between and swapped a glyph in and straight out again.
   */
  let running = false;
  let ended = $derived.by<"done" | "failed" | null>(() => {
    if (pending) {
      running = true;
      return null;
    }
    if (!running) {
      return null;
    }
    running = false;
    return failed ? "failed" : "done";
  });
  $effect(() => {
    if (ended === null) {
      return;
    }
    const held = setTimeout(() => {
      ended = null;
    }, dur("--duration-loop"));
    return () => clearTimeout(held);
  });

  const phase = $derived.by(() => {
    if (pending) {
      return "pending";
    }
    return ended ?? "idle";
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
  /** It asks before it acts, in words of its own while armed. */
  const asks = $derived(confirm !== undefined && confirm !== label);
  /**
   * The wordings that share the label's cell, each centred in it and the
   * cell as wide as the widest, so the button never changes width as one
   * gives way to another: its own, its pending one beside a rest icon (with
   * none, the spinner stands over its words instead), and its armed one.
   */
  const wordings = $derived([
    { key: "rest", text: label ?? "" },
    ...(swapsLabel && Icon
      ? [{ key: "pending", text: pendingLabel ?? "" }]
      : []),
    ...(asks ? [{ key: "armed", text: confirm ?? "" }] : []),
  ]);
  const drawnText = $derived(
    wordings.find((one) => one.key === drawn)?.text ?? label ?? ""
  );
  /** A wording's swap: a fade on the slot's clock, opacity only. */
  const words = (_node: Element) => ({
    duration: dur("--duration-slow"),
    easing: easeInOut,
    css: (t: number) => `opacity: ${t}`,
  });
  const drawn = $derived.by(() => {
    if (pending && swapsLabel && Icon) {
      return "pending";
    }
    return armed && asks && !pending ? "armed" : "rest";
  });

  /**
   * Beside a rest icon both wordings stand centred in their one cell, as
   * wide as the wider; the slot stands beside the one drawn, half the
   * cell's slack in from its start, so the icon and the words drawn sit
   * centred in the button with one inset at both ends, at rest and while
   * pending. The slot crosses on the label's clock (--duration-base, ease-out).
   */
  let restWidth = $state(0);
  let pendingWidth = $state(0);
  /** The label's cell: the widest of its wordings, `words` among them. */
  let cellWidth = $state(0);
  const measureCell = frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().width,
    (value) => {
      cellWidth = value;
    }
  );
  const measureRest = frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().width,
    (value) => {
      restWidth = value;
    }
  );
  const measurePending = frameSize(
    (node: HTMLElement) => node.getBoundingClientRect().width,
    (value) => {
      pendingWidth = value;
    }
  );
  const slack = $derived(
    (Math.max(cellWidth, restWidth, pendingWidth) -
      (pending && swapsLabel ? pendingWidth : restWidth)) /
      2
  );
  /** The cell holds more than the wording drawn: the slot stands beside that one. */
  const holds = $derived(swapsLabel || words.length > 0);
  /**
   * The slot moves only once both wordings were measured: the first
   * measure places it, it does not slide there as the button mounts.
   */
  let placed = $state(false);
  $effect(() => {
    if (placed || restWidth === 0 || (swapsLabel && pendingWidth === 0)) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      placed = true;
    });
    return () => cancelAnimationFrame(frame);
  });

  /**
   * The ring stands in the slot: some of the work is done and it is still
   * running, or it ended failed and holds where it got to.
   */
  const ringShown = $derived(
    (progress ?? 0) > 0 && (phase === "pending" || (phase !== "done" && failed))
  );
  const share = $derived(Math.min(1, Math.max(0, progress ?? 0)));
  /**
   * A button with no rest icon has no slot of its own: the spinner, ring or
   * check stands over its label's start while the words fade, so the button
   * never changes width.
   */
  const covered = $derived(
    Icon === undefined && !holdsIcon && (phase !== "idle" || ringShown)
  );
  /** A held slot with nothing in it: the words slide over its room. */
  const roomEmpty = $derived(
    holdsIcon && Icon === undefined && phase === "idle" && !ringShown
  );
  /**
   * What the slot shows: one glyph at a time, keyed, so Svelte's own
   * transitions swap it (`glyphIn`/`glyphOut`, the house's glyph swap).
   * The outgoing glyph stays in the DOM until its outro ends, so the slot
   * stacks every child in one grid cell (`icon-swap`): the leaving and the
   * arriving glyph share the cell and nothing beside them moves.
   */
  const shows = $derived.by(() => {
    if (ringShown) {
      return "ring";
    }
    if (phase !== "idle") {
      return phase === "pending" ? "spinner" : phase;
    }
    return Icon === undefined ? "none" : "icon";
  });

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
      { duration: dur("--duration-slow"), easing: CURVE.out }
    );
  });
</script>

<!-- Each wording of the run, unseen in the label's cell: it is as wide as
     the widest. -->
{#snippet held()}
  {#each new Set(words) as word (word)}
    <span aria-hidden="true" class="invisible col-start-1 row-start-1"
      >{word}</span
    >
  {/each}
{/snippet}

<!-- The icon slot: its icon at rest, the spinner while its work runs, the
     check or the cross when it ends, each swapped by Svelte's transitions in
     one grid cell. With no icon at rest it stays folded for good (no width
     and no gap) and draws what it shows over its label's start while the
     label fades, so its width never changes. -->
<span
  style:--btn-words-slack={holds && Icon ? `${slack}px` : undefined}
  data-slot="btn-slot"
  class="icon-swap w-(--btn-icon) flex-none translate-x-(--btn-words-slack,0) rtl:-translate-x-(--btn-words-slack,0) duration-(--duration-slow) ease-in-out data-placed:transition-[translate] motion-reduce:transition-off data-over:-me-(--btn-gap) data-over:w-0 data-over:items-center data-over:justify-items-start"
  data-over={(Icon === undefined && !holdsIcon) || undefined}
  data-placed={placed || undefined}
>
  <!-- The key block is the span's own block, so its local transitions play
       on each swap (Svelte's transitions are local: they do not play when
       a parent block mounts), and an empty slot is an empty span that
       still fades the last glyph out. -->
  {#key shows}
    <span in:glyphIn out:glyphOut>
      {#if shows === "icon" && Icon}
        <Icon class="size-(--btn-icon)" />
      {:else if shows === "spinner"}
        <span class="contents" bind:this={spinnerCell}
          ><Spinner
            aria-hidden="true"
            class="size-(--btn-icon)"
            role="presentation"
          /></span
        >
      {:else if shows === "ring"}
        <svg
          aria-hidden="true"
          class="size-(--btn-icon)"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" opacity="0.25" r="9" stroke-width="2.5" />
          <circle
            class="origin-center -rotate-90 transform-view transition-[stroke-dasharray] duration-(--duration-slow) ease-out motion-reduce:transition-off"
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
        </svg>
      {:else if shows === "done"}
        <!-- Mounted drawn: @starting-style starts its stroke undrawn, so it draws in. -->
        <IconTick
          data-slot="tick"
          class={[
            tickVariants({ clock: "morph" }),
            "size-(--btn-icon) motion-safe:starting:[&_path]:[stroke-dashoffset:22]",
          ]}
          data-on="true"
        />
      {:else if shows === "failed"}
        <IconClose class="size-(--btn-icon) text-red" data-slot="cross" />
      {/if}
    </span>
  {/key}
  {#if arrivals}
    <span aria-hidden="true" class="relative size-full pointer-events-none"
      >{@render arrivals()}</span
    >
  {/if}
</span>
{#if label === undefined}
  <!-- Icon only: nothing to morph. -->
{:else}
  <!-- The run the mark line trims: a block, the reason a block under the
       label, so the trim reaches its first and last lines (text-box-trim
       reaches no flex or grid container, which kept its whole line and the
       recipe's padding on top: a refused menu item stood 10px tall). -->
  <span
    class="transition-[translate] duration-(--duration-slow) ease-in-out motion-reduce:transition-off data-room-empty:-translate-x-[calc((var(--btn-icon)+var(--btn-gap))/2)] rtl:data-room-empty:translate-x-[calc((var(--btn-icon)+var(--btn-gap))/2)]"
    data-room-empty={roomEmpty || undefined}
    ><span
      data-slot="label-text"
      class="transition-[opacity] duration-(--duration-base) ease-out covered-true:opacity-0"
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
        <!-- The wording that steps out fades as the other fades in, in one cell (DESIGN.md, Buttons: Pending). -->
        <span
          {@attach measureCell}
          class="inline-grid justify-items-center"
          data-slot="words"
          >{@render held()}<span
            {@attach measureRest}
            aria-hidden={pending || undefined}
            class="col-start-1 row-start-1 transition-[opacity] duration-(--duration-morph) ease-out active-false:opacity-0"
            data-active={!pending}
            ><!-- Re-made as it is covered and uncovered: a label changed
                 under the pending wording ("Stop 3 and turn off" to "Caw is
                 off") cross-fades in with it, never retyping as it shows. -->{#key pending}<MorphText
                text={label}
              />{/key}</span
          ><!-- Its figures one width (num): a count winding down ("Stopping
               3…", "Stopping 2…") keeps its width, so the slot beside it
               stays put. --><span
            {@attach measurePending}
            aria-hidden={!pending || undefined}
            class="num col-start-1 row-start-1 transition-[opacity] duration-(--duration-morph) ease-out active-false:opacity-0"
            data-active={pending}>{pendingLabel}</span
          ></span
        >
      {:else if words.length > 0}
        <!-- Its words change in a cell as wide as the widest it takes,
             the new over the old where they stand (crossIn), centred in
             it: morphed, the text's box took the wider words' size at once
             and the old letters jumped half the difference. -->
        <span
          {@attach measureCell}
          class="inline-grid justify-items-center"
          data-slot="words"
          >{@render held()}{#key label}<span
              {@attach measureRest}
              class="col-start-1 row-start-1"
              in:crossIn
              out:crossIn>{label}</span
            >{/key}</span
        >
      {:else}
        <MorphText text={label} />
      {/if}{#if swapsLabel && Icon === undefined}
        <!-- No rest icon: its pending wording is never drawn (the spinner
             stands over the label's start instead), so it never stands in
             the label's cell to widen it; a reader is still told it. -->
        <span class="sr-only" aria-hidden={!pending || undefined}
          >{pendingLabel}</span
        >
      {/if}</span
    >
    {#if reason}
      <span
        class="type-meta block max-w-ch-32 text-red whitespace-normal wrap-anywhere"
        data-reason
        role="alert"
        transition:unfold>{reason}</span
      >
    {/if}</span
  >
{/if}
