<script lang="ts">
  /**
   * THE PROGRESS LINE (proposal): how far a delegate's own plan has got,
   * drawn with the usage strip's LimitBar at its 4px size, no pace tick,
   * its fill in the delegate's identity hue (The Reserved Hue Rule lets
   * progress take one) and its track the control edge.
   *
   * While the delegate works, the skeleton's sweep crosses the fill: one
   * band of the raised surface at 60% every --dur-loop, by transform only
   * (The One Loop Rule). With no plan yet a short band travels the whole
   * track (the task ring's no-plan arc, laid flat). Finished, the fill eases
   * to full and the band stops; failed, the fill holds where it stopped.
   * With reduced motion no band runs.
   */
  import { markHue } from "#lib/cawco/mark.js";
  import LimitBar from "#lib/cawco/usage/LimitBar.svelte";
  import type { Delegate } from "./fixtures";

  let { delegate }: { delegate: Delegate } = $props();

  const share = $derived.by(() => {
    if (delegate.status === "done") {
      return 1;
    }
    const { plan } = delegate;
    return plan ? plan.done / Math.max(plan.total, 1) : 0;
  });
  const working = $derived(delegate.status === "live");
  const label = $derived(
    delegate.plan
      ? `${delegate.name}: ${delegate.plan.done} of ${delegate.plan.total} steps`
      : `${delegate.name}: no plan yet`
  );
</script>

<span
  class="line"
  data-planless={delegate.plan ? undefined : ""}
  data-slot="progress-line"
  data-status={delegate.status}
  style:--hue="var(--mark-{markHue(delegate.place)})"
  style:--share={share}
>
  <LimitBar
    elapsed={null}
    {label}
    reads="used"
    size={4}
    state="calm"
    used={share * 100}
  />
  {#if working}
    <span aria-hidden="true" class="sweep-box"
      ><span class="pv-sweep" data-slot="sweep"></span></span
    >
  {/if}
</span>

<style>
  .line {
    position: relative;
    display: block;
    min-inline-size: 0;
  }
  /* LimitBar's own inks are the meter's; here the fill is the delegate's
     hue and the track the control edge. */
  .line :global(.bar[data-reads]) {
    --fill: var(--hue);
    --track: var(--border-control);
    block-size: var(--pv-line, 4px);
  }
  .line[data-status="fail"] :global(.bar[data-reads]) {
    --fill: color-mix(in oklch, var(--hue) 55%, var(--border-control));
  }
  /* The sweep stands over the fill only (the whole track while there is
     no plan), cut to it. */
  .sweep-box {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: calc(var(--share) * 100%);
    overflow: hidden;
    border-radius: var(--radius-hair);
    pointer-events: none;
  }
  .line[data-planless] .sweep-box {
    inline-size: 100%;
  }
  .pv-sweep {
    position: absolute;
    inset: 0;
    translate: -100% 0;
    background: linear-gradient(
      90deg,
      transparent 0 30%,
      var(--skeleton-sheen) 50%,
      transparent 70% 100%
    );
  }
  .line[data-planless] .pv-sweep {
    background: linear-gradient(
      90deg,
      transparent 0 35%,
      var(--hue) 35% 65%,
      transparent 65% 100%
    );
  }
  @media (prefers-reduced-motion: no-preference) {
    .pv-sweep {
      animation: kit-skeleton-sweep var(--pv-sweep, var(--dur-loop)) linear
        infinite;
    }
  }
</style>
