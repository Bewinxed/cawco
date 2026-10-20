<script lang="ts" module>
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const SPACES = /\s+/;
  const NUMBER = /^\d+$/;
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** A cron's day-of-week field as days (0 Sunday … 6 Saturday); null for a form not read. */
  function daysOf(field: string): Set<number> | null {
    if (field === "*") {
      return new Set([0, 1, 2, 3, 4, 5, 6]);
    }
    const days = new Set<number>();
    for (const part of field.split(",")) {
      const [from, to = from] = part.split("-");
      if (!(from && NUMBER.test(from) && NUMBER.test(to))) {
        return null;
      }
      for (let day = Number(from); day <= Number(to); day += 1) {
        if (day > 7) {
          return null;
        }
        days.add(day % 7);
      }
    }
    return days;
  }

  /** The wall clock of `at` in `zone`: its date, weekday (0 Sunday) and how far ahead of UTC it stands. */
  function clockIn(zone: string, at: number) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const wall = Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
      Number(get("second"))
    );
    return {
      year: Number(get("year")),
      month: Number(get("month")) - 1,
      day: Number(get("day")),
      weekday: WEEKDAYS.indexOf(get("weekday")),
      offset: wall - (at - (at % 1000)),
    };
  }

  /** The moment `zone`'s wall clock reads that day's `hour`:`minute`. */
  function atWall(
    zone: string,
    day: { year: number; month: number; day: number },
    hour: number,
    minute: number
  ): number {
    const guess = Date.UTC(day.year, day.month, day.day, hour, minute);
    return guess - clockIn(zone, guess - clockIn(zone, guess).offset).offset;
  }

  export interface Schedule {
    kind: "day" | "week";
    /** Each run inside it, ms from the start, the next run first. */
    runs: number[];
    /** The strip's span from its start (now): a day or a week, ms. */
    span: number;
  }

  /** The cron forms the strip draws: a minute every hour, or a fixed time on some days. */
  interface Rule {
    days: Set<number>;
    hours: number[];
    minute: number;
  }

  /** A five-field cron as the strip reads it; null for a form it doesn't draw. */
  function ruleOf(cron: string): Rule | null {
    const [minute, hour, dom, month, dow, extra] = cron.trim().split(SPACES);
    const fixed = (field: string | undefined): field is string =>
      field !== undefined && NUMBER.test(field);
    if (!(
      extra === undefined &&
      dom === "*" &&
      month === "*" &&
      fixed(minute)
    )) {
      return null;
    }
    if (hour === "*" && dow === "*") {
      return {
        days: new Set([0, 1, 2, 3, 4, 5, 6]),
        hours: Array.from({ length: 24 }, (_, h) => h),
        minute: Number(minute),
      };
    }
    const days = dow === undefined ? null : daysOf(dow);
    return fixed(hour) && days
      ? { days, hours: [Number(hour)], minute: Number(minute) }
      : null;
  }

  /**
   * A routine's runs over the strip, read off its cron on its own zone's wall
   * clock (a daylight-saving change keeps the run at its wall time): a run at
   * a fixed time on some days of the week is a week's strip, every day or
   * every hour a day's. A cron of another form draws nothing (its words
   * stand).
   */
  export function scheduleRuns(
    cron: string,
    zone: string,
    now: number
  ): Schedule | null {
    const rule = ruleOf(cron);
    if (!rule) {
      return null;
    }
    const span = rule.days.size === 7 ? DAY : 7 * DAY;
    const runs = new Set<number>();
    // Every wall day the strip touches, the day before now's included.
    for (let k = -1; k <= span / DAY; k += 1) {
      const date = clockIn(zone, now + k * DAY);
      if (rule.days.has(date.weekday)) {
        for (const h of rule.hours) {
          runs.add(atWall(zone, date, h, rule.minute) - now);
        }
      }
    }
    return {
      kind: span === DAY ? "day" : "week",
      runs: [...runs]
        .filter((at) => at >= 0 && at < span)
        .sort((a, b) => a - b),
      span,
    };
  }
</script>

<script lang="ts">
  /**
   * A routine's schedule drawn as times on a line (DESIGN.md, The Show Don't
   * Tell Rule), on the relay bar's recipe and mapping (usage/Relay,
   * `barPlace`): a groove from now across the next day or week, each run a
   * 2px tick at its time, the next run in the strong ink and standing past
   * the groove. Under it (`compact` leaves them out, as a row's line does)
   * a hairline and its label where each day begins, or every six hours on a
   * day's strip, in the measured-figure face; "now" at its start. The words
   * are its accessible name and its tooltip.
   */
  import { barPlace } from "#lib/cawco/usage/bar-place.js";

  let {
    cron,
    zone,
    now,
    label,
    paused = false,
    compact = false,
  }: {
    cron: string;
    zone: string;
    now: number;
    /** The schedule in words: the strip's name. */
    label: string;
    /** Paused: its runs stand muted and none is next. */
    paused?: boolean;
    compact?: boolean;
  } = $props();

  const schedule = $derived(scheduleRuns(cron, zone, now));
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
        out.push({ at: hours * HOUR, text: `+${hours}h` });
      }
      out.push({ at: span, text: "+24h" });
      return out;
    }
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    for (let at = midnight.getTime() - now; at < span; at += DAY) {
      // A day beginning within a twentieth of the strip's start would sit on "now".
      if (at > span / 20) {
        out.push({ at, text: WEEKDAY.format(now + at) });
      }
    }
    return out;
  });
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
      class="relative block h-space-2 rounded-hair bg-border-control"
    >
      {#each schedule.runs as at, i (at)}
        {@const nextRun = i === 0 && !paused}
        <span
          data-run-tick
          class={[
            "absolute start-(--at) w-space-row -translate-x-1/2 rounded-hair",
            nextRun && "-inset-y-space-row bg-ink-strong",
            !nextRun && "inset-y-0",
            !nextRun && (paused ? "bg-ink-subtle" : "bg-ink-muted"),
          ]}
          data-at={at / schedule.span}
          data-next={nextRun ? "" : undefined}
          style:--at={place(at, schedule.span)}
        ></span>
      {/each}
    </span>
    {#if marks.length > 0}
      <span
        aria-hidden="true"
        class="relative block h-(--marks-h) type-meta num text-ink-subtle"
        style:--marks-h={"calc(var(--space-1) + var(--text-meta) * var(--leading-meta))"}
      >
        {#each marks as mark (mark.at)}
          <!-- mark-line: the hairline stands above its label, not beside it -->
          <span
            data-end={mark.at >= schedule.span || undefined}
            class="absolute inset-y-0 start-(--at) flex -translate-x-1/2 flex-col items-center not-data-end:data-start:translate-none not-data-end:data-start:items-start data-end:-translate-x-full data-end:items-end"
            data-start={mark.at === 0 || undefined}
            style:--at={place(mark.at, schedule.span)}
          >
            <span class="h-space-1 w-px flex-none bg-ink-subtle"></span>
            <span class="mono-figure whitespace-nowrap">{mark.text}</span>
          </span>
        {/each}
      </span>
    {/if}
  </span>
{/if}
