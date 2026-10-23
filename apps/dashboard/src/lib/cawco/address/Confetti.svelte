<script lang="ts">
  /**
   * Once, the first time the address goes live: a handful of paper bits
   * thrown up from where Caw stands and falling inside the tray only
   * (Family's "rare important setup"). Each bit is one Web Animation on the
   * compositor (transform and opacity); none plays for a reader who asked
   * for less motion. The colours are the brand's and the marks', never a
   * status's, so nothing reads as a state.
   */
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";

  /** How many bits, and the inks they are cut from. */
  const COUNT = 28;
  const INKS = [
    "var(--brand-solid)",
    "var(--spark)",
    "var(--mark-6)",
    "var(--mark-4)",
    "var(--mark-7)",
  ];

  function throwBits(layer: HTMLElement) {
    if (!motionOk.current) {
      return;
    }
    const { width, height } = layer.getBoundingClientRect();
    const bits: HTMLElement[] = [];
    for (let i = 0; i < COUNT; i += 1) {
      const bit = document.createElement("span");
      bit.className =
        "absolute top-0 start-1/2 h-space-2 w-space-1 rounded-hair";
      bit.style.background = INKS[i % INKS.length];
      layer.append(bit);
      bits.push(bit);
      const across = (Math.random() - 0.5) * width * 0.9;
      const up = -(height * 0.08 + Math.random() * height * 0.18);
      const down = height * (0.55 + Math.random() * 0.4);
      const turn = (Math.random() - 0.5) * 900;
      bit
        .animate(
          [
            { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${across * 0.6}px, ${up}px) rotate(${turn * 0.4}deg)`,
              opacity: 1,
              offset: 0.3,
            },
            {
              transform: `translate(${across}px, ${down}px) rotate(${turn}deg)`,
              opacity: 0,
            },
          ],
          {
            duration: dur("--dur-hold") + Math.random() * dur("--dur-panel"),
            delay: Math.random() * dur("--dur-control"),
            easing: CURVE.out,
            fill: "both",
          }
        )
        .finished.then(() => bit.remove())
        .catch(() => bit.remove());
    }
    return () => {
      for (const bit of bits) {
        bit.remove();
      }
    };
  }
</script>

<div
  aria-hidden="true"
  class="pointer-events-none absolute inset-0 overflow-clip rounded-inherit"
  data-slot="confetti"
  {@attach throwBits}
></div>
