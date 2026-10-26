<script lang="ts">
  /**
   * Caw on the tray's centre axis, as a still per moment (caw/, each a
   * Backlot edit of his open-eyed source still; README.md lists the takes).
   * Between poses he plays the mascot's Appearing and Leaving contract as
   * TrayCaw plays it: the leaving pose holds its drawing and fades to
   * --leave-scale over --dur-fade, out of the flow; the next fades in from
   * --leave-scale over --dur-pop on ease-out. With less motion, a fade.
   *
   * `big`: a failure's 80px box (--c-caw-hero) in place of the step's 64
   * (--c-address-caw); the box travels between the two as one object
   * (FLIP) over --dur-panel on the drawer curve.
   */
  import {
    CURVE,
    dur,
    easeOut,
    motionOk,
    numberOf,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { cawLeave } from "../motion";
  import type { Pose } from "./flow.svelte";

  let { pose, big = false }: { pose: Pose; big?: boolean } = $props();

  const STILLS = import.meta.glob<string>("./caw/*.png", {
    eager: true,
    query: "?url",
    import: "default",
  });
  /** By night, the same drawing on the paper rim dark-ready.png carries (README.md). */
  const src = $derived(
    STILLS[`./caw/${pose}${theme.resolved === "dark" ? "-night" : ""}.png`]
  );

  let box = $state<HTMLElement | null>(null);
  /** The box as it was drawn before `big` changed: where the FLIP starts. */
  let before: DOMRect | null = null;
  let wasBig: boolean | null = null;

  $effect.pre(() => {
    if (box && wasBig !== null && big !== wasBig) {
      before = box.getBoundingClientRect();
    }
  });

  $effect(() => {
    const now = big;
    const el = box;
    if (el && before && wasBig !== null && now !== wasBig && motionOk.current) {
      const after = el.getBoundingClientRect();
      const from = before;
      el.animate(
        [
          {
            transformOrigin: "0 0",
            transform: `translate(${from.left - after.left}px, ${from.top - after.top}px) scale(${from.width / after.width})`,
          },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration: dur("--dur-panel"), easing: CURVE.drawer }
      );
    }
    before = null;
    wasBig = now;
  });

  /** The next pose: from --leave-scale over --dur-pop. */
  function enter(_node: HTMLElement) {
    if (!motionOk.current) {
      return {
        duration: dur("--dur-fade"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      };
    }
    const scale = numberOf("--leave-scale");
    return {
      duration: dur("--dur-pop"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}; scale: ${scale + (1 - scale) * t}`,
    };
  }
</script>

<div
  bind:this={box}
  aria-hidden="true"
  class={[
    "pointer-events-none relative grid flex-none select-none",
    big ? "size-c-caw-hero" : "size-c-address-caw",
  ]}
  data-caw-pose={pose}
  data-slot="tray-caw"
>
  {#key pose}
    <img
      class="col-1 row-1 size-full object-contain"
      alt=""
      draggable="false"
      {src}
      in:enter
      out:cawLeave
    />
  {/key}
</div>
