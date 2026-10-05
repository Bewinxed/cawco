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
   */
  import { type Component, untrack } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur } from "#lib/cawco/motion/curves.svelte.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconTick } from "#lib/icons.js";

  let {
    label,
    icon: Icon,
    pending = false,
    pendingLabel,
    failed = false,
  }: {
    label?: string;
    /** The icon in the slot at rest. */
    icon?: Component<SVGAttributes<SVGSVGElement>>;
    pending?: boolean;
    /** What the label says while pending ("Saving…"); unchanged if unset. */
    pendingLabel?: string;
    /** The work that just ended failed: no check. */
    failed?: boolean;
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
   * The label is plain text at rest, so it is in the tree once: TextMorph
   * draws a plain copy for screen readers beside its aria-hidden letters, and
   * both land in textContent. TextMorph is mounted only while the label
   * swaps: it takes the words the label had, then the new ones on the next
   * frame, and the plain label returns when the morph has run.
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
  let morphing = $state(false);
  let morphText = $state("");
  let shownText = untrack(() => text);
  let morphTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const next = text;
    if (next === shownText) {
      return;
    }
    const was = shownText;
    shownText = next;
    if (!morphMs) {
      return;
    }
    clearTimeout(morphTimer);
    if (!morphing) {
      morphText = was;
      morphing = true;
    }
    requestAnimationFrame(() => {
      morphText = next;
    });
    morphTimer = setTimeout(() => {
      morphing = false;
    }, morphMs + 80);
  });
  $effect(() => () => clearTimeout(morphTimer));
</script>

<span
  class="icon-swap kit-slot"
  data-shown={Icon !== undefined || phase !== "idle"}
>
  {#if Icon}
    <span data-active={phase === "idle"}
      ><Icon class="size-(--btn-icon)" /></span
    >
  {/if}
  <span data-active={phase === "pending"}
    ><Spinner
      aria-hidden="true"
      class="size-(--btn-icon)"
      role="presentation"
    /></span
  >
  <span data-active={phase === "done"}
    ><IconTick
      class="kit-tick size-(--btn-icon)"
      data-on={phase === "done"}
    /></span
  >
</span>
{#if label === undefined}
  <!-- Icon only: nothing to morph. -->
{:else if morphing}
  <span class="kit-label"
    ><TextMorph
      as="span"
      duration={morphMs}
      ease={CURVE.out}
      text={morphText}
    /></span
  >
{:else}
  <span class="kit-label">{text}</span>
{/if}
