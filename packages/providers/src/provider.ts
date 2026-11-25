import type { Effect } from "effect";
import type { ProviderFailure } from "./read-stop";

/**
 * One provider per outside service (GitHub, Linear, GitLab, Gitea, and the
 * generic `connection` provider for a connector poll's records): what each
 * one is, said once, and what its ingest hands the hub's one door (hub
 * intake.ts `take`). A descriptor is pure (no SDK), so the dashboard, the
 * hub and the agent all read it; registry.ts holds every descriptor. A
 * provider's SDK parts live in its own folder (`github/ingest.ts`,
 * `github/items.ts`, `connection/ingest.ts`).
 *
 * This package stands under core and imports no workspace package: core
 * reads its URLs and names its sources by these ids. What the hub lends a
 * provider (a deadline on each request) comes in through its arguments.
 */

/** Every provider, by id. A task's link, a comment's heading and a stored row name their source by one. */
export const PROVIDER_IDS = ["github", "linear", "gitlab", "gitea"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** What a task links on a service. */
export const LINK_KINDS = ["issue", "pr", "discussion"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** What a URL names on a service: a link's kind, or an Actions run a wait names. */
type UrlItemKind = LinkKind | "run";

/** Every kind of item the hub mirrors: what a URL names, or a connector poll's record. */
export const ITEM_KINDS = [...LINK_KINDS, "run", "record"] as const;
type ItemKind = (typeof ITEM_KINDS)[number];

/** One item, named without reading the service. */
export interface ItemRef {
  /** Where it lives, lower case: `owner/repo`, the Linear workspace, `group/sub/project`. */
  container: string;
  /** `github.com`, `linear.app`, `gitlab.example.com:8443`. */
  host: string;
  /** What the service's API takes: `12`, `ENG-123`, a run's id. */
  key: string;
  kind: UrlItemKind;
  provider: ProviderId;
  /** `#12`, `ENG-123`, `!7`, `run 7735`. */
  ref: string;
  /** The item's URL, without a comment's anchor or a trailing path. */
  url: string;
}

/** Pure: no SDK. The dashboard, the hub and the agent all read it. */
export interface ProviderDescriptor {
  /** A comment's own id, read off a URL's anchor; undefined when it names none. */
  commentOfUrl: (url: URL) => string | undefined;
  /** Hosts that are this provider's with no connection saying so: github.com, linear.app, gitlab.com. */
  hosts: readonly string[];
  id: ProviderId;
  /** The item a URL names, read off the URL alone. Its host was matched by the registry. */
  itemOfUrl: (url: URL) => ItemRef | undefined;
}

/** Whose item a mirror row is: a provider's, or `connection` for a connector poll's record. */
const ITEM_PROVIDERS = [...PROVIDER_IDS, "connection"] as const;
export type MirrorProvider = (typeof ITEM_PROVIDERS)[number];

/** The source's state in five words every source maps onto; `stateName` keeps its own. */
export type ExternalState = "open" | "draft" | "merged" | "closed" | "canceled";

/** Who wrote or opened something on a source. */
export interface ExternalActor {
  /** Their picture on the source; null when it gave none. */
  avatarUrl: string | null;
  kind: "person" | "bot" | "app";
  /** `bewinxed` on GitHub; a Linear user's name. A comment's heading names them by it. */
  login: string;
  /** The fleet member they are, once a login → member map exists (tsk-138); null until then. */
  memberId: string | null;
  /** Their display name, when the source gives one apart from the login. */
  name: string | null;
  source: ProviderId;
  /** Their page on the source; null when it gave none. */
  url: string | null;
}

/** {@link ExternalActor} with what the service says of their standing. */
export interface OutsideActor extends ExternalActor {
  /** Why the service does not vouch for them, in words; null when it does or says nothing. */
  unvouched: string | null;
}

// --- ingest -----------------------------------------------------------------

/**
 * Any item the hub mirrors: one a URL names ({@link ItemRef}), or a
 * connector poll's record (provider `connection`, host empty, its poll's
 * watch id as its container, the record's id as its key, no URL).
 */
export interface MirroredRef {
  container: string;
  host: string;
  key: string;
  kind: ItemKind;
  provider: MirrorProvider;
  ref: string;
  url: string | null;
}

/** An item's state as the mirror keeps it: an issue's, pull request's or discussion's, or an Actions run's. */
export type MirrorState = ExternalState | "running" | "green" | "red";

/** What one revision says of its item. The body is never kept in the mirror. */
interface ItemSnapshot {
  author: ExternalActor | null;
  /** Whole, for an event a revision raises; never stored in the mirror. */
  body?: string | null;
  /** A pull request's head branch, for an event a revision raises; never stored in the mirror. */
  branch?: string | null;
  /** When it was opened, ms: the tracker sync files an issue opened after it began syncing (hub sync.ts). */
  createdAt?: number;
  /** A generic record, as the tool answered it. */
  data?: unknown;
  /** GitHub's node id, Linear's uuid; empty for a record. */
  externalId: string;
  labels: string[];
  state: MirrorState | null;
  /** The source's own word: "Open", "Closed as not planned", a run's conclusion. */
  stateName: string;
  /** The service's own state, as a write names it back: `open`, `closed:not_planned`, a Linear state's id. */
  stateToken?: string;
  title: string;
  /** Why the service does not vouch for its author, in words; null when it does or says nothing. */
  unvouched?: string | null;
}

/** One item as the service holds it at one version. */
export interface ItemRevision {
  /** The ETag a conditional read answered with; left out when it was no such read. */
  etag?: string | null;
  item: MirroredRef;
  snapshot: ItemSnapshot;
  /** Orders two revisions of one item: the service's updated-at in ms as a string, or a record's version. */
  version: string;
}

/**
 * One thing that happened to an item, under its natural key, with the
 * fields a route matches and a model reads (the hub's stored payload).
 */
export interface SourceEvent {
  /** Who it is about: the author of the issue, pull request, discussion or comment. */
  actor: OutsideActor | null;
  /** When it happened, ms. */
  at: number;
  body: string | null;
  /** A pull request's head branch. */
  branch: string | null;
  /**
   * `change`: the event is its revision's change itself (a connector
   * poll's record): stored only when the door writes that revision.
   */
  change?: true;
  /** A comment's own id, and when it was last edited (ms); set on a comment event. */
  comment?: { editedAt: number | null; id: string };
  /** A record, whole. */
  data?: unknown;
  /** A pull request's: whether it is a draft as it was listed. */
  draft?: boolean;
  /** The item it happened to; null for a delivery that names none (a generic webhook). */
  item: MirroredRef | null;
  /**
   * Natural, never a transport's id: a poll and a webhook of one change
   * carry the same one (`issue:12:opened`, `pr:3:closed@1764050000000`,
   * `comment:991`, `<record id>:<version>`).
   */
  key: string;
  /** `issue.opened`, `pr.merged`, `comment.created`, `item`. */
  kind: string;
  labels: string[];
  /** The issue's, pull request's or discussion's number. */
  number?: number;
  /** What an event route's source pattern matches: `github:<owner>/<repo>`, `conn:<connection>:<tool>`. */
  source: string;
  title: string | null;
  url: string | null;
}

/** One item of a board as a read found it: its id on the board, and the column option it stands in (null: none). */
export interface BoardItem {
  itemId: string;
  optionId: string | null;
}

/**
 * A board whose column carries a tracker's stages (a GitHub Project's
 * Status), as one read of it found it: its column field and options, and
 * the container's issues on it by key; the service's words when the
 * connection may not read it; or none to read.
 */
export type BoardRead =
  | {
      /** Every item was read: an issue missing from `items` is not on it. */
      complete: boolean;
      fieldId: string | null;
      /** The board's id (a Project's node id). */
      id: string;
      items: Record<string, BoardItem>;
      kind: "read";
      number: number;
      options: { id: string; name: string }[];
      title: string;
      url: string;
    }
  | { kind: "refused"; words: string }
  /** The connection reads the Projects now, and none is linked to the container: no board. */
  | { kind: "none" };

/** What one read or delivery holds. */
export interface Ingested {
  /** A board stream's read: what the tracker sync reads its stages' column off (hub sync.ts). */
  board?: BoardRead;
  events: SourceEvent[];
  revisions: ItemRevision[];
  /**
   * The revisions are every item of this container now (a connector
   * poll's answer): an item of it not among them goes, so its return is
   * new again.
   */
  whole?: { container: string };
}

/** Whether a watch's container is synced with its project's tasks: `off` only reads it; `inbound` and `both` are a tracker's directions. */
export type WatchSyncMode = "off" | "inbound" | "both";

/** A watch as a provider reads it: its row without its cursors. */
export interface WatchView {
  connection: string;
  container: string;
  host: string;
  id: string;
  projectId: string;
  provider: MirrorProvider;
  /** The provider's own part of the watch (a connector poll's call, a tracker's board), read field by field. */
  settings: object;
  /** Whether the tracker sync reads its revisions: `off`, or the binding's direction. */
  sync: WatchSyncMode;
}

/** What one stream's read came to; a refusal or no answer is its failure. */
export type Polled<Cursor> =
  /** `baseline`: a first read, whose events are stored as already handled. */
  | { baseline: boolean; cursor: Cursor; ingested: Ingested; kind: "read" }
  | { kind: "unchanged" };

/** One stream read from its cursor. Stores nothing: the hub keeps `cursor` once `ingested` is stored. */
interface PollInput<Client, Cursor> {
  client: Client;
  cursor: Cursor | null;
  now: number;
  /** The hub's deadline on one request, ms. */
  requestMs: number;
  stream: string;
  watch: WatchView;
}

/** How a provider's watches are polled. */
export interface Ingest<Client, Cursor> {
  /** How often a watch is read, ms. */
  everyMs: (watch: WatchView) => number;
  /**
   * The events a revision's move over the state the mirror held says, which
   * no list carries (a reopen): asked by the door for each revision it writes.
   */
  moved?: (revision: ItemRevision, held: MirrorState | null) => SourceEvent[];
  poll: (
    input: PollInput<Client, Cursor>
  ) => Effect.Effect<Polled<Cursor>, ProviderFailure>;
  /** What of a watch a read depends on: a read during which this moved is dropped. */
  readsBy: (watch: WatchView) => unknown;
  /** The streams a watch polls, in order. */
  streams: (watch: WatchView) => readonly string[];
}

/** What one read of one item came to: its revision, nothing new (a 304), or gone; a refusal or no answer is its failure. */
export type ItemRead =
  | { kind: "read"; revision: ItemRevision }
  | { kind: "unchanged" }
  | { kind: "gone" };

/** Single-item reads: a link's item, or a tracker's issue, read now. */
export interface Items<Client> {
  kinds: readonly ItemKind[];
  /** One item, read conditionally with `etag` where the service has ETags, each request within `requestMs`. */
  read: (
    client: Client,
    item: MirroredRef,
    etag: string | null,
    requestMs: number
  ) => Effect.Effect<ItemRead, ProviderFailure>;
}

// --- sync ---------------------------------------------------------------------

/** Linear's six categories, which GitHub's states take too ("statuses belong to fixed categories: triage, backlog, unstarted, started, completed, canceled", linear.app/docs/configuring-workflows). */
export type StateType =
  "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";

/** One state an issue can be in on its tracker. */
export interface IssueState {
  name: string;
  /** What names it to the tracker: `open`, `closed:completed`, a Linear state's id. */
  token: string;
  type: StateType;
}

/** A container a tracker binds to, as its choice lists it. */
export interface SyncTarget {
  /** GitHub: `owner/repo`; Linear: the team's id. */
  id: string;
  /** `owner/repo`, or `ENG · Engineering`. */
  name: string;
  /** GitHub: the repository as a repository picker draws it (hub core `GhRepo`). */
  repo?: {
    description: string | null;
    isPrivate: boolean;
    nameWithOwner: string;
    owner: { avatarUrl: string; kind: "user" | "org"; login: string };
    sshUrl: string;
    updatedAt: string;
    url: string;
  };
  url: string;
}

/**
 * What the tracker sync (hub sync.ts) reads of a container besides what
 * the door brings it (provider spec §2.3 `Sync`): the containers a
 * connection reaches, one described, its issues' states, one issue now,
 * and the key a URL's issue goes by there. Its writes are `writes.run`'s.
 */
export interface Sync<Client> {
  describe: (
    client: Client,
    container: string,
    requestMs: number
  ) => Effect.Effect<SyncTarget, ProviderFailure>;
  /** One issue of the container read now; null when it is gone from it (deleted, moved, or no issue). */
  issue: (
    client: Client,
    container: string,
    key: string,
    requestMs: number
  ) => Effect.Effect<ItemRevision | null, ProviderFailure>;
  /** The key of the issue a URL names on the container; undefined when it names none there. */
  keyOf: (
    client: Client,
    container: string,
    url: string,
    requestMs: number
  ) => Effect.Effect<string | undefined, ProviderFailure>;
  /** Every state the container's issues can be in, in the tracker's own order. */
  states: (
    client: Client,
    container: string,
    requestMs: number
  ) => Effect.Effect<IssueState[], ProviderFailure>;
  /** The containers a connection reaches (`app`: it is an app's installation); `more` when a search would find more. */
  targets: (
    client: Client,
    requestMs: number,
    asked: { app: boolean; search?: string }
  ) => Effect.Effect<{ more: boolean; targets: SyncTarget[] }, ProviderFailure>;
}

// --- writes -----------------------------------------------------------------

/** An issue or a pull or merge request a write names on its container, by the key the service's API takes. */
export interface ItemKey {
  key: string;
  kind: "issue" | "pr";
}

/** A board a write names: its id, its column field's, and its title for sentences. */
export interface BoardAt {
  field: string;
  id: string;
  title: string;
}

/**
 * One write to a container (provider spec §2.3 `WriteOp`), made by its
 * provider's `writes.run` and sent only through the hub's write door (hub
 * writes.ts). An issue names its state by the service's own token (an
 * issue's `stateToken`); a comment says who said it (`saidBy`) where the
 * service lets the app say so, else in its words.
 */
export type WriteOp =
  | {
      body: string;
      labels?: readonly string[];
      op: "issue.create";
      stateToken?: string;
      title: string;
    }
  | {
      body?: string;
      key: string;
      labels?: readonly string[];
      op: "issue.update";
      stateToken?: string;
      title?: string;
    }
  | { body: string; on: ItemKey; op: "comment.create"; saidBy?: string }
  | {
      base: string;
      body: string;
      head: string;
      op: "change-request.open";
      title: string;
    }
  /** The open issue whose body holds `marker`; `search` is a word of it the service's issue search finds it by. */
  | { marker: string; op: "issue.find-marked"; search: string }
  /** Issue `key` put in column `option` of a board: added to it first when it is not on it (`boardItem` null). */
  | {
      board: BoardAt;
      boardItem: string | null;
      key: string;
      op: "board.place";
      option: string;
    }
  /** The board's columns with one added for each of `names` it has none named as; none removed or renamed. */
  | { board: BoardAt; names: readonly string[]; op: "board.columns" }
  | { name: string; op: "repo.create"; private: boolean };

export type WriteOpName = WriteOp["op"];

/** A comment a write made: its own id, its URL, and when it was written, ms. */
export interface MadeComment {
  at: number;
  id: string;
  url: string;
}

/**
 * What every write answers, as the write door records it: the item it
 * made, changed or found (null: none), the comment it made, and whether
 * what it was asked for was there already (an open change request for the
 * same branches).
 */
export interface WriteMade {
  comment?: MadeComment;
  existing?: boolean;
  item: ItemRef | null;
}

/** What each write answers. */
export interface WrittenOf {
  "board.columns": WriteMade & {
    /** The names it added: none when every one had a column. */
    added: string[];
    options: { id: string; name: string }[];
  };
  "board.place": WriteMade & { placed: BoardItem };
  "change-request.open": WriteMade & { existing: boolean; item: ItemRef };
  "comment.create": WriteMade & { comment: MadeComment; item: ItemRef };
  "issue.create": WriteMade & { item: ItemRef; revision: ItemRevision };
  "issue.find-marked": WriteMade;
  "issue.update": WriteMade & { item: ItemRef; revision: ItemRevision };
  "repo.create": WriteMade & {
    repo: { cloneUrl: string; fullName: string; url: string };
  };
}

export type Written = WrittenOf[WriteOpName];

/** Each write a provider makes, by its op. */
export type WriteHandlers<Client> = {
  readonly [N in WriteOpName]?: (
    client: Client,
    container: string,
    op: Extract<WriteOp, { op: N }>
  ) => Effect.Effect<WrittenOf[N], ProviderFailure>;
};

/** A provider's writes (provider spec §2.3). */
export interface Writes<Client> {
  /** Each op's own write, typed by its op: what the hub's sync calls by name. */
  handlers: WriteHandlers<Client>;
  /** The ops it has; any other is refused in words. */
  ops: readonly WriteOpName[];
  /** One write to `container`, through `client`, whichever op it is. */
  run: (
    client: Client,
    container: string,
    op: WriteOp
  ) => Effect.Effect<Written, ProviderFailure>;
}
