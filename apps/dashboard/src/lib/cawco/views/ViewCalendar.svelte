<script lang="ts" module>
  import type { ViewTask } from "@cawco/core/views";

  /** A task's own dates, the ones the hub keeps for every task left out. */
  const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
  const KEPT_DATES = new Set([
    "createdAt",
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
   * or its month grid for a view that asks for a month (`range`), a list of
   * the week or month under 640px. Each task is placed by its date field;
   * a task without one is left off. A chip is the task's title in the label
   * role: set for later on the raised surface with the control edge, done in
   * the done pair, waiting on you in the attention pair. A chip opens the
   * task's sheet. The library's sheet, its palette included, stands in the
   * `vendor` layer (vite.config.ts vendorComponentSheets wraps the sheet its
   * Calendar imports); its variables take the tokens in app.css's
   * components layer, on the `.ec` element its palette declares them on,
   * under this host's `data-slot`.
   */
  import { Calendar, DayGrid, List, TimeGrid } from "@event-calendar/core";
  import { MediaQuery } from "svelte/reactivity";

  let {
    tasks,
    field,
    range = "week",
    onopen,
  }: {
    tasks: ViewTask[];
    /** The date field that places a task. */
    field: string;
    /** How much it shows at once: a week (the project's Calendar), or a month. */
    range?: "week" | "month";
    onopen: (id: string) => void;
  } = $props();

  const month = $derived(range === "month");
  /** Each width's view of the range: a grid on a desk, a list on a phone. */
  const shownView = $derived.by(() => {
    if (narrow.current) {
      return month ? "listMonth" : "listWeek";
    }
    return month ? "dayGridMonth" : "timeGridWeek";
  });

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
    view: shownView,
    date: first,
    events,
    // The week's hours scroll inside the grid; a month's weeks stand whole.
    height: narrow.current || month ? "auto" : "40rem",
    headerToolbar: { start: "title", center: "", end: "today prev,next" },
    buttonText: (text: Record<string, string>) => ({
      ...text,
      today: month ? "This month" : "This week",
    }),
    allDayContent: "All day",
    scrollTime: "08:00:00",
    nowIndicator: true,
    eventClick: (info: { event: { id: string | number } }) => {
      onopen(String(info.event.id));
    },
  });
</script>

<div data-slot="view-calendar">
  <Calendar {options} plugins={[TimeGrid, DayGrid, List]} />
</div>
