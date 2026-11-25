/**
 * What a task waits on (hub task-file.ts `waits_on:`) and what a plan step
 * waits on (`PlanStep.waitsOn`): one grammar, its kind read from the
 * handle's shape, never from a type field. The hub's task-waits.ts reads
 * what an agent writes into it and settles each target.
 *
 * | Kind    | An agent writes                                   | A file keeps                    |
 * | ------- | ------------------------------------------------- | ------------------------------- |
 * | task    | `tsk-12` (`#12`, `12`)                            | `12`                            |
 * | card    | `<page>#<card>`, the page by name, handle or id   | `<artifact id>#<card>`          |
 * | card    | `<page>#<card>=<option>`: only that pick settles it | `<artifact id>#<card>=<option>` |
 * | pin     | `<page>/<number>`                                 | `<artifact id>/<number>`        |
 * | pr      | `https://github.com/<owner>/<repo>/pull/<n>`      | the same                        |
 * | run     | `https://github.com/<owner>/<repo>/actions/runs/<n>` | the same                     |
 * | session | `<dir>#<id8>`, the handle CawCo's tools name it by | `<dir>#<session id>`           |
 * | time    | an ISO 8601 date or date-time (`2026-12-01`, `2026-12-01T09:00+03:00`) | the instant in UTC, `2026-12-01T06:00:00Z` |
 *
 * A date or date-time with no offset is UTC: the hub, the dashboard and the
 * task file read it as the same instant wherever they run. A day that is
 * not on the calendar (`2026-02-30`) reads as no date.
 *
 * A routine is a task (Projects spec §5.5): a wait on one names its task,
 * `tsk-12`, and settles once its task is done.
 *
 * A kept card's artifact and a kept session are whole ids, so `<uuid>#<card>`
 * and `<dir>#<uuid>` never read as each other.
 */
import { itemOfUrl, numberOf } from "@cawco/providers/registry";

export type WaitKind =
  "task" | "card" | "pin" | "pr" | "run" | "session" | "time";

export type WaitTarget =
  | { kind: "task"; id: string }
  | {
      kind: "card";
      artifactId: string;
      card: string;
      /** The one option whose pick settles it; any pick when absent. */
      option?: string;
    }
  | { kind: "pin"; artifactId: string; number: number }
  | { kind: "pr"; number: number; repo: string; url: string }
  | { kind: "run"; id: string; repo: string; url: string }
  | { kind: "session"; dir: string; instanceId: string }
  /** A date: settled once the instant, in ms since the epoch, has passed. */
  | { kind: "time"; at: number };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TASK = /^(?:tsk-|#)?(\d{1,9})$/iu;
const CARD = new RegExp(`^(${UUID})#([^#=\\s]+)(?:=([^#=\\s]+))?$`, "iu");
const SESSION = new RegExp(`^([^#\\s]*)#(${UUID})$`, "iu");
const PIN = new RegExp(`^(${UUID})/(\\d{1,6})$`, "iu");
const TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/iu;

/** A pull request or an Actions run on GitHub, by its URL; undefined for any other. */
export const githubTarget = (
  url: string
): Extract<WaitTarget, { kind: "pr" | "run" }> | undefined => {
  const item = itemOfUrl(url);
  if (item?.provider !== "github") {
    return;
  }
  const number = numberOf(item);
  if (item.kind === "pr" && number !== null) {
    return {
      kind: "pr",
      repo: item.container,
      number,
      url: `https://github.com/${item.container}/pull/${number}`,
    };
  }
  if (item.kind === "run") {
    return { kind: "run", repo: item.container, id: item.key, url: item.url };
  }
};

/**
 * An ISO 8601 date or date-time as a time target, UTC when it names no
 * offset; undefined when it is none, or names a day or hour the calendar
 * has not (`2026-02-30`, `24:00`). THE date reader: a `waits_on` date and a
 * waiting stage's `until:` field (hub waits.ts) both read here.
 */
export const timeTarget = (
  written: string
): Extract<WaitTarget, { kind: "time" }> | undefined => {
  const found = TIME.exec(written.trim());
  if (!found) {
    return;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0", fraction = "", zone] = found;
  const parts = [y, mo, d, h, mi, s].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(wall);
  const onCalendar =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day &&
    back.getUTCHours() === hour &&
    back.getUTCMinutes() === minute &&
    back.getUTCSeconds() === second;
  if (!onCalendar) {
    return;
  }
  const ms = Math.floor(Number(`0.${fraction || "0"}`) * 1000);
  return { kind: "time", at: wall + ms - offsetMs(zone) };
};

/** A written offset (`Z`, `+03:00`, `-0500`) in ms east of UTC; none is UTC. */
const offsetMs = (zone: string | undefined): number => {
  if (!zone || zone.toUpperCase() === "Z") {
    return 0;
  }
  const digits = zone.slice(1).replace(":", "");
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
  return (zone[0] === "-" ? -1 : 1) * minutes * 60_000;
};

/** A time target's instant as a file keeps it: UTC, whole seconds bare (`2026-12-01T06:00:00Z`). */
const timeHandle = (at: number): string =>
  new Date(at).toISOString().replace(".000Z", "Z");

/** A task named as a wait (`tsk-12`, `#12`, `12`), as `tsk-12`; undefined when it names none. */
export const taskTarget = (handle: string): string | undefined => {
  const found = TASK.exec(handle.trim());
  return found ? `tsk-${Number(found[1])}` : undefined;
};

/** A wait as a file keeps it, read back; undefined when its shape is none of the seven. */
export const waitTarget = (handle: string): WaitTarget | undefined => {
  const kept = handle.trim();
  const time = timeTarget(kept);
  if (time) {
    return time;
  }
  const task = taskTarget(kept);
  if (task) {
    return { kind: "task", id: task };
  }
  const github = githubTarget(kept);
  if (github) {
    return github;
  }
  const pin = PIN.exec(kept);
  if (pin) {
    return {
      kind: "pin",
      artifactId: pin[1].toLowerCase(),
      number: Number(pin[2]),
    };
  }
  const card = CARD.exec(kept);
  if (card) {
    return {
      kind: "card",
      artifactId: card[1].toLowerCase(),
      card: card[2],
      ...(card[3] ? { option: card[3] } : {}),
    };
  }
  const session = SESSION.exec(kept);
  if (session) {
    return {
      kind: "session",
      dir: session[1],
      instanceId: session[2].toLowerCase(),
    };
  }
};

/** A wait as a file keeps it and every answer names it: one string per target. */
export const waitHandle = (target: WaitTarget): string => {
  switch (target.kind) {
    case "task":
      return target.id;
    case "card":
      return `${target.artifactId}#${target.card}${target.option ? `=${target.option}` : ""}`;
    case "pin":
      return `${target.artifactId}/${target.number}`;
    case "pr":
    case "run":
      return target.url;
    case "session":
      return `${target.dir}#${target.instanceId}`;
    case "time":
      return timeHandle(target.at);
  }
};

/** The artifact a card or pin wait stands on, by its whole id; undefined for any other wait. */
export const waitArtifact = (handle: string): string | undefined => {
  const target = waitTarget(handle);
  return target?.kind === "card" || target?.kind === "pin"
    ? target.artifactId
    : undefined;
};
