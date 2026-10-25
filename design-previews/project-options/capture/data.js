/**
 * The project's real records (../data/tasks.json, the hub's own task files
 * for Cawco-Dev as they stood on 2026-10-25) and the three states the
 * preview draws them in:
 *
 * - `rest`: his board as it is today: 30 Ready, 33 Done, nothing waiting.
 * - `waits`: drawn for the state (no task of his waits today): tsk-17's
 *   session asks him, standing in Working, and tsk-16, whose attempt handed
 *   in its result on 16 Oct, standing in Review. Every word on them is their
 *   record's; what no record holds (the session's ask) is a «slot».
 * - `stale`: his board as it is today, drawn under a read that failed; tsk-3
 *   carries the item-sized failure (its file didn't read), drawn for the state.
 *
 * Times are said in the owner's zone (Asia/Qatar), as the dashboard says
 * them in his browser.
 */
import data from "../data/tasks.json";

export const TASKS = data.tasks;
export const byId = (id) => TASKS.find((task) => task.id === id);

const ZONE = "Asia/Qatar";
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: ZONE,
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: ZONE,
});
export const day = (ms) => dayFormat.format(ms);
export const clock = (ms) => clockFormat.format(ms);
export const dayClock = (ms) => `${day(ms)} ${clock(ms)}`;

/** How long, said short: "4 min", "17 h". */
export function took(from, to) {
  const minutes = Math.round((to - from) / 60_000);
  if (minutes < 1) {
    return "under a minute";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.round(minutes / 60)} h`;
}

/** His stages, as stages.md names them (the live board's columns). */
export const STAGES = [
  { key: "ready", name: "Ready", kind: "todo" },
  { key: "working", name: "Working", kind: "active" },
  { key: "review", name: "Review", kind: "you" },
  { key: "done", name: "Done", kind: "done" },
  { key: "dropped", name: "Dropped", kind: "dropped" },
];

/** The project's views, as the live strip names them; Decisions' 9 is the live page's. */
export const VIEWS = [
  { name: "Board", count: 0 },
  { name: "Table", count: 0 },
  { name: "Routines", count: 0 },
  { name: "Decisions", count: 9 },
  { name: "Canvas", count: 0 },
  { name: "Calendar", count: 0 },
];

export const PROJECT = {
  title: "Cawco-Dev",
  machine: "obelisk-of-light",
  os: "linux-x64",
  /** The live head's "51 places": this machine and 50 more. */
  more: 50,
  folder: "/home/bewinxed/cockpit",
};

/** The last attempt that ended with a word (Stopped), if it is the last one. */
function lastStopped(task) {
  const last = task.attempts.at(0);
  return last && last.endedHow === "Stopped" ? last : null;
}

/**
 * The one mark a card wears, by the advisor's precedence (asks, review,
 * failed, stopped, working, queued, after, can't start, done, sent back,
 * dropped), from what the hub records; a plain Ready card has none.
 */
export function markOf(task, state) {
  if (state === "waits" && task.id === "tsk-17") {
    return { kind: "asks", word: "asks", drawn: true };
  }
  if (state === "waits" && task.id === "tsk-16") {
    return { kind: "review", word: "review", when: day(task.result.at), drawn: true };
  }
  if (task.stage === "done") {
    return { kind: "done", when: day(task.completedAt ?? task.result?.at) };
  }
  const stopped = lastStopped(task);
  if (stopped) {
    return { kind: "stopped", word: "Stopped", when: day(stopped.endedAt) };
  }
  return null;
}

/** Each stage's cards in the state asked for. */
export function board(state) {
  const columns = Object.fromEntries(STAGES.map((stage) => [stage.key, []]));
  for (const task of TASKS) {
    let stage = task.stage;
    if (state === "waits" && task.id === "tsk-17") {
      stage = "working";
    }
    if (state === "waits" && task.id === "tsk-16") {
      stage = "review";
    }
    columns[stage].push({
      task,
      mark: markOf(task, state),
      fault: state === "stale" && task.id === "tsk-3",
    });
  }
  return columns;
}

/**
 * Which drawing of a card an item takes: its own id, or, where the state
 * drew it differently (a mark drawn for the state, the failed read), the id
 * and that drawing. The stage draws each once; the frame sets each in place.
 */
export function cardKey(item, ask) {
  if (item.mark?.drawn) {
    return item.mark.kind === "asks"
      ? `${item.task.id}:asks:${ask}`
      : `${item.task.id}:${item.mark.kind}`;
  }
  return item.fault ? `${item.task.id}:fault` : item.task.id;
}

/** Every drawing of a card any state or ask needs, once each. */
export function cardDrawings() {
  const seen = new Map();
  for (const state of ["rest", "waits", "stale"]) {
    for (const ask of ["C1", "C2"]) {
      for (const items of Object.values(board(state))) {
        for (const item of items) {
          seen.set(cardKey(item, ask), { item, ask });
        }
      }
    }
  }
  return [...seen].map(([key, value]) => ({ key, ...value }));
}

/** How many things wait on him in a state. */
export const waiting = (state) => (state === "waits" ? 2 : 0);
