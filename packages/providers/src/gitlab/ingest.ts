/**
 * GitLab's ingest (provider spec §2.3, §2.9): what an issue, a merge request
 * or a note becomes as revisions and events, and the poll of a project's
 * three streams that finds them. The hub's door (intake.ts `take`) stores
 * what it answers; this file stores nothing.
 *
 * - **Keys.** The poll, a webhook (gitlab/webhook.ts) and a write
 *   (gitlab/writes.ts) name one change by one key (event-keys.ts):
 *   `issue:<iid>:opened`, `issue:<iid>:closed@<closed_at ms>`,
 *   `pr:<iid>:opened`, `pr:<iid>:merged`, `pr:<iid>:closed@<closed_at ms>`,
 *   `comment:<note id>`; a reopen is read off the revision (reopen.ts).
 *   Issues and merge requests are numbered apart, each its own iid. The
 *   source is {@link gitlabSource}: `gitlab:<path>`, its host before the
 *   path on a self-managed GitLab.
 * - **Streams.** `issues` and `merge_requests` are each project's list
 *   "updated_after" the stream's mark, newest updated first
 *   (docs.gitlab.com/api/issues, docs.gitlab.com/api/merge_requests).
 *   `notes` is the project's events of `target_type=note` "created after
 *   the specified date" (docs.gitlab.com/api/events, `GET
 *   /projects/:project_id/events`): REST has no list of a project's notes
 *   across its issues and merge requests, and each event of a note carries
 *   the note whole (its id, body, author, `noteable_type` and
 *   `noteable_iid`). `after` takes a date alone, so the read asks from the
 *   day before the mark and keeps what is past the window's edge. GitLab's
 *   REST lists answer no ETag (docs.gitlab.com/api/rest names none), so a
 *   read is narrowed by its mark alone. A system note (GitLab's own "changed
 *   the description") is no one's words and lands nowhere.
 * - **A first read is a baseline**: its events are kept as handled. A
 *   short overlap reads the window's edge again, which the keys make
 *   harmless.
 * - **Standing.** The author of an issue, merge request or note opened in
 *   the window has their role on the project read (gitlab/actor.ts), so
 *   the outsider rule holds on the poll as on a webhook.
 */
import { Effect, Result, Schema } from "effect";
import {
  commentEvent,
  forgeIngest,
  itemRead,
  refOnWatch,
  type SinceCursor,
} from "../forge-events";
import type {
  ExternalState,
  Ingested,
  ItemRevision,
  MirroredRef,
  Polled,
  SourceEvent,
  WatchView,
} from "../provider";
import type { ProviderFailure } from "../read-stop";
import { GitLabUserSchema, gitlabActorOf, vouchedEvents } from "./actor";
import { type GitLabClient, gitlabAsk, gitlabSource } from "./client";
import { gitlab } from "./descriptor";

/** The streams a project's watch is polled for, in order. */
const GITLAB_STREAMS = ["issues", "merge_requests", "notes"] as const;
type GitLabStream = (typeof GITLAB_STREAMS)[number];

/** Where one stream's read stands (forge-events.ts). */
export type GitLabStreamCursor = SinceCursor;

/** The edge of the window read again each poll: late-visible changes are not missed. Our choice. */
const OVERLAP_MS = 2 * 60_000;
const PER_PAGE = 100;

const label = Schema.Union([
  Schema.String,
  Schema.Struct({
    name: Schema.optional(Schema.String),
    title: Schema.optional(Schema.String),
  }),
]);
type Label = (typeof label)["Type"];
const labelsOf = (labels: readonly Label[] | null | undefined): string[] =>
  (labels ?? []).flatMap((one) => {
    if (typeof one === "string") {
      return [one];
    }
    const name = one.name ?? one.title;
    return name ? [name] : [];
  });

const optionalTime = Schema.optional(Schema.NullOr(Schema.String));

/** An issue as GitLab's REST answers it (the fields read here). */
export const GitLabIssueSchema = Schema.Struct({
  author: Schema.optional(Schema.NullOr(GitLabUserSchema)),
  closed_at: optionalTime,
  created_at: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.Number,
  iid: Schema.Number,
  labels: Schema.optional(Schema.NullOr(Schema.Array(label))),
  state: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
  web_url: Schema.String,
});
export type GitLabIssue = (typeof GitLabIssueSchema)["Type"];

/** A merge request as GitLab's REST answers it (the fields read here). */
export const GitLabMergeRequestSchema = Schema.Struct({
  author: Schema.optional(Schema.NullOr(GitLabUserSchema)),
  closed_at: optionalTime,
  created_at: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  draft: Schema.optional(Schema.NullOr(Schema.Boolean)),
  id: Schema.Number,
  iid: Schema.Number,
  labels: Schema.optional(Schema.NullOr(Schema.Array(label))),
  merged_at: optionalTime,
  source_branch: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
  web_url: Schema.String,
  work_in_progress: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
export type GitLabMergeRequest = (typeof GitLabMergeRequestSchema)["Type"];

/** A note as an event of the project's names it, and as a Note Hook's `object_attributes` with its `user`. */
const NoteSchema = Schema.Struct({
  author: GitLabUserSchema,
  body: Schema.String,
  created_at: Schema.String,
  id: Schema.Number,
  noteable_iid: Schema.optional(Schema.NullOr(Schema.Number)),
  noteable_type: Schema.optional(Schema.NullOr(Schema.String)),
  system: Schema.optional(Schema.NullOr(Schema.Boolean)),
  updated_at: optionalTime,
});
type GitLabNote = (typeof NoteSchema)["Type"];

const EventSchema = Schema.Struct({
  created_at: Schema.String,
  note: Schema.optional(Schema.NullOr(NoteSchema)),
});

const TIME_UTC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/u;

/** A GitLab time, ms: ISO 8601, or a webhook's older `2013-12-03 17:23:34 UTC`. */
const gitlabMs = (time: string): number => {
  const older = TIME_UTC.exec(time);
  return Date.parse(older ? `${older[1]}T${older[2]}Z` : time);
};

const NOTHING: Ingested = { events: [], revisions: [] };

/** The UTC date of the day before `at`, `YYYY-MM-DD`: what the events list's `after` takes ("returns events created after the specified date"). */
const dayBefore = (at: number): string => {
  const day = new Date(Math.max(0, at));
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

/** A merge request's or issue's segment of its page's path. */
const SEGMENT = { issue: "issues", pr: "merge_requests" } as const;

/** An item of project `path` on `host`, as the mirror keys it: by the descriptor's own reading of its page. */
export const gitlabRef = (
  host: string,
  path: string,
  kind: "issue" | "pr",
  iid: number
): MirroredRef | undefined =>
  gitlab.itemOfUrl(
    new URL(`https://${host}/${path}/-/${SEGMENT[kind]}/${iid}`)
  );

/** An item a GitLab page names, on the watch's host and project; undefined for any other. */
const refAt = (watch: WatchView, url: string): MirroredRef | undefined =>
  refOnWatch(gitlab.itemOfUrl, watch, url);

/** What an event route matches of the watch's project. */
const sourceOfWatch = (watch: WatchView): string =>
  gitlabSource(watch.host, watch.container);

/** An issue's state as an outside item's. */
const issueState = (state: string): ExternalState =>
  state === "closed" ? "closed" : "open";

/** A merge request's state as an outside item's: merged, closed (or locked) unmerged, a draft, or open. */
const mergeRequestState = (one: GitLabMergeRequest): ExternalState => {
  if (one.state === "merged") {
    return "merged";
  }
  if (one.state === "closed" || one.state === "locked") {
    return "closed";
  }
  return one.draft || one.work_in_progress ? "draft" : "open";
};

/** An issue's revision of `ref`. */
export const gitlabIssueRevision = (
  one: GitLabIssue,
  ref: MirroredRef,
  host: string
): ItemRevision => {
  const open = issueState(one.state) === "open";
  return {
    item: ref,
    version: String(gitlabMs(one.updated_at)),
    snapshot: {
      externalId: String(one.id),
      title: one.title,
      state: issueState(one.state),
      stateName: "",
      stateToken: open ? "open" : "closed",
      author: gitlabActorOf(one.author, host),
      labels: labelsOf(one.labels),
      body: one.description ?? null,
      createdAt: gitlabMs(one.created_at),
    },
  };
};

/** A merge request's revision of `ref`. */
export const gitlabMergeRequestRevision = (
  one: GitLabMergeRequest,
  ref: MirroredRef,
  host: string
): ItemRevision => ({
  item: ref,
  version: String(gitlabMs(one.updated_at)),
  snapshot: {
    externalId: String(one.id),
    title: one.title,
    state: mergeRequestState(one),
    stateName: "",
    author: gitlabActorOf(one.author, host),
    labels: labelsOf(one.labels),
    body: one.description ?? null,
    branch: one.source_branch ?? null,
    createdAt: gitlabMs(one.created_at),
  },
});

/**
 * An issue's revision and events: its opening and its close, each at or
 * after `edge`, and of `only` kinds when named (a webhook's action).
 */
export const gitlabIssueRead = (
  watch: WatchView,
  one: GitLabIssue,
  edge: number,
  only?: ReadonlySet<string>
): Ingested => {
  const ref = refAt(watch, one.web_url);
  return ref?.kind === "issue"
    ? itemRead(
        {
          revision: gitlabIssueRevision(one, ref, watch.host),
          source: sourceOfWatch(watch),
          number: one.iid,
          branch: null,
          createdAt: gitlabMs(one.created_at),
          closedAt:
            one.state === "closed" && one.closed_at
              ? gitlabMs(one.closed_at)
              : null,
          mergedAt: null,
        },
        edge,
        only
      )
    : NOTHING;
};

/**
 * A merge request's revision and events: its opening, and its merge or
 * close, each at or after `edge`, and of `only` kinds when named.
 */
export const gitlabMergeRequestRead = (
  watch: WatchView,
  one: GitLabMergeRequest,
  edge: number,
  only?: ReadonlySet<string>
): Ingested => {
  const ref = refAt(watch, one.web_url);
  if (ref?.kind !== "pr") {
    return NOTHING;
  }
  const revision = gitlabMergeRequestRevision(one, ref, watch.host);
  return itemRead(
    {
      revision,
      source: sourceOfWatch(watch),
      number: one.iid,
      branch: one.source_branch ?? null,
      createdAt: gitlabMs(one.created_at),
      mergedAt:
        one.state === "merged" && one.merged_at
          ? gitlabMs(one.merged_at)
          : null,
      closedAt:
        revision.snapshot.state === "closed" && one.closed_at
          ? gitlabMs(one.closed_at)
          : null,
    },
    edge,
    only
  );
};

/** The kinds of item a note is written on, by GitLab's `noteable_type`. */
const NOTED: Readonly<Record<string, "issue" | "pr">> = {
  Issue: "issue",
  MergeRequest: "pr",
};

/** A note's own page: its item's, at `#note_<id>` (the anchor the descriptor reads a comment by). */
const noteUrl = (ref: MirroredRef, id: number): string =>
  `${ref.url}#note_${id}`;

/** A note on an issue or merge request as its comment event; none for a system note or one on anything else. */
export const gitlabNoteEvent = (
  watch: WatchView,
  note: GitLabNote
): SourceEvent | undefined => {
  const kind = NOTED[note.noteable_type ?? ""];
  const iid = note.noteable_iid;
  if (note.system || !kind || iid === null || iid === undefined) {
    return;
  }
  const ref = gitlabRef(watch.host, watch.container, kind, iid);
  if (!ref) {
    return;
  }
  const createdAt = gitlabMs(note.created_at);
  return commentEvent({
    item: ref,
    source: sourceOfWatch(watch),
    id: note.id,
    url: noteUrl(ref, note.id),
    body: note.body,
    actor: gitlabActorOf(note.author, watch.host),
    createdAt,
    updatedAt: note.updated_at ? gitlabMs(note.updated_at) : createdAt,
  });
};

/** A note as GitLab's REST answers it, or a Note Hook's `object_attributes` read into that shape; undefined for anything else. */
export const gitlabNoteOf = (raw: unknown): GitLabNote | undefined => {
  const read = Schema.decodeUnknownResult(NoteSchema)(raw);
  return Result.isSuccess(read) ? read.success : undefined;
};

/** The ids GitLab names each author by in `users`, by login: what their standing is read by. */
export const idsOf = (
  users: readonly ({ id: number; username: string } | null | undefined)[]
): Map<string, number> =>
  new Map(
    users.flatMap((user) => (user ? [[user.username, user.id] as const] : []))
  );

/** What one stream's pages held in the window, the newest time in them, and each author's id. */
interface Taken {
  ids: Map<string, number>;
  ingested: Ingested;
  newest: number;
}

/** One page of a GitLab list: its rows, and the next page's number (null: none). */
interface Page {
  next: number | null;
  rows: readonly unknown[];
}

/** The parts of a poll a stream's read takes. */
interface StreamRead {
  client: GitLabClient;
  cursor: GitLabStreamCursor | null;
  now: number;
  requestMs: number;
  watch: WatchView;
}

/** Page `page` of a stream's list, from the window's edge, within the hub's deadline. */
const pageOf = (
  read: StreamRead,
  stream: GitLabStream,
  page: number,
  edge: number
): Effect.Effect<Page, ProviderFailure> => {
  const path = read.watch.container;
  const { api } = read.client;
  const after = new Date(Math.max(0, edge)).toISOString();
  const paged = {
    perPage: PER_PAGE,
    page,
    pagination: "offset",
    showExpanded: true,
  } as const;
  const asked = (): Promise<{
    data: unknown[];
    paginationInfo: { next: number | null };
  }> => {
    switch (stream) {
      case "issues":
        return api.Issues.all({
          projectId: path,
          scope: "all",
          updatedAfter: after,
          orderBy: "updated_at",
          sort: "desc",
          ...paged,
        });
      case "merge_requests":
        return api.MergeRequests.all({
          projectId: path,
          scope: "all",
          updatedAfter: after,
          orderBy: "updated_at",
          sort: "desc",
          ...paged,
        });
      case "notes":
        return api.Events.all({
          projectId: path,
          targetType: "note",
          after: dayBefore(edge),
          sort: "desc",
          ...paged,
        });
    }
  };
  return gitlabAsk(
    read.requestMs,
    `list the ${stream.replace("_", " ")}`,
    path,
    asked
  ).pipe(
    Effect.map((answer) => ({
      rows: answer.data,
      next: answer.paginationInfo.next,
    }))
  );
};

/** One row of a stream as read: when it moved, what it says from the window's edge, and the authors it names; undefined for a row that is no such thing. */
type RowRead = (
  watch: WatchView,
  row: unknown,
  edge: number
) =>
  | {
      at: number;
      read: Ingested;
      users: readonly ({ id: number; username: string } | null | undefined)[];
    }
  | undefined;

/** Each stream's row reader. */
const ROWS: Readonly<Record<GitLabStream, RowRead>> = {
  issues: (watch, row, edge) => {
    const one = Schema.decodeUnknownResult(GitLabIssueSchema)(row);
    return Result.isSuccess(one)
      ? {
          at: gitlabMs(one.success.updated_at),
          read: gitlabIssueRead(watch, one.success, edge),
          users: [one.success.author],
        }
      : undefined;
  },
  merge_requests: (watch, row, edge) => {
    const one = Schema.decodeUnknownResult(GitLabMergeRequestSchema)(row);
    return Result.isSuccess(one)
      ? {
          at: gitlabMs(one.success.updated_at),
          read: gitlabMergeRequestRead(watch, one.success, edge),
          users: [one.success.author],
        }
      : undefined;
  },
  notes: (watch, row) => {
    const one = Schema.decodeUnknownResult(EventSchema)(row);
    if (!Result.isSuccess(one)) {
      return;
    }
    const { note } = one.success;
    const event = note ? gitlabNoteEvent(watch, note) : undefined;
    return {
      at: gitlabMs(one.success.created_at),
      read: { revisions: [], events: event ? [event] : [] },
      users: [note?.author],
    };
  },
};

/** One row of a stream read into `taken`; whether it lies past the window's edge (the list is newest first). */
const readRow = (
  watch: WatchView,
  stream: GitLabStream,
  row: unknown,
  edge: number,
  taken: Taken
): boolean => {
  const said = ROWS[stream](watch, row, edge);
  if (!said) {
    return false;
  }
  if (said.at < edge) {
    return true;
  }
  taken.newest = Math.max(taken.newest, said.at);
  add(taken, said.read, said.users);
  return false;
};

/** A row's revisions, events and authors' ids taken in. */
const add = (
  taken: Taken,
  read: Ingested,
  users: readonly ({ id: number; username: string } | null | undefined)[]
): void => {
  taken.ingested.revisions.push(...read.revisions);
  taken.ingested.events.push(...read.events);
  for (const [login, id] of idsOf(users)) {
    taken.ids.set(login, id);
  }
};

/** One stream read from its mark: page after page, newest first, until the window's edge; its words' authors' standing read after. */
const pollStream = Effect.fnUntraced(function* (
  read: StreamRead,
  stream: GitLabStream
) {
  const since = read.cursor?.since ?? read.now;
  const edge = since - OVERLAP_MS;
  const taken: Taken = {
    ids: new Map(),
    ingested: { revisions: [], events: [] },
    newest: since,
  };
  let page: number | null = 1;
  while (page !== null) {
    const answer: Page = yield* pageOf(read, stream, page, edge);
    let past = false;
    for (const row of answer.rows) {
      past = readRow(read.watch, stream, row, edge, taken) || past;
    }
    page = past ? null : answer.next;
  }
  const events = yield* vouchedEvents(
    read.client,
    read.watch.container,
    taken.ingested.events,
    taken.ids,
    read.requestMs
  );
  const polled: Polled<GitLabStreamCursor> = {
    kind: "read",
    baseline: read.cursor === null,
    ingested: { revisions: taken.ingested.revisions, events },
    cursor: { since: taken.newest },
  };
  return polled;
});

/** GitLab's ingest: a project's issues, merge requests and notes every 60 s; reopens read off its revisions. */
export const gitlabIngest = forgeIngest<GitLabClient, GitLabStream>({
  service: "GitLab",
  streams: GITLAB_STREAMS,
  read: pollStream,
  sourceOf: gitlabSource,
});
