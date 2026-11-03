<script lang="ts">
  /**
   * A run's budget as a bar that fills over the run's minutes once the run
   * starts, as an agent might draw it on a delegate's row: the design
   * graph's move in the millions of milliseconds (a 30-minute budget fills
   * over 1,800,000 ms), for its ruler, its rows and its playhead.
   */
  import { MINUTE_MS } from "@cawco/core/time";

  let { minutes, running = false }: { minutes: number; running?: boolean } =
    $props();

  let fill = $state<HTMLElement>();
  $effect(() => {
    if (!(running && fill)) {
      return;
    }
    const filling = fill.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: minutes * MINUTE_MS, easing: "linear", fill: "forwards" }
    );
    return () => filling.cancel();
  });
</script>

<div
  class="relative h-c-meter-bar-h w-c-measure-short max-w-full overflow-clip rounded-hair bg-meter-calm-track"
>
  <div
    bind:this={fill}
    class="absolute inset-0 origin-left scale-x-0 rounded-hair bg-meter-calm rtl:origin-right"
  ></div>
</div>
