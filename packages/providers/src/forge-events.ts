/**
 * What an issue, a pull or merge request, or a comment on one becomes as
 * events, said once for the forges whose ingest reads them item by item
 * (GitLab's and Gitea's): a forge's reader names what it read, and the
 * events come out here under the keys of event-keys.ts, so its poll, its
 * webhook and its write name one change alike.
 */
import { Effect } from "effect";
import { CONNECTOR_MIN_S } from "./connection/descriptor";
import { eventKeys } from "./event-keys";
import type {
  ExternalActor,
  Ingest,
  Ingested,
  ItemRevision,
  MirroredRef,
  Polled,
  SourceEvent,
  WatchView,
} from "./provider";
import { type ProviderFailure, refusedWith } from "./read-stop";
import { reopenedBy } from "./reopen";

/** An issue or pull request as a forge's reader read it: its revision and what its events say of it. */
export interface ForgeItem {
  /** A pull request's head branch; null for an issue. */
  branch: string | null;
  /** When it was closed, ms, unmerged; null while open or once merged. */
  closedAt: number | null;
  createdAt: number;
  /** When it was merged, ms; null for an issue or an unmerged one. */
  mergedAt: number | null;
  number: number;
  revision: ItemRevision;
  /** What an event route's source pattern matches of its container. */
  source: string;
}

/**
 * An item's revision and events: its opening, and its merge or its close,
 * each at or after `edge`, and of `only` kinds when named (a webhook's
 * action).
 */
export const itemRead = (
  one: ForgeItem,
  edge: number,
  only?: ReadonlySet<string>
): Ingested => {
  const { item, snapshot } = one.revision;
  const kind = item.kind === "pr" ? "pr" : "issue";
  const key = String(one.number);
  const base = {
    item,
    source: one.source,
    actor: snapshot.author && { ...snapshot.author, unvouched: null },
    labels: snapshot.labels,
    branch: one.branch,
    url: item.url,
    title: snapshot.title,
    body: snapshot.body ?? null,
    number: one.number,
    ...(kind === "pr" ? { draft: snapshot.state === "draft" } : {}),
  };
  const events: SourceEvent[] = [
    {
      ...base,
      key: eventKeys.opened(kind, key),
      kind: `${kind}.opened`,
      at: one.createdAt,
    },
  ];
  if (one.mergedAt !== null) {
    events.push({
      ...base,
      key: `pr:${key}:merged`,
      kind: "pr.merged",
      at: one.mergedAt,
    });
  } else if (one.closedAt !== null) {
    events.push({
      ...base,
      key: eventKeys.closed(kind, key, one.closedAt),
      kind: `${kind}.closed`,
      at: one.closedAt,
    });
  }
  return {
    revisions: [one.revision],
    events: events.filter(
      (event) =>
        event.at >= edge && (only === undefined || only.has(event.kind))
    ),
  };
};

/** A comment on an issue or pull request as its event, keyed by its own id. */
export const commentEvent = (comment: {
  actor: ExternalActor | null;
  body: string | null;
  createdAt: number;
  id: number;
  item: MirroredRef;
  source: string;
  updatedAt: number;
  url: string;
}): SourceEvent => ({
  item: comment.item,
  source: comment.source,
  key: `comment:${comment.id}`,
  kind: "comment.created",
  actor: comment.actor && { ...comment.actor, unvouched: null },
  labels: [],
  branch: null,
  url: comment.url,
  title: null,
  body: comment.body,
  number: Number(comment.item.key),
  at: comment.createdAt,
  comment: {
    id: String(comment.id),
    editedAt: comment.updatedAt > comment.createdAt ? comment.updatedAt : null,
  },
});

/** Where a forge's stream's read stands: the newest time it took in, ms. */
export interface SinceCursor {
  since: number;
}

/** A forge every poll of the one loop, as GitHub (Projects spec §5.5). */
const EVERY_MS = CONNECTOR_MIN_S * 1000;

/** One stream read from its cursor: what a forge's ingest polls. */
interface StreamRead<Client> {
  client: Client;
  cursor: SinceCursor | null;
  now: number;
  requestMs: number;
  watch: WatchView;
}

/**
 * A forge's ingest (provider spec §2.3): `streams` read each 60 s by
 * `read`, the window of each its cursor's mark; reopens read off revisions
 * (reopen.ts), under the source `sourceOf` names an item's container by.
 */
export const forgeIngest = <Client, Stream extends string>(spec: {
  read: (
    input: StreamRead<Client>,
    stream: Stream
  ) => Effect.Effect<Polled<SinceCursor>, ProviderFailure>;
  service: string;
  sourceOf: (host: string, container: string) => string;
  streams: readonly Stream[];
}): Ingest<Client, SinceCursor> => {
  const isStream = (stream: string): stream is Stream =>
    spec.streams.some((one) => one === stream);
  return {
    everyMs: () => EVERY_MS,
    streams: () => spec.streams,
    readsBy: (watch) => [watch.host, watch.container, watch.connection],
    poll: (input) =>
      isStream(input.stream)
        ? spec.read(
            {
              client: input.client,
              cursor: input.cursor,
              now: input.now,
              requestMs: input.requestMs,
              watch: input.watch,
            },
            input.stream
          )
        : Effect.fail(
            refusedWith(`${spec.service} has no stream ${input.stream}.`)
          ),
    moved: reopenedBy((item) => spec.sourceOf(item.host, item.container)),
  };
};

/** A forge's item a page names, on the watch's host and container; undefined for any other. */
export const refOnWatch = (
  itemOfUrl: (url: URL) => MirroredRef | undefined,
  watch: WatchView,
  url: string
): MirroredRef | undefined => {
  let item: MirroredRef | undefined;
  try {
    item = itemOfUrl(new URL(url));
  } catch {
    return;
  }
  return item &&
    item.container === watch.container.toLowerCase() &&
    item.host === watch.host
    ? item
    : undefined;
};
