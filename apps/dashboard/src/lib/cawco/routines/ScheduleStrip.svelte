<script lang="ts" module>
  /** How many days ahead the hub tells a routine's runs (hub routines.ts `nextRunsOf`). */
  const WEEK_DAYS = 7;
  /** How many runs it tells at most (hub routines.ts `NEXT_RUNS_MAX`). */
  const RUNS_MAX = 288;

  export interface Schedule {
    kind: "day" | "week";
    /** Each run inside it, ms from now, the next run first. */
    runs: number[];
    /** The strip's span from now, ms. */
    span: number;
  }

  /**
   * The strip for the runs the hub's scheduler will start (`runs`, epoch
   * ms): a day's strip when a run falls in each of the next seven days, or
   * the hub's bound was reached (spanning to the last run told, under a
   * day); otherwise a week's. No runs ahead, no strip.
   */
  export function stripOf(
    runs: readonly number[],
    now: number
  ): Schedule | null {
    const ahead = runs.map((at) => at - now).filter((at) => at >= 0);
    if (ahead.length === 0) {
      return null;
    }
    const days = new Set(ahead.map((at) => Math.floor(at / DAY_MS)));
    const daily =
      runs.length >= RUNS_MAX ||
      Array.from({ length: WEEK_DAYS }, (_, day) => day).every((day) =>
        days.has(day)
      );
    if (!daily) {
      return { kind: "week", runs: ahead, span: WEEK_DAYS * DAY_MS };
    }
    const last = ahead.at(-1) ?? 0;
    const span = runs.length >= RUNS_MAX && last < DAY_MS ? last : DAY_MS;
    return { kind: "day", runs: ahead.filter((at) => at <= span), span };
  }
</script>

<script lang="ts">
  /**
   * A routine's schedule drawn as times on a line (DESIGN.md, The Show Don't
   * Tell Rule), on the relay bar's recipe and mapping (usage/Relay,
   * `barPlace`): a groove from now across the next day or week, each run the
   * hub's scheduler will start a 2px tick at its time, the next run in the
   * strong ink and standing past the groove. Under it (`compact` leaves them
   * out, as a row's line does) a hairline and its label where each day
   * begins, or every six hours on a day's strip, in the measured-figure
   * face; "now" at its start. The words are its accessible name and tooltip.
   */
  import { DAY_MS, HOUR_MS } from "@cawco/core/time";
  import { untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { barPlace } from "#lib/cawco/usage/bar-place.js";

  let {
    runs,
    now,
    label,
    paused = false,
    compact = false,
  }: {
    /** The runs ahead, as the hub tells them (`Routine.nextRuns`), epoch ms. */
    runs: readonly number[];
    now: number;
    /** The schedule in words: the strip's name. */
    label: string;
    /** Paused: its runs stand muted and none is next. */
    paused?: boolean;
    compact?: boolean;
  } = $props();

  const schedule = $derived(stripOf(runs, now));
  /**
   * A mark's or a run tick's shift from its time (`--f` of the strip):
   * centred (-50% of itself), but never past the strip's start (-f of its
   * width) nor its end ((1 - f) of its width, less itself). Read where it is
   * used, so % is its own width and cqi the strip's (the groove and the
   * marks' row are each a container). Centred as it was, a run at the
   * strip's end stood a pixel past it, a pixel wider than the form.
   */
  const KEEP =
    "clamp(calc(var(--f) * -100cqi), -50%, calc((1 - var(--f)) * 100cqi - 100%))";
  const place = (at: number, span: number) => barPlace(at, [span], "0px");
  const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });

  /** Where each day begins (a week's strip) or each six hours (a day's), from now. */
  const marks = $derived.by(() => {
    if (!schedule || compact) {
      return [];
    }
    const { span, kind } = schedule;
    const out = [{ at: 0, text: "now" }];
    if (kind === "day") {
      for (const hours of [6, 12, 18]) {
        if (hours * HOUR_MS < span) {
          out.push({ at: hours * HOUR_MS, text: `+${hours}h` });
        }
      }
      out.push({ at: span, text: span === DAY_MS ? "+24h" : "" });
      return out.filter((mark) => mark.text);
    }
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    for (let at = midnight.getTime() - now; at < span; at += DAY_MS) {
      // A day beginning within a twentieth of the strip's start would sit on "now".
      if (at > span / 20) {
        out.push({ at, text: WEEKDAY.format(now + at) });
      }
    }
    return out;
  });

  /** The marks' row. */
  let markRow = $state<HTMLElement>();
  /**
   * The marks whose label would stand on the one before it, by their time:
   * each label held where it draws (centred on its time, flush inside
   * either edge), and kept only `--spacing-space-1` or more past the last label
   * kept. The twentieth of the strip a day keeps from "now" is a share:
   * at a phone's width "now" and "Wed" ran into each other inside it. Its
   * hairline stays; the label stands hidden.
   */
  let crowded = $state<ReadonlySet<number>>(new Set());
  /**
   * Measured again whenever the row or any label changes size: the row's
   * width, and each label's own as its face draws it. Read once as it
   * mounted, a label measured in the fallback face (24px for "now", 21px
   * in JetBrains Mono) kept that answer after the house face arrived, so a
   * day's label stood hidden beside room for it, or shown over "now".
   */
  $effect(() => {
    const row = markRow;
    const all = marks;
    const span = schedule?.span ?? 0;
    if (!row || span <= 0) {
      crowded = new Set();
      return;
    }
    const labels = [...row.querySelectorAll<HTMLElement>("[data-mark-label]")];
    const measure = () => {
      crowded = crowdedOf(all, span, row.clientWidth, labels);
    };
    const sized = frameObserver(measure);
    sized.observe(row);
    for (const one of labels) {
      sized.observe(one);
    }
    untrack(measure);
    return () => sized.disconnect();
  });

  function crowdedOf(
    all: readonly { at: number }[],
    span: number,
    width: number,
    labels: readonly HTMLElement[]
  ): ReadonlySet<number> {
    const out = new Set<number>();
    if (width <= 0) {
      return out;
    }
    const gap = numberOf("--spacing-space-1");
    let lastRight = Number.NEGATIVE_INFINITY;
    all.forEach((mark, i) => {
      const w = labels[i]?.offsetWidth ?? 0;
      const centre = Math.min(1, mark.at / span) * width;
      const left = Math.min(Math.max(centre - w / 2, 0), width - w);
      if (left < lastRight + gap) {
        out.add(mark.at);
      } else {
        lastRight = left + w;
      }
    });
    return out;
  }
</script>

{#if schedule}
  <span
    data-slot="schedule"
    aria-label={label}
    class="flex min-w-0 flex-col"
    data-kind={schedule.kind}
    role="img"
    title={label}
  >
    <span
      data-slot="schedule-bar"
      class="@container relative block h-space-2 rounded-hair bg-border-control"
    >
      {#each schedule.runs as at, i (at)}
        {@const nextRun = i === 0 && !paused}
        <span
          data-run-tick
          class={[
            "absolute start-(--at) w-space-row translate-x-(--keep) rounded-hair",
            nextRun && "-inset-y-space-row bg-ink-strong",
            !nextRun && "inset-y-0",
            !nextRun && (paused ? "bg-ink-subtle" : "bg-ink-muted"),
          ]}
          data-at={at / schedule.span}
          data-next={nextRun ? "" : undefined}
          style:--at={place(at, schedule.span)}
          style:--f={Math.min(1, at / schedule.span)}
          style:--keep={KEEP}
        ></span>
      {/each}
    </span>
    {#if marks.length > 0}
      <!-- Each mark centred on its time, held inside the strip: a hairline
           or label that would cross either edge stands flush with it
           instead (`--keep`, the strip's own width in cqi), so "now", "+24h"
           and a weekday near either end never poke past the strip or get
           cut, at any width. -->
      <span
        bind:this={markRow}
        aria-hidden="true"
        class="@container relative block h-(--marks-h) type-meta num text-ink-subtle"
        style:--marks-h={"calc(var(--spacing-space-1) + var(--text-meta) * var(--leading-meta))"}
      >
        {#each marks as mark (mark.at)}
          <!-- mark-line: the hairline stands above its label, not beside it -->
          <span
            class="absolute inset-y-0 start-(--at) w-0"
            style:--at={place(mark.at, schedule.span)}
            style:--f={Math.min(1, mark.at / schedule.span)}
            style:--keep={KEEP}
          >
            <span
              class="absolute top-0 start-0 h-space-1 w-px translate-x-(--keep) bg-ink-subtle"
            ></span>
            <span
              data-mark-label
              class={[
                "absolute bottom-0 start-0 mono-figure whitespace-nowrap translate-x-(--keep)",
                crowded.has(mark.at) && "invisible",
              ]}>{mark.text}</span
            >
          </span>
        {/each}
      </span>
    {/if}
  </span>
{/if}
