<!-- A sign-in landed: the tick draws itself along its stroke over
     --dur-toggle as it arrives (Ticks and dots); with reduced motion it only
     fades in. -->
<svg
  aria-hidden="true"
  class="check flex-none size-icon-md text-status-done-glyph"
  fill="none"
  viewBox="0 0 24 24"
>
  <path
    d="M5 12.5l4.5 4.5L19 7.5"
    pathLength="1"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
  />
</svg>

<style>
  /* residual: keyframes */
  .check {
    animation: check-in var(--dur-toggle) var(--ease-out) both;
  }
  @media (prefers-reduced-motion: no-preference) {
    .check {
      animation: none;
    }
    /* residual: svg-paint */
    .check path {
      stroke-dasharray: 1;
    }
    /* residual: keyframes */
    .check path {
      animation: check-draw var(--dur-toggle) var(--ease-out) both;
    }
  }
  @keyframes check-in {
    from {
      opacity: 0;
    }
  }
  @keyframes check-draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
