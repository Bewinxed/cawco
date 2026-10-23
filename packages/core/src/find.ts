/**
 * Finding things across the fleet (docs/tom/find-and-mention.md): one engine
 * at the hub answers "find anything" and "name something while writing" from
 * the same ranking. A result is always one of the task model's objects, never
 * a transcript line: a conversation (with the moments in it that matched), a
 * thread, a task, a routine, a project, a machine, an artifact, a decision, a
 * commit or a file.
 */

/** Who a transcript's words are (the index's `author`): only `owner` is "said by me". */
export type TranscriptAuthor = "owner" | "agent" | "report" | "injected";

/** What the hub asks each machine's transcript index (`searchTranscripts`). */
export interface TranscriptQuery {
  /** Only words by this author: `owner` is "said by me". */
  author?: TranscriptAuthor;
  /**
   * Only words said at or before this ISO time (past.dev's `queryTimestamp`):
   * an agent's `find` with `before` asks for them alone, so earlier evidence
   * is not cut by later matches ranked above it. Words with no time are left
   * out.
   */
  before?: string;
  /** How many conversations to answer with; for a listing (no words), how many documents. */
  limit?: number;
  /**
   * Only these conversations, by their harness session ids: a find narrowed
   * to a project asks for its sessions alone, so their matches are not cut
   * by other projects' ranking above them.
   */
  sessions?: string[];
  /** Only words said at or after this ISO time: a listing's window start. */
  since?: string;
  /**
   * Match what tools returned too (the index's `output`): an agent's `find`
   * asks for it, so it finds a command's output or an error another session
   * saw; the person's Find matches what was said, thought and called.
   */
  toolOutput?: boolean;
}

/** One place in a machine's transcript that matched. */
export interface TranscriptMoment {
  author: TranscriptAuthor;
  docId: string;
  role: string;
  /** The machine's BM25, weighed by author; higher is better. Comparable within one machine's answer only. */
  score: number;
  /** The matching words, terms between 「 and 」. */
  snippet: string;
  timestamp: string | null;
}

/** A conversation a machine's transcript index matched, with its best moments. */
export interface TranscriptConversation {
  cwd: string | null;
  harness: string;
  model: string | null;
  moments: TranscriptMoment[];
  score: number;
  sessionId: string;
  sidechain: boolean;
}

/** A machine's answer to a {@link TranscriptQuery}. */
export interface TranscriptAnswer {
  /** Its index was still taking in transcripts when it answered (a catch-up): the answer holds what was indexed so far. */
  catchingUp: boolean;
  conversations: TranscriptConversation[];
  /** What the query itself took on the machine, ms. */
  queryMs: number;
  /** When the sync the index answered from began, ms epoch; 0 before its first. */
  syncedAt: number;
  /** What bringing the index up to date took before the query (0 when it was fresh), ms. */
  syncMs: number;
}

/** Every kind of thing a find answers with. */
export const FIND_KINDS = [
  "conversation",
  "thread",
  "task",
  "routine",
  "project",
  "machine",
  "artifact",
  "decision",
  "commit",
  "file",
] as const;
export type FindKind = (typeof FIND_KINDS)[number];

/**
 * A conversation's live state, as the board says it: working on a turn,
 * waiting on the person, idle (its process up, no turn), asleep (no process,
 * wakes on a message), ended, or unknown: nobody can say (its machine is not
 * connected, or the hub never ran it: a session started from a terminal).
 */
export type FindLiveState =
  "working" | "needs-you" | "idle" | "sleeping" | "ended" | "unknown";

/** Which of a result's recognisers its words matched. */
export type FindField =
  | "title"
  | "purpose"
  | "project"
  | "dir"
  | "machine"
  | "report"
  | "id"
  | "kind"
  | "path"
  | "transcript";

/**
 * Who said a moment: a transcript's author, or `caw`, a project's Caw in one
 * of his threads (a thread's own messages are kept at the hub).
 */
export type MomentAuthor = TranscriptAuthor | "caw";

/** Who said it, as `GET /api/find`'s `by` names it: `me` is the owner's own words. */
export type FindBy = "me" | "agent" | "report" | "caw";

/** A moment inside a conversation or thread: a jump target, and why it matched. */
export interface FindMoment {
  /** When it was said, ms epoch; null when the transcript kept no time. */
  at: number | null;
  author: MomentAuthor;
  /** The record to open at: a transcript's record (uuid, opencode message id), or a thread message's id. */
  docId: string;
  /** The matching words, terms between 「 and 」. */
  excerpt: string;
  /**
   * The secrets its excerpt holds, in the excerpt's words with its 「 」
   * marks left out: present only while "Hide secrets in Find" is on, so the
   * person's Find draws each as dots until they show it.
   */
  secrets?: SecretSpan[];
}

/**
 * Where a secret stands in a text: its first character's index and the one
 * after its last, as the hub's secret filter recognises one (hub
 * secret-filter.ts).
 */
export type SecretSpan = [start: number, end: number];

/**
 * The secrets a result's own words hold, by the field they are in: present
 * only while "Hide secrets in Find" is on (`GET /api/find/settings`).
 */
export interface FindSecrets {
  /** A conversation's purpose. */
  purpose?: SecretSpan[];
  /** A conversation's last report's headline. */
  report?: SecretSpan[];
  title?: SecretSpan[];
}

/** `GET /api/find/settings`: the person's Find settings, the same on every screen. */
export interface FindSettings {
  /** A secret in Find's results is drawn as dots until the person shows it; on unless they turn it off. */
  hideSecrets: boolean;
}

/** What every result carries: its kind, what to call it, where it stands. */
interface FindBase {
  /**
   * What a mention of it carries, which the hub resolves to exactly it:
   * `<dir>#<id8>` for a conversation, `thread#<id8>` for a thread, the
   * hostname for a machine, `tsk-142` for a task, the id for anything else.
   * Null for what nothing can name (a conversation the hub never started).
   */
  handle: string | null;
  /** The object's own id: an instance id, thread id, `project:tsk-142`, a sha, a path. */
  id: string;
  /** When it last moved, ms epoch; null when nothing says. */
  lastActivity: number | null;
  /** Which recognisers matched; empty for a kind word alone. */
  matched: FindField[];
  /** Its project, when it has one. */
  project: { id: string; name: string } | null;
  /** Its rank among this answer's results; higher first. */
  score: number;
  /** The secrets its own words hold; absent when none, or while secrets are not hidden. */
  secrets?: FindSecrets;
  /** What it is called, in its own words (a title, a name, a hostname). */
  title: string;
}

export interface FindConversation extends FindBase {
  /** The delegates and attempts it started, and how many of them wait on you now. */
  children: { count: number; needsYou: number };
  /**
   * Where it works, whole, as its board row has it (`instances.cwd`): what
   * its mark's hue is seeded from (with its machine's id when empty), so it
   * wears one colour on the board and off it. "" when unknown.
   */
  cwd: string;
  /** The folder it was launched in, its leaf. */
  dir: string | null;
  harness: string | null;
  /** The hub's instance id; null for one the hub never started (a stored CLI session). */
  instanceId: string | null;
  kind: "conversation";
  /**
   * The newest report about it: a delegate's own (its work item's
   * `finish_item` headline), else, for a session that delegates, the newest
   * report one of its delegates sent it. `blocked`: the delegate said it was
   * stopped by something outside its control.
   */
  lastReport: {
    at: number;
    headline: string;
    outcome: "done" | "failed" | "blocked" | null;
  } | null;
  machine: { id: string; name: string };
  /** Its best moments, best first: present when its transcript matched. */
  moments: FindMoment[];
  /** The conversation that started it. */
  parent: { id: string; title: string } | null;
  /** What it was for: its work item's title, else its plan step under way, else its first words when it was renamed. */
  purpose: string | null;
  /** How it came to be: the person's own, a delegate, a task's attempt, a spin-off. */
  role: "session" | "delegate" | "attempt" | "spin-off";
  /** The harness's session id, which its transcript is kept under. */
  sessionId: string | null;
  state: FindLiveState;
  /** The task it is an attempt at (role `attempt`); null otherwise. `id` is `<projectId>:tsk-142`. */
  task: { id: string; taskId: string; title: string } | null;
}

export interface FindThread extends FindBase {
  /**
   * Where its board row places it: its project's primary checkout, else its
   * first place, else its folder on the hub (`projects/<id>`), as the
   * dashboard's thread row has it: what its mark's hue is seeded from.
   */
  cwd: string;
  kind: "thread";
  /** Its best messages that matched, best first: present when its words did. */
  moments: FindMoment[];
  /** Caw on it now: working, waiting on you, or ready. */
  state: "working" | "needs-you" | "ready";
}

export interface FindTask extends FindBase {
  kind: "task";
  stage: string;
  /** Its stage's kind (`you`: it waits on you); null while the project's stages are unread or it names no stage of them. */
  stageKind: "todo" | "active" | "waiting" | "you" | "done" | "dropped" | null;
  /** `tsk-142`. */
  taskId: string;
  todos: { done: number; total: number };
}

export interface FindRoutine extends FindBase {
  enabled: boolean;
  kind: "routine";
  /** Its last run's outcome; null before its first ended. */
  lastOutcome: string | null;
  /** Its next run, ms epoch. */
  nextRun: number;
  /** The thread its runs are noted in, where it opens; null before its first note. */
  threadId: string | null;
}

export interface FindProject extends FindBase {
  kind: "project";
}

export interface FindMachine extends FindBase {
  kind: "machine";
  online: boolean;
}

export interface FindArtifact extends FindBase {
  /** Which kind of artifact: a preview, an HTML page, a canvas, a sheet. */
  artifactKind: import("./index").ArtifactKind;
  /** The session that made it. */
  conversation: { id: string; title: string };
  kind: "artifact" | "decision";
  /** A decision with no pick of yours yet. */
  picksToMake: boolean;
  revision: number;
  /** Whether you have opened it at its current revision. */
  seen: boolean;
}

/** A commit a delegate's work item made, or a file it changed. */
export interface FindChange extends FindBase {
  branch: string;
  /** The conversation that made it. */
  conversation: { id: string; title: string };
  kind: "commit" | "file";
  /** Its work item has landed on the branch it lands on. */
  landed: boolean;
  /** A commit's subject; a file's path. */
  what: string;
  workItemId: string;
}

export type FindResult =
  | FindConversation
  | FindThread
  | FindTask
  | FindRoutine
  | FindProject
  | FindMachine
  | FindArtifact
  | FindChange;

/** One machine's part in an answer that asked the machines. */
export interface FindMachineCoverage {
  /** Whether it answered in time. */
  answered: boolean;
  /** How old its index was when it answered, ms; null when it did not answer, or its index has not finished a sync yet. */
  indexAgeMs: number | null;
  /** Its index was still taking in transcripts (a catch-up): what it answered may be short. */
  indexing: boolean;
  machineId: string;
  name: string;
  /** Why it did not answer, as the clause after "couldn't search:"; null when it did. */
  reason: string | null;
  /** What it took to answer, ms (its sync, its query and the wire). */
  tookMs: number | null;
}

/**
 * Which machines an answer's transcript part heard from. `asked` false: the
 * answer did not ask (the names-only part, or no words to look for), so it
 * says nothing about what transcripts hold; `machines` are then the ones a
 * full find would ask, none answered, an offline one with its reason.
 */
export interface FindCoverage {
  asked: boolean;
  machines: FindMachineCoverage[];
}

/** `GET /api/find`'s answer. */
export interface FindAnswer {
  coverage: FindCoverage;
  /** The cursor for the next page; null on the last. */
  next: string | null;
  /** The words as the hub read them, after any kind words. */
  query: string;
  results: FindResult[];
  /** What the hub took to answer, ms: names and transcripts apart. */
  timing: { namesMs: number; transcriptsMs: number | null };
}

/** What waits on the person's eyes (`GET /api/find/waiting`). */
export type WaitingKind = "artifact" | "decision" | "report" | "task";

export interface WaitingItem {
  /** For an artifact or decision: which kind of artifact. */
  artifactKind?: import("./index").ArtifactKind;
  /** The conversation it came from, when one made it. */
  conversation: { id: string; title: string } | null;
  /** The object's id: an artifact's, a work item's, `project:tsk-142`. */
  id: string;
  kind: WaitingKind;
  project: { id: string; name: string } | null;
  /** For an artifact or decision: the revision it waits at. */
  revision?: number;
  /** When it began waiting, ms epoch: made, revised, reported, moved to its stage. */
  since: number;
  title: string;
  /** Why it waits, in a few words: an artifact's Needs-you line ("3 of 9 picked · 2 unsent") or its notice's, "unread", the stage. */
  why: string;
}

export interface WaitingAnswer {
  /**
   * How far back it looks, days: nothing recorded which revision of an
   * artifact you had on screen before the hub kept it, so older things can't
   * be told apart from ones you looked at.
   */
  days: number;
  /** Oldest first. */
  items: WaitingItem[];
  /** What could not be read, one sentence each (a project whose tasks did not read): the list may be short by it. */
  missing: string[];
}
