<script lang="ts">
  /**
   * A done check, in a ring's 12px slot (transitions-dev Success check, in
   * the house's tokens): it fades in, turns upright from check-turn,
   * sharpens from fold-blur and rises from pop-rise over dur-pop on
   * ease-out, and its stroke draws after dur-ghost. Every part is a CSS
   * animation, so the page's clock can pause and seek it. Without motion
   * it only fades in.
   */
  /** The stroke's length, for its dash: measured once, as the recipe says. */
  const draw = (path: SVGPathElement) => {
    const length = String(Math.ceil(path.getTotalLength()));
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
  };
</script>

<span class="check" aria-hidden="true">
  <svg aria-hidden="true" fill="none" viewBox="0 0 12 12">
    <path
      d="M3.4 6.4 5.2 8.3 8.7 4.1"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      {@attach draw}
    />
  </svg>
</span>

<style>
  .check {
    display: inline-block;
    inline-size: 12px;
    block-size: 12px;
    transform-origin: center;
    animation:
      check-fade var(--dur-pop) var(--ease-out) both,
      check-turn var(--dur-pop) var(--ease-out) both,
      check-blur var(--dur-pop) var(--ease-out) both,
      check-rise var(--dur-pop) var(--ease-out) both;
  }
  svg {
    display: block;
    overflow: visible;
  }
  path {
    animation: check-draw var(--dur-pop) var(--ease-out) var(--dur-ghost)
      forwards;
  }
  @keyframes check-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes check-turn {
    from {
      transform: rotate(calc(var(--check-turn) * 1deg));
    }
  }
  @keyframes check-blur {
    from {
      filter: blur(var(--fold-blur));
    }
  }
  @keyframes check-rise {
    from {
      translate: 0 var(--pop-rise);
    }
  }
  @keyframes check-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  /* Without motion it only fades in, drawn whole. */
  @media (prefers-reduced-motion: reduce) {
    .check {
      animation: check-fade var(--dur-fade) var(--ease-out) both;
    }
    path {
      animation: none;
      stroke-dashoffset: 0 !important;
    }
  }
</style>
