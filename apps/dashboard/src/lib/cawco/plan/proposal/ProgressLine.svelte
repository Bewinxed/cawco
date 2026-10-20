<script lang="ts">
  /**
   * THE PROGRESS LINE (proposal): how far a delegate's own plan has got,
   * drawn as the usage strip's LimitBar is (a track on the control edge, a
   * fill at least as long as it is thick), at the frame's weight
   * (`--pv-line`), no pace tick. Its colour follows The Reserved Hue Rule
   * (DESIGN.md): crimson, spark, olive and blue mean status only, and
   * progress takes ink, so a running, waiting or queued line is muted ink on
   * the control edge. A result earns its state pair, as a finished task
   * ring does: done in the done pair, failed in the fail pair.
   *
   * While the delegate works, a sweep crosses the fill: one band of light
   * (plan-sheen, brighter than the fill in both schemes) every --dur-loop,
   * by transform only (The One Loop Rule). With no plan yet a short band travels the whole
   * track (the task ring's no-plan arc, laid flat). Finished, the fill eases
   * to full and the band stops; failed, the fill holds where it stopped.
   * With reduced motion no band runs.
   *
   * `held` stands the band where one run puts it at that share (0 its
   * start, 1 its end), drawn there with no animation, so a still shows
   * where it is (a capture that stops animations can't take a running band
   * back to its start).
   */
  import type { Delegate } from "./fixtures";

  let {
    delegate,
    held,
    class: className,
  }: {
    delegate: Delegate;
    /** The band stood at this share of its run, 0 to 1, not moving. */
    held?: number;
    /** Where the row places the line. */
    class?: string;
  } = $props();

  const share = $derived.by(() => {
    if (delegate.status === "done") {
      return 1;
    }
    const { plan } = delegate;
    return plan ? plan.done / Math.max(plan.total, 1) : 0;
  });
  const working = $derived(delegate.status === "live");
  const planless = $derived(!delegate.plan);
  const label = $derived(
    delegate.plan
      ? `${delegate.name}: ${delegate.plan.done} of ${delegate.plan.total} steps`
      : `${delegate.name}: no plan yet`
  );
</script>

<span
  aria-label={label}
  aria-valuemax={100}
  aria-valuemin={0}
  aria-valuenow={Math.round(share * 100)}
  aria-valuetext="{Math.round(share * 100)}% done"
  class={[
    "relative block h-(--pv-line) min-w-0 overflow-hidden rounded-hair",
    delegate.status === "done" && "bg-status-done-bg",
    delegate.status === "fail" && "bg-status-fail-bg",
    delegate.status !== "done" &&
      delegate.status !== "fail" &&
      "bg-border-control",
    className,
  ]}
  data-planless={planless || undefined}
  data-slot="progress-line"
  data-status={delegate.status}
  role="progressbar"
  style:--share={share}
>
  <!-- The fill, at least as long as the line is thick. -->
  <span
    class={[
      "absolute inset-y-0 start-0 w-(--fill-w) rounded-hair motion-safe:transition-[inline-size] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer",
      delegate.status === "done" && "bg-status-done-ink",
      delegate.status === "fail" && "bg-status-fail-ink",
      delegate.status !== "done" &&
        delegate.status !== "fail" &&
        "bg-ink-muted",
    ]}
    data-slot="fill"
    style:--fill-w={share > 0
      ? "max(calc(var(--share) * 100%), var(--pv-line))"
      : "0px"}
  ></span>
  {#if working}
    <!-- The sweep stands over the fill only (the whole track while there is
         no plan), cut to it: light running along the line, the fill mixed
         toward its scheme's brighter ink (plan-sheen), so the band is always
         brighter than the fill and never reads as a gap in it. With no plan
         a band of ink, the middle third of its box, travels the track. -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 start-0 w-(--sweep-w) overflow-hidden rounded-hair"
      style:--sweep-w={planless ? "100%" : "calc(var(--share) * 100%)"}
      ><span
        class={[
          "loops absolute inset-0",
          held === undefined
            ? "-translate-x-full motion-safe:animate-plan-sweep"
            : "translate-x-(--band-x)",
          !planless &&
            "bg-linear-to-r from-transparent from-25% via-plan-sheen via-50% to-transparent to-75%",
        ]}
        data-slot="sweep"
        style:--band-x={held === undefined
          ? undefined
          : `calc(-100% + ${held} * 200%)`}
        >{#if planless}<span class="absolute inset-y-0 inset-x-1/3 bg-ink-muted"
          ></span>{/if}</span
      ></span
    >
  {/if}
</span>
