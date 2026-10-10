<script lang="ts">
  /**
   * The relay: who carries your new sessions across the next five hours, as
   * one bar. Each carry span is a band in its account's colour, laid from
   * now to the 5-hour horizon on a recessed groove, 2px between bands. A
   * span nobody can carry draws nothing (the groove shows through); an
   * account out of date draws its band at --account-stale-opacity; an
   * account at its limit draws its band only from the moment it's back,
   * when that is inside the horizon. Hour ticks under it, each a hairline
   * at its hour's place on the bar.
   *
   * Motion: a new reading eases the bands' widths (--dur-panel, ease-out); a
   * band arriving fades in (--dur-fade), one leaving fades out (--dur-exit).
   * The minute moving on re-lays them in place. Reduced motion: at once.
   */
  import type { CarrySpan } from "@cawco/core";
  import { fade } from "svelte/transition";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { usage } from "./forecast.svelte";
  import { fmt, HORIZON_MS, type RingAccount } from "./rings";

  let {
    spans,
    accounts,
    now,
  }: {
    spans: CarrySpan[];
    accounts: RingAccount[];
    now: number;
  } = $props();

  type Segment =
    | { kind: "band"; key: string; ring: RingAccount; ms: number }
    | { kind: "blank"; key: string; ms: number };

  const segments = $derived.by((): Segment[] => {
    const byId = new Map(accounts.map((ring) => [ring.id, ring]));
    const end = now + HORIZON_MS;
    const out: Segment[] = [];
    const seen = new Map<string, number>();
    let at = now;
    for (const span of [...spans].sort((a, b) => a.from - b.from)) {
      const from = Math.max(span.from, at);
      const to = Math.min(span.to, end);
      if (to <= from) {
        continue;
      }
      if (from > at) {
        out.push({ kind: "blank", key: `blank@${out.length}`, ms: from - at });
      }
      const ring = span.accountId ? byId.get(span.accountId) : undefined;
      // An account at its limit carries from the moment it's back, if that
      // is inside the horizon; never before.
      const start =
        ring?.state === "limit" ? Math.max(from, ring.backAt ?? end) : from;
      if (ring && start < to) {
        if (start > from) {
          out.push({
            kind: "blank",
            key: `blank@${out.length}`,
            ms: start - from,
          });
        }
        const n = seen.get(ring.id) ?? 0;
        seen.set(ring.id, n + 1);
        out.push({
          kind: "band",
          key: `${ring.id}#${n}`,
          ring,
          ms: to - start,
        });
      } else {
        out.push({ kind: "blank", key: `blank@${out.length}`, ms: to - from });
      }
      at = to;
    }
    if (at < end) {
      out.push({ kind: "blank", key: `blank@${out.length}`, ms: end - at });
    }
    return out;
  });

  /** The bar read out: who carries, for how long, in order. */
  const label = $derived(
    segments
      .map((seg) =>
        seg.kind === "band"
          ? `${seg.ring.name} for ${fmt(seg.ms)}`
          : `nothing for ${fmt(seg.ms)}`
      )
      .join(", then ")
  );

  /** The minute moving on, or less motion: the bands land where they are. */
  const instant = $derived(usage.cause === "clock" || !motionOk.current);
  // transitions-dev's donut chart: segments ease to their new share on the
  // smooth-out curve, and fade in slower than they fade out.
  const bandIn = () => ({
    duration: instant ? 0 : dur("--dur-fade"),
    easing: easeOut,
  });
  const bandOut = (node: Element) =>
    fade(node, { duration: instant ? 0 : dur("--dur-exit"), easing: easeOut });

  /**
   * Each hour where it falls on the bar, by the bar's own mapping: the
   * segments share the bar's width less their 2px gaps in proportion to
   * their spans, so an hour inside the k-th segment sits at its share of
   * that width plus the k gaps before it. "now" and "+5h" are the bar's ends.
   */
  const ticks = $derived.by(() => {
    const total = segments.reduce((sum, seg) => sum + seg.ms, 0);
    const gaps = Math.max(0, segments.length - 1);
    return [0, 1, 2, 3, 4, 5].map((hour) => {
      const text = hour === 0 ? "now" : `+${hour}h`;
      if (hour === 0 || hour === 5 || total === 0) {
        return { hour, text, at: hour === 5 ? "100%" : "0%" };
      }
      const t = (hour / 5) * total;
      let before = 0;
      let k = 0;
      for (const seg of segments) {
        if (t <= before + seg.ms) {
          break;
        }
        before += seg.ms;
        k += 1;
      }
      return {
        hour,
        text,
        at: `calc((100% - ${gaps} * var(--relay-gap)) * ${(t / total).toFixed(6)} + ${k} * var(--relay-gap))`,
      };
    });
  });
</script>

<div class="relay" data-relay>
  <div
    aria-label="Next 5 hours: {label}"
    class="bar"
    data-relay-bar
    role="img"
    class:instant
  >
    {#each segments as seg (seg.key)}
      {#if seg.kind === "band"}
        <span
          class="band"
          data-relay-band={seg.ring.id}
          style:--c={seg.ring.color}
          style:flex-grow={seg.ms}
          class:stale={seg.ring.state === "stale"}
          in:fade={bandIn()}
          out:bandOut
        ></span>
      {:else}
        <span aria-hidden="true" class="blank" style:flex-grow={seg.ms}></span>
      {/if}
    {/each}
  </div>
  <div aria-hidden="true" class="ticks">
    {#each ticks as tick (tick.hour)}
      <span
        class="tick"
        data-tick={tick.hour}
        style:inset-inline-start={tick.at}
        class:end={tick.hour === 5}
        class:start={tick.hour === 0}
      >
        <span class="mark" data-tick-mark></span>
        <span class="label" data-tick-label>{tick.text}</span>
      </span>
    {/each}
  </div>
</div>

<style>
  .relay {
    --relay-gap: 2px;
    display: flex;
    flex-direction: column;
  }
  /* The groove the bands stand in: the empty track a ring is drawn on, so
     the groove and the gap nobody carries show on the raised surface in
     both schemes (by night the deep recess all but met it). */
  .bar {
    display: flex;
    gap: var(--relay-gap);
    block-size: var(--space-2);
    overflow: hidden;
    border-radius: var(--radius-hair);
    background: var(--border-control);

    @media (hover: none), (pointer: coarse), (max-width: 640px) {
      block-size: var(--space-3);
    }
  }
  .band,
  .blank {
    flex-basis: 0;
    flex-shrink: 1;
    min-inline-size: 0;
    transition: flex-grow var(--dur-panel) var(--ease-out);
  }
  .band {
    border-radius: var(--radius-hair);
    background: var(--c);
  }
  .band.stale {
    opacity: var(--account-stale-opacity);
  }
  .instant .band,
  .instant .blank {
    transition: none;
  }
  /* Under the bar: a hairline at each hour, its label centred on it; "now"
     starts at the bar's start and "+5h" ends at its end. One meta line
     under the marks. */
  .ticks {
    position: relative;
    block-size: calc(var(--space-1) + var(--text-meta) * var(--leading-meta));
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-subtle);
  }
  .tick {
    position: absolute;
    inset-block: 0;
    translate: -50% 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: inset-inline-start var(--dur-panel) var(--ease-out);

    &.start {
      translate: none;
      align-items: flex-start;
    }
    &.end {
      translate: -100% 0;
      align-items: flex-end;
    }
  }
  .mark {
    flex: none;
    inline-size: 1px;
    block-size: 3px;
    background: var(--ink-subtle);
  }
  .label {
    margin-block-start: 1px;
    white-space: nowrap;
  }
  .relay:has(.instant) .tick {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .band,
    .blank,
    .tick {
      transition: none;
    }
  }
</style>
