<script lang="ts">
  /**
   * The relay: who carries your new sessions across the next five hours, as
   * one bar. Each carry span is a band in its account's colour, laid from
   * now to the 5-hour horizon on a recessed groove, 2px between bands. A
   * span nobody can carry is hatched, the first of them (the stop) behind a
   * 1px ink-strong tick; an
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
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { usage } from "./forecast.svelte";
  import { fmt, HORIZON_MS, type RingAccount } from "./rings";

  let {
    spans,
    accounts,
    now,
    stopAt,
    nameOf,
    onlight,
  }: {
    spans: CarrySpan[];
    accounts: RingAccount[];
    now: number;
    /** When nothing can carry you (`ClaudeRings.stopAt`), null if never. */
    stopAt: number | null;
    /** An account by the name its cell shows. */
    nameOf: (ring: RingAccount) => string;
    /** A band is hovered or open (its account), or no longer (null). */
    onlight: (id: string | null) => void;
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

  /** Where each segment starts, from now. */
  const startOf = $derived.by(() => {
    const at = new Map<string, number>();
    let sum = 0;
    for (const seg of segments) {
      at.set(seg.key, sum);
      sum += seg.ms;
    }
    return at;
  });
  /**
   * A moment on the bar: "now" where `fmt` would say "0m", else how far
   * ahead ("+1h 40m"), rounded as the cells round their times.
   */
  const ahead = (ms: number): string =>
    fmt(ms) === "0m" ? "now" : `+${fmt(ms)}`;
  /**
   * A band's tooltip: how long its account carries your new sessions,
   * "design carries you from now to +32m". It ends where the relay hands
   * over, which can come before the account runs out (its dial's tip says
   * when that is).
   */
  const bandTip = (seg: Segment & { kind: "band" }): string => {
    const from = startOf.get(seg.key) ?? 0;
    return `${nameOf(seg.ring)} carries you from ${ahead(from)} to ${ahead(from + seg.ms)}`;
  };

  /** Where nobody can carry you first: the stop, inside the five hours. */
  const stopKey = $derived(
    stopAt !== null && stopAt - now < HORIZON_MS
      ? (segments.find((seg) => seg.kind === "blank")?.key ?? null)
      : null
  );

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

<!-- literal: 2px -->
<div
  class="group/relay flex flex-col"
  data-instant={instant || undefined}
  data-relay
  style:--relay-gap="2px"
>
  <div
    aria-label="Next 5 hours: {label}"
    class="flex h-space-2 gap-(--relay-gap) overflow-hidden rounded-hair bg-border-control hover-none:h-space-3 coarse:h-space-3 max-[641px]:h-space-3"
    data-relay-bar
    role="img"
  >
    {#each segments as seg (seg.key)}
      {#if seg.kind === "band"}
        {@const tip = bandTip(seg)}
        {@const id = seg.ring.id}
        <!-- Hues repeat past seven accounts: each band names its account
             and its span on a rest or a tap, and lights its cell. -->
        <Tip
          label={tip}
          ontoggle={(open) => onlight(open ? id : null)}
          side="top"
          tap
        >
          {#snippet children(props)}
            <span
              {...props}
              aria-label={tip}
              class="min-w-0 shrink basis-0 grow-(--grow) rounded-hair bg-(--c) transition-[flex-grow] dur-panel ease-out group-data-instant/relay:transition-none data-stale:opacity-(--account-stale-opacity) motion-reduce:transition-none"
              data-relay-band={id}
              data-stale={seg.ring.state === "stale" || undefined}
              onpointerenter={(event) => {
                (
                  props.onpointerenter as
                    ((e: PointerEvent) => void) | undefined
                )?.(event);
                onlight(id);
              }}
              onpointerleave={(event) => {
                (
                  props.onpointerleave as
                    ((e: PointerEvent) => void) | undefined
                )?.(event);
                onlight(null);
              }}
              role="img"
              style:--c={seg.ring.color}
              style:--grow={seg.ms}
              in:fade={bandIn()}
              out:bandOut
            ></span>
          {/snippet}
        </Tip>
      {:else}
        <!-- literal: -45deg; a span nobody carries is hatched, the groove's
             paint over the ground's -->
        <span
          data-stop={seg.key === stopKey || undefined}
          aria-hidden="true"
          class="min-w-0 shrink basis-0 grow-(--grow) bg-(image:--hatch) transition-[flex-grow] dur-panel ease-out group-data-instant/relay:transition-none data-stop:border-s data-stop:border-s-ink-strong motion-reduce:transition-none"
          data-relay-stop={seg.key === stopKey ? "" : undefined}
          style:--grow={seg.ms}
          style:--hatch={"repeating-linear-gradient(-45deg, var(--border-control) 0 1px, var(--ring-ground, var(--surface-raised)) 1px var(--space-1))"}
        ></span>
      {/if}
    {/each}
  </div>
  <div
    aria-hidden="true"
    class="relative h-(--ticks-h) type-meta num text-ink-subtle"
    style:--ticks-h={"calc(var(--space-1) + var(--text-meta) * var(--leading-meta))"}
  >
    {#each ticks as tick (tick.hour)}
      <!-- mark-line: the tick stands above its hour, not beside it -->
      <span
        data-end={tick.hour === 5 || undefined}
        class="absolute inset-y-0 start-(--tick-at) flex -translate-x-1/2 flex-col items-center transition-[inset-inline-start] dur-panel ease-out group-data-instant/relay:transition-none not-data-end:data-start:translate-none not-data-end:data-start:items-start data-end:-translate-x-full data-end:items-end motion-reduce:transition-none"
        data-start={tick.hour === 0 || undefined}
        data-tick={tick.hour}
        style:--tick-at={tick.at}
      >
        <!-- literal: 3px -->
        <span
          data-slot="mark"
          class="h-(--mark-h) w-px flex-none bg-ink-subtle"
          data-tick-mark
          style:--mark-h="3px"
        ></span>
        <span
          data-slot="relay-label"
          class="mt-px mono-figure whitespace-nowrap"
          data-tick-label>{tick.text}</span
        >
      </span>
    {/each}
  </div>
</div>
