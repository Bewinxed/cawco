<script lang="ts">
  /**
   * The project's day on one line (Option 2's one time drawing): the last
   * 24 hours left of now and the next 24 right of it, on the person's clock.
   * It answers three questions at a glance, and nothing else:
   * - did anything fail while I was away: a run that delivered or failed is
   *   a full mark above the line, runs close in time stacked (as
   *   Cronomicon's Score stacks them), a failure in the failure's glyph and
   *   named in words over its stack;
   * - what runs next: what is to come stands right of now, hollow, each
   *   named over its mark, the soonest first;
   * - quiet or busy: a look that answered "not yet" is a tick under the
   *   line, so a routine that keeps looking reads as a steady comb, and an
   *   empty stretch reads as quiet.
   * A full mark is a button that opens its run; a mark to come opens its
   * routine. The ticks are drawn only: What ran folds them, each openable.
   */
  import { DAY_MS, HOUR_MS } from "@cawco/core/time";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import {
    clockOf,
    comingRuns,
    ENDING_WORD,
    isFail,
    isFull,
    NOW,
    nearTime,
    type Run,
    routineOf,
  } from "./day";
  import RunGlyph from "./RunGlyph.svelte";

  let {
    runs,
    now = NOW,
    onopenrun,
    onopenroutine,
  }: {
    runs: Run[];
    now?: number;
    onopenrun: (id: string) => void;
    onopenroutine: (id: string) => void;
  } = $props();

  const from = $derived(now - DAY_MS);
  const to = $derived(now + DAY_MS);
  /** A time's place along the line, in percent. */
  const x = (t: number) => ((t - from) / (to - from)) * 100;

  const past = $derived(runs.filter((run) => run.at >= from && run.at <= now));
  const full = $derived(past.filter((run) => isFull(run.ending)));
  const ticks = $derived(past.filter((run) => !isFull(run.ending)));
  const coming = $derived(comingRuns(now));
  const comingFull = $derived(coming.filter((one) => one.routineId !== "npm"));
  const comingTicks = $derived(coming.filter((one) => one.routineId === "npm"));

  /** Full marks within half an hour of each other stand in one stack, oldest at the foot. */
  const stacks = $derived.by(() => {
    const sorted = [...full].sort((a, b) => a.at - b.at);
    const out: Run[][] = [];
    for (const run of sorted) {
      const last = out.at(-1);
      if (last && run.at - (last[0]?.at ?? run.at) <= HOUR_MS / 2) {
        last.push(run);
      } else {
        out.push([run]);
      }
    }
    return out;
  });

  /** What a failed stack says over it: the routine, and how often. */
  function failWords(stack: Run[]): string | null {
    const failed = stack.filter((run) => isFail(run.ending));
    if (failed.length === 0) {
      return null;
    }
    const [first] = failed;
    const { name } = routineOf(first.routineId);
    const word =
      first.ending === "couldNotCheck" ? "could not check" : "failed";
    if (failed.length === 1) {
      return `${name} ${word}`;
    }
    const often = failed.length === 2 ? "twice" : `${failed.length} times`;
    return `${name} ${word} ${often}`;
  }

  /** The hours labelled under the line: every 3, a day's start named. */
  const hours = $derived.by(() => {
    const first = Math.ceil(from / (3 * HOUR_MS)) * 3 * HOUR_MS;
    const out: { at: number; label: string; day: boolean }[] = [];
    for (let t = first; t <= to; t += 3 * HOUR_MS) {
      const midnight = new Date(t).getUTCHours() === 0;
      out.push({
        at: t,
        label: midnight
          ? new Intl.DateTimeFormat("en-GB", {
              weekday: "short",
              timeZone: "UTC",
            }).format(t)
          : clockOf(t),
        day: midnight,
      });
    }
    return out;
  });

  /** The line's width in px, for laying its words out. */
  let width = $state(0);
  const measure = frameSize(
    (node: HTMLElement) => node.clientWidth,
    (value) => {
      width = value;
    }
  );
  /** A meta line's average letter, in px: enough to keep two words apart. */
  const LETTER = 6.6;
  const GAP = 12;

  /**
   * The words over the line: each failed stack named, each run to come
   * named with its time. Each stands on the first of two rows where it
   * clears the one before it, starting at its mark, or ending there where
   * the line's end leaves it no room; with no row clear it is cut short.
   */
  const labels = $derived.by(() => {
    const wanted = [
      ...stacks.flatMap((stack) => {
        const text = failWords(stack);
        return text
          ? [{ key: stack[0].id, at: stack[0].at, time: "", text, fail: true }]
          : [];
      }),
      ...comingFull.map((one) => ({
        key: one.routineId,
        at: one.at,
        time: clockOf(one.at),
        text: routineOf(one.routineId).name,
        fail: false,
      })),
    ].sort((a, b) => a.at - b.at);
    const ends = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const place = (px: number, w: number) => {
      const startAt = px + w <= width ? px : px - w;
      return { startAt, row: ends.findIndex((end) => startAt >= end + GAP) };
    };
    return wanted.map((one) => {
      const px = (x(one.at) / 100) * width;
      let w = (one.time.length + one.text.length + 1) * LETTER;
      let { text } = one;
      let spot = place(px, w);
      // No row clear: a run to come says its time alone.
      if (spot.row === -1 && one.time) {
        w = one.time.length * LETTER;
        text = "";
        spot = place(px, w);
      }
      const row = spot.row === -1 ? 1 : spot.row;
      const room = spot.row === -1 ? Math.max(0, px - ends[1] - GAP) : w + GAP;
      ends[row] = spot.startAt + Math.min(w, room);
      return { ...one, text, row, end: spot.startAt < px, room };
    });
  });

  const failedCount = $derived(full.filter((run) => isFail(run.ending)).length);
  const summary = $derived(
    `The last 24 hours: ${full.length} runs left a result, ${failedCount} of them failed, and ${ticks.length} looks said not yet. The next 24 hours: ${comingFull.map((one) => `${routineOf(one.routineId).name} ${nearTime(one.at, now)}`).join(", ")}, and a look every 15 minutes.`
  );
</script>

<figure data-slot="day-line" class="m-0 flex flex-col gap-space-1">
  <figcaption class="sr-only">{summary}</figcaption>
  <div
    class="relative h-(--line-h) w-full"
    {@attach measure}
    style:--lane-h={"calc(18 * var(--spacing) + 2 * var(--spacing-space-1))"}
    style:--line-h={"calc(var(--spacing-space-6) + var(--lane-h) + var(--spacing-space-2) + var(--spacing-space-3))"}
  >
    <!-- The axis. -->
    <div
      aria-hidden="true"
      class="absolute inset-x-0 top-(--axis) h-px bg-border-control"
      style:--axis={"calc(var(--spacing-space-6) + var(--lane-h) + var(--spacing-space-1))"}
    ></div>

    <!-- The hour grid. -->
    {#each hours as hour (hour.at)}
      <div
        aria-hidden="true"
        class={[
          "start-(--at)",
          "absolute top-space-6 bottom-0 w-px",
          hour.day ? "bg-border-control" : "bg-border-hairline",
        ]}
        style:--at={`${x(hour.at)}%`}
      ></div>
    {/each}

    <!-- Now. -->
    <div
      aria-hidden="true"
      class="absolute top-space-5 bottom-0 start-1/2 w-0.5 -translate-x-1/2 rounded-pill bg-ink-strong"
    ></div>

    <!-- Looks that said not yet: ticks under the line, past ones at full tick ink, coming ones faint. -->
    {#each ticks as run (run.id)}
      <div
        aria-hidden="true"
        class="start-(--at) absolute top-(--tick) h-space-3 w-px bg-ink-subtle"
        style:--tick={"calc(var(--spacing-space-6) + var(--lane-h) + var(--spacing-space-1) + 1px)"}
        style:--at={`${x(run.at)}%`}
      ></div>
    {/each}
    {#each comingTicks as one (one.at)}
      <div
        aria-hidden="true"
        class="start-(--at) absolute top-(--tick) h-space-2 w-px bg-border-control"
        style:--tick={"calc(var(--spacing-space-6) + var(--lane-h) + var(--spacing-space-1) + 1px)"}
        style:--at={`${x(one.at)}%`}
      ></div>
    {/each}

    <!-- Runs that left a result, stacked. -->
    {#each stacks as stack (stack[0].id)}
      <div
        class="start-(--at) absolute top-0 flex h-(--stack-h) -translate-x-1/2 flex-col-reverse items-center justify-start gap-space-1"
        style:--stack-h={"calc(var(--spacing-space-6) + var(--lane-h))"}
        style:--at={`${x(stack[0].at)}%`}
      >
        {#each stack as run (run.id)}
          {@const routine = routineOf(run.routineId)}
          <Tip
            label="{ENDING_WORD[run.ending]}, {nearTime(run.at, now)}"
            title={routine.name}
          >
            {#snippet children(tip)}
              <Button
                {...tip}
                aria-label="Open the run of {routine.name}, {ENDING_WORD[
                  run.ending
                ]} {nearTime(run.at, now)}"
                press="scale"
                size="icon-xs"
                variant="ghost"
                onclick={() => onopenrun(run.id)}
              >
                <RunGlyph mark={run.ending} size="sm" />
              </Button>
            {/snippet}
          </Tip>
        {/each}
      </div>
    {/each}

    <!-- What is to come: hollow. -->
    {#each comingFull as one (one.routineId)}
      {@const routine = routineOf(one.routineId)}
      <div
        class="start-(--at) absolute top-0 flex h-(--stack-h) -translate-x-1/2 flex-col-reverse items-center gap-space-1"
        style:--stack-h={"calc(var(--spacing-space-6) + var(--lane-h))"}
        style:--at={`${x(one.at)}%`}
      >
        <Tip label="Next, {nearTime(one.at, now)}" title={routine.name}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label="Open {routine.name}, next {nearTime(one.at, now)}"
              press="scale"
              size="icon-xs"
              variant="ghost"
              onclick={() => onopenroutine(routine.id)}
            >
              <RunGlyph mark="coming" size="sm" />
            </Button>
          {/snippet}
        </Tip>
      </div>
    {/each}

    <!-- The words over the line. -->
    {#each labels as label (label.key)}
      <span
        aria-hidden="true"
        class={[
          "start-(--at)",
          "absolute max-w-(--room) truncate type-meta whitespace-nowrap",
          label.row === 0 ? "top-0" : "top-space-6",
          label.end ? "-translate-x-full" : "",
          label.fail ? "font-medium text-status-fail-ink" : "text-ink-muted",
        ]}
        style:--room={`${label.room}px`}
        style:--at={`${x(label.at)}%`}
        >{#if label.time}<span class="num text-ink-strong">{label.time}</span
          >{label.text ? " " : ""}{/if}{label.text}</span
      >
    {/each}
  </div>

  <!-- The hours, on the person's clock; now named where it stands. -->
  <div aria-hidden="true" class="relative h-lh type-meta">
    {#each hours as hour (hour.at)}
      {#if Math.abs(hour.at - now) > 2 * HOUR_MS}
        <span
          class={[
            "start-(--at)",
            "absolute -translate-x-1/2 num whitespace-nowrap",
            hour.day ? "font-medium text-ink-strong" : "text-ink-subtle",
          ]}
          style:--at={`${x(hour.at)}%`}>{hour.label}</span
        >
      {/if}
    {/each}
    <span
      class="absolute start-1/2 -translate-x-1/2 num font-medium whitespace-nowrap text-ink-strong"
      >Now {clockOf(now)}</span
    >
  </div>
</figure>
