<script lang="ts">
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
  const offset = $derived(
    circumference * (1 - Math.min(done, total) / Math.max(total, 1))
  );
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
    {#if indeterminate}
      <circle
        class="stroke-border"
        cx={box / 2}
        cy={box / 2}
        fill="none"
        r={radius}
        stroke-width={stroke}
      />
      <circle
        class="spin"
        cx={box / 2}
        cy={box / 2}
        fill="none"
        r={radius}
        stroke="currentColor"
        stroke-dasharray="{circumference * 0.3} {circumference}"
        stroke-linecap="round"
        stroke-width={stroke}
      />
    {:else}
      <g data-shown={!finished}>
        <circle
          class="stroke-border"
          cx={box / 2}
          cy={box / 2}
          fill="none"
          r={radius}
          stroke-width={stroke}
        />
        <!-- Wound from the top, as a clock is read. -->
        <circle
          class="arc"
          cx={box / 2}
          cy={box / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          stroke-linecap="round"
          stroke-width={stroke}
          transform="rotate(-90 {box / 2} {box / 2})"
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
    {/if}
  </svg>
{/if}

<style>
  .task-ring .arc {
    transition: stroke-dashoffset 240ms var(--ease-out);
  }

  .task-ring g {
    transform-box: fill-box;
    transform-origin: center;
    transition:
      opacity 160ms var(--ease-out),
      scale 160ms var(--ease-out);
  }

  .task-ring g[data-shown="false"] {
    opacity: 0;
    scale: 0.6;
  }

  .task-ring .spin {
    transform-box: view-box;
    transform-origin: center;
    animation: task-ring-spin 1.1s linear infinite;
  }

  @keyframes task-ring-spin {
    to {
      rotate: 360deg;
    }
  }

  /* Clamped, never zeroed, and the travel goes — the swap still reads as one
     thing becoming another rather than two frames. */
  @media (prefers-reduced-motion: reduce) {
    .task-ring .arc,
    .task-ring g {
      transition-duration: 120ms;
    }

    .task-ring g[data-shown="false"] {
      scale: 1;
    }
  }
</style>
