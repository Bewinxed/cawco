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
  /** A generic record, as the tool answered it. */
  data?: unknown;
  /** GitHub's node id, Linear's uuid; empty for a record. */
  externalId: string;
  labels: string[];
  state: MirrorState | null;
  /** The source's own word: "Open", "Closed as not planned", a run's conclusion. */
  stateName: string;
  title: string;
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

/** What one read or delivery holds. */
export interface Ingested {
  events: SourceEvent[];
  revisions: ItemRevision[];
  /**
   * The revisions are every item of this container now (a connector
   * poll's answer): an item of it not among them goes, so its return is
   * new again.
   */
  whole?: { container: string };
}

/** A read's problem in the service's words; `resumeAt` when its rate limit says to wait. */
export interface ProviderProblem {
  resumeAt: number | null;
  words: string;
}

/** A read the hub bounds in time: answered, or let go after `after` ms (the hub's core `Bounded`). */
export type Asked<T> =
  | { kind: "answered"; value: T }
  | { after: number; kind: "unanswered"; reason: "timeout" | "dead" };

/** The hub's deadline on one request: the request gets the signal that aborts when its time is up. */
export type Within = <T>(
  read: (signal: AbortSignal) => Promise<T>
) => Promise<Asked<T>>;

/** A watch as a provider reads it: its row without its cursors. */
export interface WatchView {
  connection: string;
  container: string;
  host: string;
  id: string;
  projectId: string;
  provider: MirrorProvider;
  /** The provider's own part of the watch (a connector poll's call), read field by field. */
  settings: object;
}

/** What one stream's read came to. */
export type Polled<Cursor> =
  /** `baseline`: a first read, whose events are stored as already handled. */
  | { baseline: boolean; cursor: Cursor; ingested: Ingested; kind: "read" }
  | { kind: "unchanged" }
  | { kind: "stopped"; problem: ProviderProblem }
  /** A request the service did not answer in time: nothing moves, and nothing is said of the watch. */
  | { after: number; kind: "unanswered" };

/** One stream read from its cursor. Stores nothing: the hub keeps `cursor` once `ingested` is stored. */
interface PollInput<Client, Cursor> {
  client: Client;
  cursor: Cursor | null;
  now: number;
  stream: string;
  watch: WatchView;
  within: Within;
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
  poll: (input: PollInput<Client, Cursor>) => Promise<Polled<Cursor>>;
  /** What of a watch a read depends on: a read during which this moved is dropped. */
  readsBy: (watch: WatchView) => unknown;
  /** The streams a watch polls, in order. */
  streams: (watch: WatchView) => readonly string[];
}

/** What one read of one item came to: its revision, nothing new (a 304), gone, or the service's problem. */
export type ItemRead =
  | { kind: "read"; revision: ItemRevision }
  | { kind: "unchanged" }
  | { kind: "gone" }
  | { kind: "stopped"; problem: ProviderProblem }
  /** The service did not answer within the hub's deadline, after this long, ms. */
  | { after: number; kind: "unanswered" };

/** Single-item reads: a link's item, read now. */
export interface Items<Client> {
  kinds: readonly ItemKind[];
  /** One item, read conditionally with `etag` where the service has ETags. */
  read: (
    client: Client,
    item: MirroredRef,
    etag: string | null,
    within: Within
  ) => Promise<ItemRead>;
}
