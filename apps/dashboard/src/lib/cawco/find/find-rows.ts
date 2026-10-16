/**
 * The one row recipe every finder list draws (the critique's must-fix 2):
 * line 1 a glyph, the title in its own words and the age; line 2 the state
 * word first, then project, who started it and machine; line 3, only when
 * the match came from a purpose, a report or a moment, the reason it is
 * here. Find, its doorway, Go-to, Waiting for you and the @ menu all build
 * their rows here, so one session reads the same everywhere.
 *
 * Words are DESIGN.md's state words (Working, Needs you, Idle, Sleeping,
 * Stopped, Failed, Unreachable) and WORDS.md's nouns (session, delegate,
 * thread, task, routine, preview, decision, report, machine, project).
 */
import type { ArtifactKind } from "@cawco/core";
import type { Component } from "svelte";
import Routine from "~icons/solar/calendar-bold-duotone";
import Task from "~icons/solar/checklist-minimalistic-bold-duotone";
import Failed from "~icons/solar/close-circle-bold-duotone";
import File from "~icons/solar/code-file-bold-duotone";
import Commit from "~icons/solar/code-square-bold-duotone";
import Report from "~icons/solar/document-bold-duotone";
import Page from "~icons/solar/document-text-bold-duotone";
import Project from "~icons/solar/folder-bold-duotone";
import NeedsYou from "~icons/solar/hand-shake-bold-duotone";
import Decision from "~icons/solar/list-check-bold-duotone";
import Sleeping from "~icons/solar/moon-sleep-bold-duotone";
import Idle from "~icons/solar/pause-circle-bold-duotone";
import Canvas from "~icons/solar/pen-new-square-bold-duotone";
import Unreachable from "~icons/solar/question-circle-bold-duotone";
import Working from "~icons/solar/refresh-circle-bold-duotone";
import Machine from "~icons/solar/server-bold-duotone";
import Sheet from "~icons/solar/widget-4-bold-duotone";
import Preview from "~icons/solar/window-frame-bold-duotone";
import type {
  FindArtifact,
  FindChange,
  FindConversation,
  FindLiveState,
  FindMachine,
  FindMoment,
  FindProject,
  FindResult,
  FindRoutine,
  FindTask,
  FindThread,
  WaitingItem,
} from "./find-client";

/** How a word on line 2 is tinted: only a state that asks something takes a hue. */
export type Tone = "live" | "attn" | "fail" | "quiet";

export interface Excerpt {
  /** Plain runs and matched runs, in order: matched ones are drawn strong. */
  parts: { matched: boolean; text: string }[];
  /** Who said it, or what matched: "you", "report", "purpose", … */
  source: string;
}

export interface Row {
  /** When it last moved, ms; null when unknown. */
  at: number | null;
  /** The glyph breathes (live work, DESIGN.md "Live work breathes"). */
  breathes: boolean;
  glyph: Component;
  /** Stable across answers, so a row that stays is the same row. */
  key: string;
  /** Line 2's words, the state word first. */
  meta: string[];
  reason: Excerpt | null;
  /** Read out whole by a screen reader. */
  spoken: string;
  /** The state word (or a thing's own first word) and its tone. */
  state: { tone: Tone; word: string };
  title: string;
}

interface Shape {
  glyph: Component;
  tone: Tone;
  word: string;
}

const STATE: Record<FindLiveState, Shape> = {
  working: { glyph: Working, tone: "live", word: "Working" },
  "needs-you": { glyph: NeedsYou, tone: "attn", word: "Needs you" },
  idle: { glyph: Idle, tone: "quiet", word: "Idle" },
  sleeping: { glyph: Sleeping, tone: "quiet", word: "Sleeping" },
  ended: { glyph: Idle, tone: "quiet", word: "Stopped" },
  unknown: { glyph: Unreachable, tone: "quiet", word: "Unreachable" },
};

/** A thread's state on a session's scale: Caw at work, waiting on him, or at rest. */
const THREAD: Record<FindThread["state"], Shape> = {
  working: STATE.working,
  "needs-you": STATE["needs-you"],
  ready: STATE.idle,
};

const OPEN = "「";
const CLOSE = "」";
const WENT_WRONG = /fail|error/i;

/** An excerpt's matched terms, from the engine's 「 」 marks. */
export function excerptParts(text: string): Excerpt["parts"] {
  const parts: Excerpt["parts"] = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf(OPEN);
    if (open === -1) {
      parts.push({ matched: false, text: rest });
      break;
    }
    const close = rest.indexOf(CLOSE, open + 1);
    if (close === -1) {
      parts.push({ matched: false, text: rest.replace(OPEN, "") });
      break;
    }
    if (open > 0) {
      parts.push({ matched: false, text: rest.slice(0, open) });
    }
    parts.push({ matched: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return parts;
}

const AUTHOR: Record<FindMoment["author"], string> = {
  owner: "you",
  agent: "agent",
  report: "report",
  injected: "injected",
  caw: "Caw",
};

export const momentReason = (moment: FindMoment): Excerpt => ({
  source: AUTHOR[moment.author],
  parts: excerptParts(moment.excerpt),
});

/** The plain words an excerpt reads as. */
export const excerptText = (excerpt: Excerpt): string =>
  excerpt.parts.map((p) => p.text).join("");

/** Who started it, in the row's words. */
function roleOf(c: FindConversation): string {
  switch (c.role) {
    case "delegate":
      return c.parent ? `delegate of ${c.parent.title}` : "delegate";
    case "attempt":
      return c.task ? `attempt at ${c.task.taskId}` : "attempt";
    case "spin-off":
      return c.parent ? `spin-off of ${c.parent.title}` : "spin-off";
    default:
      return "yours";
  }
}

const plain = (source: string, text: string): Excerpt => ({
  source,
  parts: [{ matched: false, text }],
});

/**
 * Why a hub-side match is here, when its title alone does not say it: its
 * purpose or its last report matched the words, or a moment did.
 */
function nameReason(c: FindConversation): Excerpt | null {
  if (c.matched.includes("title")) {
    return null;
  }
  if (c.matched.includes("purpose") && c.purpose) {
    return plain("purpose", c.purpose);
  }
  if (c.matched.includes("report") && c.lastReport) {
    return plain("report", c.lastReport.headline);
  }
  const [moment] = c.moments;
  return moment ? momentReason(moment) : null;
}

/** Ages as the board says them: 2m, 41m, 3h, 6d, then the date. */
export function age(at: number | null, now: number): string {
  if (at === null) {
    return "";
  }
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) {
    return "now";
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h`;
  }
  if (s < 7 * 86_400) {
    return `${Math.floor(s / 86_400)}d`;
  }
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const words = (...all: (string | null | undefined)[]): string[] =>
  all.filter((w): w is string => Boolean(w));

type Drawn = Omit<Row, "spoken" | "key" | "at">;

function finish(
  result: FindResult | WaitingItem,
  at: number | null,
  drawn: Drawn,
  now: number
): Row {
  const row = { ...drawn, key: `${result.kind}:${result.id}`, at };
  return {
    ...row,
    spoken: [
      row.title,
      row.state.word,
      ...row.meta,
      at === null ? "" : `${age(at, now)} ago`,
      row.reason ? `${row.reason.source}: ${excerptText(row.reason)}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  };
}

const ARTIFACT: Record<ArtifactKind, { glyph: Component; noun: string }> = {
  page: { glyph: Page, noun: "page" },
  canvas: { glyph: Canvas, noun: "canvas" },
  preview: { glyph: Preview, noun: "preview" },
  sheet: { glyph: Sheet, noun: "sheet" },
};

const STAGE_KIND_WORD: Record<string, string> = {
  you: "Waits on you",
  active: "Active",
  waiting: "Waiting",
  todo: "To do",
  done: "Done",
  dropped: "Dropped",
};

type Reason = "name" | "moment";

/**
 * A session the hub never ran (started from a terminal): the hub can say
 * where it was run, not whether it runs now, so the row says that and no
 * live state. It cannot be named in a message (no handle); it opens by its
 * session id, machine and folder.
 */
const TERMINAL: Shape = {
  glyph: Unreachable,
  tone: "quiet",
  word: "From a terminal",
};

function conversationRow(r: FindConversation, reason: Reason): Drawn {
  const fromTerminal = r.instanceId === null;
  const s = fromTerminal ? TERMINAL : STATE[r.state];
  const [moment] = r.moments;
  return {
    title: r.title,
    glyph: s.glyph,
    breathes: r.state === "working",
    state: { word: s.word, tone: s.tone },
    meta: words(
      r.project?.name,
      fromTerminal ? null : roleOf(r),
      r.machine.name
    ),
    reason:
      reason === "moment" && moment ? momentReason(moment) : nameReason(r),
  };
}

function threadRow(r: FindThread): Drawn {
  const s = THREAD[r.state];
  const [moment] = r.moments;
  return {
    title: r.title,
    glyph: s.glyph,
    breathes: r.state === "working",
    state: { word: s.word, tone: s.tone },
    meta: words(r.project?.name, "Caw thread"),
    reason:
      !r.matched.includes("title") && moment ? momentReason(moment) : null,
  };
}

function taskRow(r: FindTask): Drawn {
  const kindWord = r.stageKind ? STAGE_KIND_WORD[r.stageKind] : undefined;
  return {
    title: `${r.taskId} ${r.title}`,
    glyph: Task,
    breathes: false,
    state: {
      word: kindWord ?? r.stage,
      tone: r.stageKind === "you" ? "attn" : "quiet",
    },
    meta: words(
      r.project?.name,
      kindWord ? r.stage : null,
      r.todos.total > 0 ? `${r.todos.done} of ${r.todos.total} to-dos` : null
    ),
    reason: null,
  };
}

function routineRow(r: FindRoutine): Drawn {
  const next = new Date(r.nextRun).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  let word = "Paused";
  if (r.enabled) {
    word = r.lastOutcome ?? "Not run yet";
  }
  return {
    title: r.title,
    glyph: Routine,
    breathes: false,
    state: {
      word,
      tone: r.lastOutcome && WENT_WRONG.test(r.lastOutcome) ? "fail" : "quiet",
    },
    // It opens into the thread its runs are noted in; before its first note it has none to open.
    meta: words(
      r.project?.name,
      r.enabled ? `next ${next}` : null,
      r.threadId ? null : "no thread yet"
    ),
    reason: null,
  };
}

const projectRow = (r: FindProject): Drawn => ({
  title: r.title,
  glyph: Project,
  breathes: false,
  state: { word: "Project", tone: "quiet" },
  meta: [],
  reason: null,
});

const machineRow = (r: FindMachine): Drawn => ({
  title: r.title,
  glyph: Machine,
  breathes: false,
  state: { word: r.online ? "Online" : "Offline", tone: "quiet" },
  meta: ["machine"],
  reason: null,
});

function artifactRow(r: FindArtifact): Drawn {
  const glyph =
    r.kind === "decision" ? Decision : ARTIFACT[r.artifactKind].glyph;
  let word = r.seen ? "Seen" : "Unseen";
  if (r.picksToMake) {
    word = "Picks to make";
  }
  return {
    title: r.title,
    glyph,
    breathes: false,
    state: { word, tone: r.picksToMake || !r.seen ? "attn" : "quiet" },
    meta: words(r.project?.name, `from ${r.conversation.title}`),
    reason: null,
  };
}

const changeRow = (r: FindChange): Drawn => ({
  title: r.what,
  glyph: r.kind === "commit" ? Commit : File,
  breathes: false,
  state: {
    word: r.landed ? "Landed on main" : "Not landed",
    tone: "quiet",
  },
  meta: words(r.project?.name, r.branch, `from ${r.conversation.title}`),
  reason: null,
});

function drawnOf(result: FindResult, reason: Reason): Drawn {
  switch (result.kind) {
    case "conversation":
      return conversationRow(result, reason);
    case "thread":
      return threadRow(result);
    case "task":
      return taskRow(result);
    case "routine":
      return routineRow(result);
    case "project":
      return projectRow(result);
    case "machine":
      return machineRow(result);
    case "artifact":
    case "decision":
      return artifactRow(result);
    case "commit":
    case "file":
      return changeRow(result);
    default:
      throw new Error(
        `a find result of an unknown kind: ${(result as FindResult).kind}`
      );
  }
}

/**
 * A result as a row. `reason` is the ↳ line a section asks for: a hub-side
 * match explains itself (purpose, report), a transcript match leads with
 * its first moment.
 */
export const rowOf = (
  result: FindResult,
  now: number,
  reason: Reason = "name"
): Row => finish(result, result.lastActivity, drawnOf(result, reason), now);

const WHY_WORD: Record<string, string> = {
  unseen: "Unseen",
  "new revision": "New revision",
  "picks to make": "Picks to make",
  unread: "Unread",
  "unread, failed": "Unread, failed",
};

function waitingGlyph(item: WaitingItem): Component {
  switch (item.kind) {
    case "decision":
      return Decision;
    case "report":
      return item.why === "unread, failed" ? Failed : Report;
    case "task":
      return Task;
    default:
      return ARTIFACT[item.artifactKind ?? "preview"].glyph;
  }
}

/** A thing waiting for him, on the same recipe. */
export function waitingRow(item: WaitingItem, now: number): Row {
  // A task waits on him by being here; its stage goes on the meta line.
  const task = item.kind === "task";
  return finish(
    item,
    item.since,
    {
      title: item.kind === "report" ? `“${item.title}”` : item.title,
      glyph: waitingGlyph(item),
      breathes: false,
      state: {
        word: task ? "Waits on you" : (WHY_WORD[item.why] ?? item.why),
        tone: item.why === "unread, failed" ? "fail" : "attn",
      },
      meta: words(
        item.project?.name,
        task ? item.why : null,
        item.conversation ? `from ${item.conversation.title}` : null
      ),
      reason: null,
    },
    now
  );
}

/** The noun a kind is counted by in a folded Go-to row ("3 previews match …"). */
export function kindNoun(result: FindResult, count: number): string {
  let one: string = result.kind;
  if (result.kind === "artifact") {
    one = ARTIFACT[result.artifactKind].noun;
  } else if (result.kind === "conversation") {
    one = "session";
  }
  return count === 1 ? one : `${one}s`;
}

/** The glyph a folded Go-to row leads with: its kind's. */
export const kindGlyph = (result: FindResult): Component =>
  drawnOf(result, "name").glyph;
