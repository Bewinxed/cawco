<script lang="ts" module>
  import type { ViewTask } from "@cawco/core";

  /** A task's own dates, the ones the hub keeps for every task left out. */
  const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const KEPT_DATES = new Set([
    "updatedAt",
    "attemptStartedAt",
    "attemptEndedAt",
  ]);

  /**
   * The date field the calendar places tasks by (design §2): the one the
   * stages file names for its calendar view, else the first date a task's
   * file carries. Null when there is none, and the Calendar tab is absent.
   */
  export function calendarField(
    tasks: ViewTask[],
    named: string | null
  ): string | null {
    if (named) {
      return named;
    }
    for (const task of tasks) {
      const field = Object.keys(task.dates).find((key) => !KEPT_DATES.has(key));
      if (field) {
        return field;
      }
    }
    return null;
  }
</script>

<script lang="ts">
  /**
   * The calendar view: Event Calendar's week grid (PRD §5.2, MIT, Svelte 5),
   * a list of the week under 640px. Each task is placed by its date field;
   * a task without one is left off. A chip is the task's title in the label
   * role: set for later on the raised surface with the control edge, done in
   * the done pair, waiting on you in the attention pair. A chip opens the
   * task's sheet. The library's palette is not loaded (vite.config.ts); its
   * variables take the tokens here.
   */
  import { Calendar, List, TimeGrid } from "@event-calendar/core";
  import "../../../../node_modules/@event-calendar/core/src/styles/index.css";
  import { MediaQuery } from "svelte/reactivity";

  let {
    tasks,
    field,
    onopen,
  }: {
    tasks: ViewTask[];
    /** The date field that places a task. */
    field: string;
    onopen: (id: string) => void;
  } = $props();

  const narrow = new MediaQuery("(max-width: 639px)");
  const HALF_HOUR = 30 * 60_000;

  /** A date with no time of day is a whole day's (`2026-10-08`). */
  const dayOnly = (task: ViewTask): boolean =>
    DAY_ONLY.test(task.fields[field] ?? "");
  /** A chip's pair: done, waiting on you, or set for later. */
  const TONE: Partial<Record<string, string>> = {
    done: "chip-done",
    you: "chip-attn",
  };

  const events = $derived(
    tasks.flatMap((task) => {
      const at = task.dates[field];
      if (at === undefined) {
        return [];
      }
      const tone = TONE[task.kind ?? ""] ?? "chip-set";
      return [
        {
          id: task.id,
          title: task.title,
          start: new Date(at),
          end: new Date(at + HALF_HOUR),
          allDay: dayOnly(task),
          classNames: ["chip", tone],
        },
      ];
    })
  );

  /** The first placed task's week, so the calendar opens where the work is. */
  const first = $derived(
    events.length > 0
      ? new Date(Math.min(...events.map((event) => event.start.getTime())))
      : new Date()
  );

  const options = $derived({
    view: narrow.current ? "listWeek" : "timeGridWeek",
    date: first,
    events,
    height: narrow.current ? "auto" : "40rem",
    headerToolbar: { start: "title", center: "", end: "today prev,next" },
    buttonText: (text: Record<string, string>) => ({
      ...text,
      today: "This week",
    }),
    allDayContent: "All day",
    scrollTime: "08:00:00",
    nowIndicator: true,
    eventClick: (info: { event: { id: string | number } }) => {
      onopen(String(info.event.id));
    },
  });
</script>

<div class="view-calendar">
  <Calendar {options} plugins={[TimeGrid, List]} />
</div>

<style>
  /* The library's variables, from the tokens (its theme.css is not loaded). */
  .view-calendar :global(.ec) {
    --ec-bg-color: var(--surface-raised);
    --ec-text-color: var(--ink-strong);
    --ec-border-color: var(--border-hairline);
    --ec-color-400: var(--border-control);
    --ec-color-300: var(--border-hairline);
    --ec-color-200: var(--surface-hover);
    --ec-color-100: var(--surface-band);
    --ec-color-50: var(--surface-band);
    --ec-button-bg-color: var(--surface-raised);
    --ec-button-border-color: var(--border-control);
    --ec-button-text-color: var(--ink-strong);
    --ec-button-active-bg-color: var(--surface-hover);
    --ec-button-active-border-color: var(--border-control);
    --ec-button-active-text-color: var(--ink-strong);
    --ec-today-bg-color: var(--surface-band);
    --ec-highlight-color: var(--surface-hover);
    --ec-event-bg-color: var(--surface-raised);
    --ec-event-text-color: var(--ink-strong);
    --ec-bg-event-color: var(--surface-band);
    --ec-bg-event-opacity: 1;
    --ec-event-col-gap: var(--space-1);
    --ec-now-indicator-color: var(--brand-solid);
    --ec-popup-bg-color: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-meta);
  }
  .view-calendar :global(.ec-toolbar) {
    margin-block-end: var(--space-3);
  }
  .view-calendar :global(.ec-title) {
    font: var(--type-title);
  }
  .view-calendar :global(.ec-button) {
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
    font: var(--type-label);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .view-calendar :global(.ec-button-group .ec-button:first-child) {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }
  .view-calendar :global(.ec-button-group .ec-button:last-child) {
    border-start-start-radius: 0;
    border-end-start-radius: 0;
  }
  .view-calendar :global(.ec-main) {
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .view-calendar :global(.ec-day-head),
  .view-calendar :global(.ec-slots),
  .view-calendar :global(.ec-all-day) {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* A chip: as tall as the library makes its slot (a task is a half-hour
     event, one slot), the time and title in the label role on one line,
     the title cut short with an ellipsis where the slot is narrow. */
  .view-calendar :global(.ec-event.chip) {
    padding: 0 var(--space-2);
    align-items: center;
    overflow: hidden;
    border-radius: var(--radius-xs);
    font: var(--type-label);
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
  }
  .view-calendar :global(.ec-time-grid .ec-event.chip .ec-event-body) {
    flex-direction: row;
    align-items: center;
    min-inline-size: 0;
  }
  /* In the week's grid the chip's place is its time: the title has the
     whole line. The list keeps the time, in its own column. */
  .view-calendar :global(.ec-time-grid .ec-event.chip .ec-event-time) {
    display: none;
  }
  .view-calendar :global(.ec-event.chip .ec-event-title) {
    min-inline-size: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view-calendar :global(.ec-event.chip-set) {
    background: var(--surface-raised);
    color: var(--ink-strong);
    box-shadow: inset 0 0 0 1px var(--border-control);
  }
  .view-calendar :global(.ec-event.chip-done) {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
  .view-calendar :global(.ec-event.chip-attn) {
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .view-calendar :global(.ec-list .ec-event.chip) {
    min-block-size: var(--c-btn-h-lg);
    margin-inline: var(--space-2);
    border-radius: var(--radius-xs);
  }
  .view-calendar :global(.ec-event-time) {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-variant-ligatures: none;
    margin-inline-end: var(--space-2);
  }
</style>
