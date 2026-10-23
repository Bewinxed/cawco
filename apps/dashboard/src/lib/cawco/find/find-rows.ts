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
import {
  type ArtifactKind,
  type FindSecrets,
  findSecretWords,
  type SecretSpan,
  workWords,
} from "@cawco/core";
import { markedRuns } from "@cawco/core/find-match";
import type { Component } from "svelte";
import {
  IconGlobe as Browser,
  IconResult as Canvas,
  IconTerminal as Commit,
  IconListCheck as Decision,
  IconError as Failed,
  IconFileCode as File,
  IconPauseCircle as Idle,
  IconServerAlt as Machine,
  IconNeedsYou as NeedsYou,
  IconArtifactPage as Page,
  IconWindow as Preview,
  IconFolder as Project,
  IconDocumentAlt as Report,
  IconCalendar as Routine,
  IconArtifactSheet as Sheet,
  IconMoonSleep as Sleeping,
  IconTaskList as Task,
  IconAsk as Unreachable,
  IconRenew as Working,
} from "#lib/icons.js";
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

/**
 * One run of words a row draws: matched ones strong; one that is part of a
 * secret names it by its key ({@link secretKey}), and is drawn as dots
 * until the person shows that secret (Said.svelte).
 */
export interface Run {
  matched: boolean;
  secret?: string;
  text: string;
}

export interface Excerpt {
  /** Plain runs and matched runs, in order: matched ones are drawn strong. */
  parts: Run[];
  /** Who said it, or what matched: "you", "report", "purpose", … */
  source: string;
}

/** A row's words, as a run of its own: a secret's or the plain words between them. */
export interface Piece {
  runs: Run[];
  /** The secret these runs are, by key; null for plain words. */
  secret: string | null;
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
  /** The secrets its title and reason draw, by key, in drawn order: ↵ shows the first still hidden. */
  secrets: string[];
  /** Read out whole by a screen reader; a hidden secret said as such. */
  spoken: string;
  /** The state word (or a thing's own first word) and its tone. */
  state: { tone: Tone; word: string };
  title: string;
  /** Its title's runs: a secret in it drawn as dots. */
  titleParts: Run[];
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

const WENT_WRONG = /fail|error/i;

/** No secret shown: what a row is drawn with when nothing says otherwise. */
const NONE_SHOWN: ReadonlySet<string> = new Set();

/**
 * A secret's key: the result it is in (`kind:id`), the words it is in
 * (`title`, `purpose`, `report`, or `m:<docId>` for a moment) and its place
 * among their secrets. A moment's secret has one key in its row and its
 * peek, so showing it in one shows it in both.
 */
export const secretKey = (owner: string, field: string, index: number) =>
  `${owner}|${field}|${index}`;

/**
 * `runs` cut at each of `spans`' edges (counted in the runs' joined words),
 * each run inside a span naming its secret by `keyOf` its index.
 */
export function withSecrets(
  runs: readonly { matched: boolean; text: string }[],
  spans: readonly SecretSpan[] | undefined,
  keyOf: (index: number) => string
): Run[] {
  if (!spans?.length) {
    return [...runs];
  }
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const end = at + run.text.length;
    const cuts = new Set([at, end]);
    for (const [start, stop] of spans) {
      for (const edge of [start, stop]) {
        if (edge > at && edge < end) {
          cuts.add(edge);
        }
      }
    }
    const edges = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < edges.length; i += 1) {
      const from = edges[i] as number;
      const to = edges[i + 1] as number;
      const secret = spans.findIndex(
        ([start, stop]) => from >= start && to <= stop
      );
      out.push({
        matched: run.matched,
        text: run.text.slice(from - at, to - at),
        ...(secret >= 0 ? { secret: keyOf(secret) } : {}),
      });
    }
    at = end;
  }
  return out;
}

/** `runs` as pieces: each secret's runs together, the plain words between. */
export function piecesOf(runs: readonly Run[]): Piece[] {
  const pieces: Piece[] = [];
  for (const run of runs) {
    const secret = run.secret ?? null;
    const last = pieces.at(-1);
    if (last && last.secret === secret) {
      last.runs.push(run);
    } else {
      pieces.push({ secret, runs: [run] });
    }
  }
  return pieces;
}

/** An excerpt's matched terms, from the engine's 「 」 marks; its secrets named when `spans` are given. */
export const excerptParts = (
  text: string,
  spans?: readonly SecretSpan[],
  keyOf: (index: number) => string = String
): Run[] => withSecrets(markedRuns(text), spans, keyOf);

const AUTHOR: Record<FindMoment["author"], string> = {
  owner: "you",
  agent: "agent",
  report: "report",
  injected: "injected",
  caw: "Caw",
};

/** A moment's excerpt as runs, its secrets keyed by the result it is in (`kind:id`). */
export const momentParts = (owner: string, moment: FindMoment): Run[] =>
  excerptParts(moment.excerpt, moment.secrets, (i) =>
    secretKey(owner, `m:${moment.docId}`, i)
  );

export const momentReason = (owner: string, moment: FindMoment): Excerpt => ({
  source: AUTHOR[moment.author],
  parts: momentParts(owner, moment),
});

/** The words `runs` read as: a secret not shown said as hidden, once. */
export function spokenOf(
  runs: readonly Run[],
  shown: ReadonlySet<string> = NONE_SHOWN
): string {
  return piecesOf(runs)
    .map((piece) =>
      piece.secret && !shown.has(piece.secret)
        ? findSecretWords.hidden
        : piece.runs.map((run) => run.text).join("")
    )
    .join("");
}

/** The secrets `runs` hold, by key, in order. */
export const secretsIn = (runs: readonly Run[]): string[] => [
  ...new Set(runs.flatMap((run) => (run.secret ? [run.secret] : []))),
];

/** The plain words an excerpt reads as. */
export const excerptText = (
  excerpt: Excerpt,
  shown: ReadonlySet<string> = NONE_SHOWN
): string => spokenOf(excerpt.parts, shown);

/** Who started it, in the row's words. */
function roleOf(c: FindConversation): string {
  switch (c.role) {
    case "delegate":
      return c.parent ? `delegate of ${c.parent.title}` : "delegate";
    case "attempt":
      return c.task ? `attempt at ${c.task.taskId}` : "attempt";
    case "spin-off":
      return c.parent ? `spin-off of ${c.parent.title}` : "spin-off";
    case "session":
      break;
  }
  return "yours";
}

/** A result's key, which its secrets' keys begin with. */
const ownerOf = (result: FindResult | WaitingItem) =>
  `${result.kind}:${result.id}`;

/** One of a result's own words (`title`, `purpose`, `report`) as runs, its secrets named. */
export const ownParts = (
  result: FindResult,
  field: keyof FindSecrets,
  text: string
): Run[] =>
  withSecrets([{ matched: false, text }], result.secrets?.[field], (i) =>
    secretKey(ownerOf(result), field, i)
  );

const plain = (
  result: FindConversation,
  source: "purpose" | "report",
  text: string
): Excerpt => ({ source, parts: ownParts(result, source, text) });

/**
 * Why a hub-side match is here, when its title alone does not say it: its
 * purpose or its last report matched the words, or a moment did.
 */
function nameReason(c: FindConversation): Excerpt | null {
  if (c.matched.includes("title")) {
    return null;
  }
  if (c.matched.includes("purpose") && c.purpose) {
    return plain(c, "purpose", c.purpose);
  }
  if (c.matched.includes("report") && c.lastReport) {
    return plain(c, "report", c.lastReport.headline);
  }
  const [moment] = c.moments;
  return moment ? momentReason(ownerOf(c), moment) : null;
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

type Drawn = Omit<Row, "spoken" | "key" | "at" | "secrets" | "titleParts">;

function finish(
  result: FindResult | WaitingItem,
  at: number | null,
  drawn: Drawn,
  now: number,
  shown: ReadonlySet<string> = NONE_SHOWN
): Row {
  // The hub's spans count in its own title: a row that draws other words
  // there (a task's id before it, a waiting item) draws them plainly.
  const titleParts =
    "score" in result && drawn.title === result.title
      ? ownParts(result, "title", drawn.title)
      : [{ matched: false, text: drawn.title }];
  const row = { ...drawn, key: ownerOf(result), at, titleParts };
  return {
    ...row,
    secrets: secretsIn([...titleParts, ...(row.reason?.parts ?? [])]),
    spoken: [
      spokenOf(titleParts, shown),
      row.state.word,
      ...row.meta,
      at === null ? "" : `${age(at, now)} ago`,
      row.reason
        ? `${row.reason.source}: ${excerptText(row.reason, shown)}`
        : "",
    ]
      .filter(Boolean)
      .join(", "),
  };
}

const ARTIFACT: Record<ArtifactKind, { glyph: Component; noun: string }> = {
  page: { glyph: Page, noun: "page" },
  canvas: { glyph: Canvas, noun: "canvas" },
  preview: { glyph: Preview, noun: "preview" },
  component: { glyph: Sheet, noun: "component" },
  browser: { glyph: Browser, noun: "browser" },
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
      reason === "moment" && moment
        ? momentReason(ownerOf(r), moment)
        : nameReason(r),
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
      !r.matched.includes("title") && moment
        ? momentReason(ownerOf(r), moment)
        : null,
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
    meta: words(r.project?.name, r.enabled ? `next ${next}` : null),
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
    word: r.landed ? workWords.landedOn("main") : "Not landed",
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
 * its first moment. `shown` are the secrets the person showed: its spoken
 * words say those, and say the rest as hidden.
 */
export const rowOf = (
  result: FindResult,
  now: number,
  reason: Reason = "name",
  shown: ReadonlySet<string> = NONE_SHOWN
): Row =>
  finish(result, result.lastActivity, drawnOf(result, reason), now, shown);

/** A report's why as its row's word; an artifact's is already its words (Needs you's line). */
const WHY_WORD: Record<string, string> = {
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
    case "artifact":
      break;
  }
  return ARTIFACT[item.artifactKind ?? "preview"].glyph;
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
