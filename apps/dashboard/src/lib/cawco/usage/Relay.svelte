<script lang="ts">
  /**
   * The relay: who carries your new sessions across the next five hours, as
   * one bar. Each carry span is a band in its account's colour, laid from
   * now to the 5-hour horizon on a recessed groove, 2px between bands. A
   * span nobody can carry draws nothing (the groove shows through); an
   * account out of date draws its band at 40%; an account at its limit
   * draws its band only from the moment it's back, when that is inside the
   * horizon. Hour ticks under it.
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

  const TICKS = ["now", "+1h", "+2h", "+3h", "+4h", "+5h"];
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
    {#each TICKS as tick (tick)}
      <span>{tick}</span>
    {/each}
  </div>
</div>

<style>
  .relay {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  /* The groove the bands stand in: the recess of a progress track. */
  .bar {
    display: flex;
    gap: 2px;
    block-size: var(--space-2);
    overflow: hidden;
    border-radius: var(--radius-hair);
    background: var(--surface-recess-deep);

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
    opacity: 0.4;
  }
  .instant .band,
  .instant .blank {
    transition: none;
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-subtle);
  }
  @media (prefers-reduced-motion: reduce) {
    .band,
    .blank {
      transition: none;
    }
  }
</style>
