/**
 * A project's memory as its Memory view reads it (hub memory-view.ts, the
 * dashboard's ViewMemory): the pipeline the hub runs, drawn from its own
 * data. Notes come into the inbox; Jev and the curator sort them into
 * dated fact lines in `knowledge/`; briefs carry the lines that bear on
 * their task. Every number here is the hub's: the parsers' counts, the
 * thresholds it acts on, each brief's record of what it carried.
 *
 * Read with `GET /api/projects/:id/memory` (the page) and
 * `GET /api/projects/:id/memory/file?path=` (one file, line by line). The
 * view reads them again on `memory.changed`.
 */

/** How Jev's sort says a note bears on a fact line (hub memory.ts `Sort`). */
export type MemorySort = "corroborates" | "changes" | "conflicts";

/** A fact line's place in its file (memory-facts.ts `FactSection`), or a line that does not read. */
export type MemoryMark = "current" | "formerly" | "conflict" | "unreadable";

/** What a proposal does, as its card names it. */
export type MemoryProposalKind =
  | "sort"
  | "fold"
  | "archive"
  | "reshape"
  | "retire"
  | "rewrite"
  | "withdraw"
  | "change";

/** One note in the inbox, as its row draws it. */
export interface MemoryNoteRow {
  /** When it was written, ms epoch. */
  at: number;
  /** Who wrote it: the session's board title. */
  author: string;
  id: string;
  /** The open proposal citing it, by id: its card lands under the row. */
  proposal: string | null;
  /** The day its writer said it became true, when before the note's own. */
  since: string | null;
  /**
   * Jev's clear sort of it against one fact line, from the proposal Jev's
   * sort made; null while the curator has it (or Jev is off).
   */
  sort: { file: string; kind: MemorySort; name: string } | null;
  /** Its words, whole. */
  text: string;
}

/** A knowledge file's row in Knowledge. */
export interface MemoryFileRow {
  /** Its last commit, ms epoch; null when the folder's git has none. */
  changedAt: number | null;
  /** Bytes of words: what the fold's threshold counts. */
  chars: number;
  conflicts: number;
  current: number;
  /** Its first line: what it holds. */
  description: string;
  formerly: number;
  /** Every line in file order, as one mark each: the row's line run. */
  marks: MemoryMark[];
  /** Its name, the path's last part without `.md`. */
  name: string;
  path: string;
  /** Open proposals that change it, by id. */
  proposals: string[];
  /** Written as prose before fact lines: its rewrite as fact lines waits for the curator's run. */
  prose: boolean;
  unreadable: number;
  /** The newest brief that carried a line of it, ms epoch; null when none has. */
  usedAt: number | null;
  /** Briefs that carried a line of it, per day, the oldest of 14 first, today last. */
  uses14: number[];
}

/** The person's own notes: AGENTS.md's `## Notes`, which every session loads. */
export interface MemoryYourNotes {
  /** AGENTS.md's last commit, ms epoch. */
  changedAt: number | null;
  count: number;
}

/** One brief that carried fact lines, newest first. */
export interface MemoryBriefRow {
  /** When the brief was made, ms epoch. */
  at: number;
  /** Characters the lines it carried took. */
  chars: number;
  lines: number;
  /**
   * Characters the brief had for fact lines: its whole budget
   * (`thresholds.budgetChars`) less what it carried before them (AGENTS.md,
   * the brand kit files its task named).
   */
  room: number;
  /** The share of `room` its lines took, 0 to 1. */
  share: number;
  taskId: string;
  title: string;
}

/** An open proposal, as the view lands it on its row. */
export interface MemoryProposalRow {
  by: string;
  /** Every file it changes, in the card's order. */
  files: string[];
  id: string;
  kind: MemoryProposalKind;
  /** Notes it cites. */
  notes: string[];
  /** Jev's sorts it carries, one per note. */
  sorts: { file: string; kind: MemorySort; line: number; note: string }[];
  /** Proposed when, ms epoch. */
  time: number;
  why: string;
}

/** One curator run, as Inbox's first line says it: a failed one always carries the hub's reason. */
export type MemoryCuratorRun = {
  endedAt: number | null;
  /** Where the run's session reads: its session page, once it has one. */
  href: string | null;
  startedAt: number;
  state: "starting" | "running" | "queued" | "skipped" | "ended";
} & (
  | {
      outcome: "failed";
      /** The hub's sentence: why it failed (routines.ts `RunEnd`). */
      reason: string;
    }
  | {
      outcome: "delivered" | "silent" | "cancelled" | null;
      /** The hub's sentence: why it was skipped, or did nothing. */
      reason: string | null;
    }
);

/** The project's curator routine, as Inbox's head says it. */
export interface MemoryCurator {
  /** Its schedule, as the routine keeps it: the empty Knowledge block says when it runs. */
  cron: string;
  enabled: boolean;
  /** The newest run, or null before its first. */
  last: MemoryCuratorRun | null;
  /** Its next scheduled run, ms epoch. */
  nextSlot: number;
  routineId: string;
  timeZone: string;
}

/** The numbers the hub acts on. */
export interface MemoryThresholds {
  /** Days unused before a line is proposed for the archive (config MEMORY_ARCHIVE_DAYS). */
  archiveDays: number;
  /** What one brief carries of all its context (memory.ts CONTEXT_CHARS). */
  budgetChars: number;
  /** A fact file past this many characters is proposed for a fold (config MEMORY_FILE_CHARS). */
  fileChars: number;
  /** Past this many fact files the curator is asked for a reshape (memory.ts RESHAPE_ABOVE). */
  reshapeAbove: number;
}

/** `GET /api/projects/:id/memory`. */
export interface MemoryPage {
  /** The archive: `knowledge/archive/` files and their lines. */
  archive: { lines: number; path: string }[];
  briefs: MemoryBriefRow[];
  /** Null until the project's first note makes its curator. */
  curator: MemoryCurator | null;
  /** Fact files: those with a conflict or an unreadable line first, then the most recently used. */
  files: MemoryFileRow[];
  inbox: MemoryNoteRow[];
  /** Jev is on: it sorts the inbox as a run starts. */
  jev: boolean;
  /** The hub's clock as it answered, ms epoch: what the 14 days end on. */
  now: number;
  proposals: MemoryProposalRow[];
  thresholds: MemoryThresholds;
  yours: MemoryYourNotes;
}

/** A note a fact line rests on, as its source chip lists it. */
export interface MemorySourceNote {
  at: number | null;
  author: string;
  id: string;
  /** The note's first line. */
  text: string;
  /** Where it is: still in the inbox, archived, or a file's prose before fact lines. */
  where: "inbox" | "archive" | "prose" | "gone";
}

/** One fact line of an open file. */
export type MemoryFactView = MemoryFactWords &
  (
    | {
        /** Within `## Conflict`: the lines that disagree with each other share it. */
        conflictGroup: number;
        section: "conflict";
      }
    | { conflictGroup: null; section: "current" | "formerly" }
  );

/** What every fact line of an open file says, whatever its section. */
interface MemoryFactWords {
  from: MemorySourceNote[];
  key: string;
  line: number;
  replacedBy: string | null;
  ruling: string | null;
  since: string;
  text: string;
  until: string | null;
  /** The briefs that carried it, newest first. */
  uses: { at: number; taskId: string; title: string }[];
  why: string | null;
}

/** `GET /api/projects/:id/memory/file?path=` for a fact file. */
export interface MemoryFactFile {
  changedAt: number | null;
  chars: number;
  /** Its words, whole: a prose file is drawn as markdown. */
  content: string;
  description: string;
  facts: MemoryFactView[];
  kind: "facts";
  marks: MemoryMark[];
  name: string;
  path: string;
  proposals: string[];
  prose: boolean;
  thresholds: MemoryThresholds;
  unreadable: { line: number; text: string; why: string }[];
  usedAt: number | null;
  uses14: number[];
}

/** One of the person's notes in AGENTS.md's `## Notes`. */
export interface MemoryYourNote {
  /** When its line was committed (git blame), ms epoch. */
  at: number | null;
  /** Its words, as the section holds them. */
  text: string;
}

/** `GET /api/projects/:id/memory/file?path=AGENTS.md`: the person's notes. */
export interface MemoryNotesFile {
  changedAt: number | null;
  kind: "notes";
  name: string;
  notes: MemoryYourNote[];
  path: string;
}

export type MemoryFileView = MemoryFactFile | MemoryNotesFile;

/** `POST /api/projects/:id/memory/curate`, `…/propose/fold`, `…/propose/reshape`: the curator's run, started. */
export interface MemoryRunStarted {
  reason: string | null;
  routineId: string;
  runId: string;
  /** Its state as filed: a run still going skips the next. */
  state: "starting" | "running" | "queued" | "skipped" | "ended";
}

/** `POST /api/projects/:id/memory/propose/archive`: the proposals made, by id. */
export interface MemoryArchiveProposed {
  proposals: string[];
}

/** The Memory view's address: the file open beside it, and the proposal it lands on. */
export const memoryHref = (
  projectId: string,
  place: { file?: string | null; proposal?: string | null } = {}
): string => {
  const query = new URLSearchParams({ view: "memory" });
  if (place.file) {
    query.set("file", place.file);
  }
  if (place.proposal) {
    query.set("proposal", place.proposal);
  }
  return `/project/${encodeURIComponent(projectId)}?${query.toString()}`;
};

/** What opens a Caw thread message that is the person's note, not words to Caw: "Make a note" (WORDS.md), its one path. */
export const MAKE_A_NOTE = /^make a note\s*:\s*/i;

/** The name of a project's one standing notes thread, where every note made from the Memory view lands (WORDS.md: Make a note). */
export const NOTES_THREAD = "Make a note";

/** The composer's placeholder wherever its words become a note: the notes thread, on the web and in the app (Words.Memory.notesPlaceholder), and the Memory view's fields. */
export const NOTES_PLACEHOLDER = `${NOTES_THREAD}…`;

/** The days a use sparkline draws. */
export const MEMORY_USE_DAYS = 14;

/** What the Memory view says (report 1 §2, report 2). No ids, no cost. */
export const memoryViewWords = {
  tab: "Memory",
  inbox: "Inbox",
  /** The knowledge files' block (WORDS.md: the topic files are knowledge). */
  facts: "Knowledge",
  briefs: "In briefs",
  curateNow: "Curate inbox",
  curating: "Curating…",
  makeNote: "Make a note",
  /** What a note's message to Caw opens with: the hub keeps the rest in AGENTS.md (MAKE_A_NOTE). */
  notePrefix: "Make a note: ",
  /** The empty page's composer to Caw. */
  notePlaceholder: "Make a note, or ask Caw…",
  fold: "Fold file",
  archiveUnused: "Archive unused lines",
  reshape: "Reshape knowledge",
  withdraw: "Withdraw note",
  openRaw: "Open raw file",
  history: "History",
  noHistory: "The project's history keeps no commit of it yet.",
  openRun: "Open run",
  runAgain: "Run again",
  retry: "Retry",
  openInMemory: "Open in Memory",
  approve: "Approve",
  deny: "Deny",
  approving: "Approving…",
  denying: "Denying…",
  /** An answer to a proposal the hub didn't take. */
  answerRefused: "Couldn't send that answer.",
  folding: "Folding…",
  archiving: "Archiving…",
  reshaping: "Reshaping…",
  withdrawing: "Withdrawing…",
  jevOff: "Jev off",
  jevOffTitle:
    "Jev is off: the curator sorts every note on its run, so each waits for it.",
  columnFile: "File",
  columnLines: "Lines",
  columnUsed: "Used 14d",
  columnChanged: "Changed",
  sorts: {
    corroborates: "corroborates",
    changes: "changes",
    conflicts: "conflicts",
  },
  /** A sort card's why line when its notes bear on lines in more than one way. */
  sortsMixed: "sorts",
  waiting: "waiting for curator",
  ruling: "ruling",
  formerly: "Formerly",
  current: "Current",
  conflict: "Conflict",
  notRead: "not read",
  /** The person's notes row and card: the file itself (WORDS.md: AGENTS.md, not "memory file"). */
  yourNotes: "AGENTS.md",
  everyBrief: "every brief",
  addPlaceholder: NOTES_PLACEHOLDER,
  addLabel: "Make a note",
  /** Counts and meta. */
  lines: (n: number) => `${n} ${n === 1 ? "line" : "lines"}`,
  notes: (n: number) => `${n} ${n === 1 ? "note" : "notes"}`,
  /** A block's needs glyph: the proposals landed in it. */
  waitingOnYou: (n: number) =>
    `${n} ${n === 1 ? "proposal waits" : "proposals wait"} on you`,
  fromNotes: (n: number) => `from ${n} ${n === 1 ? "note" : "notes"}`,
  since: (day: string) => `since ${day}`,
  until: (day: string) => `until ${day}`,
  used: (n: number, last: string) => `used ${n} · last ${last}`,
  notUsed: "not used yet",
  changed: (ago: string) => `changed ${ago}`,
  conflicts: (n: number) => `${n} ${n === 1 ? "conflict" : "conflicts"}`,
  notReadCount: (n: number) => `${n} ${n === 1 ? "line" : "lines"} not read`,
  archiveRow: (n: number) => `Archive · ${n} ${n === 1 ? "line" : "lines"}`,
  loadedByEvery: "loaded by every session",
  you: "you",
  morePast: (n: number) => `+${n}`,
  usedHover: (n: number, last: string | null) =>
    last
      ? `${n} ${n === 1 ? "brief" : "briefs"} in 14 days · last ${last}`
      : "No brief in 14 days",
  /** A brief's meter: its lines' characters, the bar scaled to the busiest brief listed. */
  briefHover: (lines: number, chars: number, busiest: number) =>
    `${lines} ${lines === 1 ? "line" : "lines"}, ${chars.toLocaleString("en-US")} characters${chars >= busiest ? ": the most of these briefs" : ` of the busiest brief's ${busiest.toLocaleString("en-US")}`}`,
  sizeHover: (chars: string, limit: string) =>
    `${chars} of ${limit} characters: past it, a fold is proposed`,
  /** The block heads' run status. */
  runningSince: (time: string) => `Running since ${time}`,
  neverRun: "Not run yet",
  /** Proposal card heads: the kind, then why. */
  kind: {
    sort: "Sort",
    fold: "Fold",
    archive: "Archive",
    reshape: "Reshape",
    retire: "Retire",
    rewrite: "Rewrite",
    withdraw: "Withdraw",
    change: "Change",
  } satisfies Record<MemoryProposalKind, string>,
  sortWhy: (notes: number, kind: string, file: string) =>
    `from ${notes} ${notes === 1 ? "note" : "notes"} · ${kind} a line in ${file}`,
  /** Empty states. */
  emptyTitle: "Nothing remembered yet",
  emptyLine:
    "Agents leave notes here as they work. The curator sorts them into dated facts, and each brief carries the lines that bear on its task.",
  noFacts: (when: string) => `No facts yet. The curator runs ${when}.`,
  noFactsUnscheduled: "No facts yet. The curator runs with the first note.",
  noBriefs: "No brief has carried a line yet.",
  noInbox: "No note waits. Agents' notes land here as they work.",
  conflictLine: "Both hold for the same period. A note from you settles it.",
  /** Asks, in the page. */
  foldAsk: (name: string) => `Fold ${name}?`,
  foldAskLine:
    "The curator rewrites it shorter. You approve the result before it lands.",
  archiveAsk: (days: number) => `Archive the lines unused for ${days} days?`,
  archiveAskLine: "They move to the archive once you approve.",
  reshapeAsk: "Reshape knowledge?",
  reshapeAskLine:
    "The curator proposes a new set; nothing moves until you approve.",
  withdrawAsk: "Withdraw this note?",
  withdrawAskLine: "It leaves the inbox and is kept in the notes archive.",
  withdrawYoursAsk: "Withdraw this note?",
  withdrawYoursAskLine: "It leaves AGENTS.md; the project's history keeps it.",
  reshapeOffered: (n: number) => `offered past ${n} files`,
  /** Failures. */
  runFailed: (time: string, reason: string) =>
    `The curator's run failed at ${time}. ${reason} The inbox is as it was.`,
  /** The curator's last run, as Inbox's body line says it. */
  curatedAgo: (ago: string) => `Curated ${ago}`,
  /** A file card's Back on a phone. */
  back: "Back",
  /** A fact line's uses' fold. */
  briefsCarried: "The briefs that carried it",
  /** A fact's grounds, under it. */
  why: (text: string) => `Why: ${text}`,
  unavailable: "Memory is not available",
  unavailableLine: (project: string, reason: string) =>
    `Memory for ${project} couldn't be read. ${reason} Nothing was changed.`,
  fileUnavailable: (name: string, reason: string) =>
    `${name} couldn't be read. ${reason} Nothing was changed.`,
  lineNotRead: (why: string) => `not read: ${why}`,
} as const;
