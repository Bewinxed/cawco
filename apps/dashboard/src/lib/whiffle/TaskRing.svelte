<script lang="ts">
  import { dur, ease, motionOk } from "./motion/curves.svelte";
  /**
   * How far a session's plan has got, in the space a glyph takes.
   *
   * The arc is `currentColor`, so it wears whatever hue the parent is in —
   * every caller pairs it with `identity-ink` and the directory's
   * `--identity-h`, which keeps progress *decoration* and leaves green, amber
   * and red to session state (DESIGN.md, The Reserved Hue Rule). Finishing is
   * the one moment it earns a state colour, because by then it is a result.
   */
  interface Props {
    done?: number;
    /**
     * The session is working and there is no plan to measure it against. The
     * ring turns a short arc instead of filling one: alive is the whole claim,
     * and a fraction nobody can compute is not drawn as if somebody had.
     */
    indeterminate?: boolean;
    /** 16px beside a session title, 12px in a board row. */
    size?: "sm" | "md";
    style?: string;
    total?: number;
  }

  let {
    done = 0,
    total = 0,
    indeterminate = false,
    size = "md",
    style,
  }: Props = $props();

  const box = $derived(size === "md" ? 16 : 12);
  const stroke = $derived(size === "md" ? 1.5 : 1.25);
  const radius = $derived((box - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const finished = $derived(total > 0 && done >= total);
  /** How much of the ring the arc draws: a short turning arc while nothing
   *  is counted, else the share of the plan that is done. */
  const arc = $derived(
    indeterminate
      ? circumference * 0.3
      : (circumference * Math.min(done, total)) / Math.max(total, 1)
  );

  /* One arc in both modes, so a session that starts counting keeps the arc
     it was turning: its length eases to the first count while its turn
     runs on to the top, where a counted ring is read from (-90deg, one
     turn on). */
  let arcEl = $state<SVGCircleElement | null>(null);
  let turning = indeterminate;
  $effect.pre(() => {
    const now = indeterminate;
    if (turning && !now && arcEl && motionOk.current) {
      const element = arcEl;
      const angle = Number.parseFloat(getComputedStyle(element).rotate) || 0;
      queueMicrotask(() =>
        element.animate([{ rotate: `${angle}deg` }, { rotate: "270deg" }], {
          duration: dur("--dur-pop"),
          easing: ease("--ease-out"),
        })
      );
    }
    turning = now;
  });
</script>

<!-- Nothing planned and nothing running draws nothing: an empty ring is a
     control that says a session has a plan it has not started, which is a
     different claim. -->
{#if total > 0 || indeterminate}
  <svg
    aria-hidden="true"
    class="task-ring shrink-0"
    height={box}
    {style}
    viewBox="0 0 {box} {box}"
    width={box}
  >
    <g data-shown={!finished}>
      <circle
        class="stroke-border"
        cx={box / 2}
        cy={box / 2}
        fill="none"
        r={radius}
        stroke-width={stroke}
      />
      <circle
        bind:this={arcEl}
        class="arc"
        class:spin={indeterminate}
        cx={box / 2}
        cy={box / 2}
        fill="none"
        r={radius}
        stroke="currentColor"
        stroke-dasharray="{arc} {circumference}"
        stroke-linecap="round"
        stroke-width={stroke}
      />
    </g>
    <g class="text-success" data-shown={finished}>
      <polyline
        fill="none"
        points="{box * 0.28},{box * 0.53} {box * 0.43},{box * 0.69} {box * 0.72},{box * 0.34}"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width={stroke * 1.2}
      />
    </g>
  </svg>
{/if}

<style>
  /* Wound from the top, as a clock is read. */
  .task-ring .arc {
    transform-box: view-box;
    transform-origin: center;
    rotate: -90deg;
    transition: stroke-dasharray var(--dur-pop) var(--ease-out);
  }

  .task-ring g {
    transform-box: fill-box;
    transform-origin: center;
    transition:
      opacity var(--dur-exit) var(--ease-out),
      scale var(--dur-exit) var(--ease-out);
  }

  .task-ring g[data-shown="false"] {
    opacity: 0;
    scale: 0.6;
  }

  .task-ring .spin {
    animation: task-ring-spin 1.1s linear infinite;
  }

  @keyframes task-ring-spin {
    from {
      rotate: -90deg;
    }
    to {
      rotate: 270deg;
    }
  }

  /* Clamped, never zeroed, and the travel goes — the swap still reads as one
     thing becoming another rather than two frames. */
  @media (prefers-reduced-motion: reduce) {
    .task-ring .arc,
    .task-ring g {
      transition-duration: var(--dur-control);
    }

    .task-ring g[data-shown="false"] {
      scale: 1;
    }
  }
</style>
