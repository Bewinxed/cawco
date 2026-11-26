/**
 * The write door (provider spec §2.8): every write CawCo makes to an
 * outside service goes through {@link Writes.post}, which makes it with
 * its provider's `writes.run` and records what it made in the write ledger
 * (db/writes.ts), so the door in (intake.ts) knows CawCo's own when it
 * comes back.
 *
 * THE INVARIANTS:
 * - **One door.** The tracker sync's outbound half (sync.ts), a session's
 *   `forge_post`, a landing's pull request (landing-run.ts), usability
 *   feedback and `create_repo` (repo-publish.ts) all post here. A session's
 *   own calls of a connection's tools are the hub's too: what their answers
 *   name is recorded after ({@link Writes.recordAnswer}).
 * - **Who makes it** (D4). The sync's writes and `create_repo` run in the
 *   hub with a connection's client: the watch's, or the one named. A
 *   session's writes run on its machine with that machine's own sign-in
 *   (agent forges/forge.ts), as one `CONTROL_FORGE_POST`, the same
 *   provider `writes.run` with a client made from the CLI's sign-in; the
 *   machine answers what it made, and it is recorded here.
 * - **Direction.** A write the sync makes (`by` a watch) is refused on a
 *   watch that does not sync `both` ways: an inbound watch writes nothing.
 * - **Recorded before it is read.** Each container's writes hold its
 *   one-at-a-time turn ({@link Writes.settled}) from before they are sent
 *   until they are recorded; the door's subscribers wait on that turn
 *   before they read an event of the container, so an issue a session opens
 *   is CawCo's when the poll or a webhook brings it back, however soon.
 * - **Composed ops.** `issue_once` (usability feedback) is
 *   `issue.find-marked`, then `comment.create` on the issue it found, else
 *   `issue.create` ({@link Writes.issueOnce}).
 */
import {
  type ForgeAsk,
  type ForgeVerdict,
  isMachineWrite,
  type MachineWriteOp,
} from "@cawco/core/forge-post";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import { isOneOf } from "@cawco/core/one-of";
import { secondsOf } from "@cawco/core/time";
import { externalItemWords } from "@cawco/core/words/external-items";
import { changeRequestWords } from "@cawco/core/words/forge";
import { eventKeys } from "@cawco/providers/event-keys";
import type { GitHubClient } from "@cawco/providers/github/client";
import { githubWrites } from "@cawco/providers/github/writes";
import type { LinearClientFor } from "@cawco/providers/linear/client";
import { linearWrites } from "@cawco/providers/linear/writes";
import type {
  ItemRef,
  ProviderId,
  WatchSyncMode,
  WriteMade,
  WriteOp,
  Written,
  WrittenOf,
} from "@cawco/providers/provider";
import { PROVIDER_IDS } from "@cawco/providers/provider";
import type { ProviderFailure, RefusalKind } from "@cawco/providers/read-stop";
import {
  commentOfUrl,
  itemOfUrl,
  linkOfUrl,
  repoAt,
} from "@cawco/providers/registry";
import { Effect, Schema } from "effect";
import type { ExternalWriteDraft, WritesDb } from "./db/writes";

/** Why the door refused a write, as its callers read it: the service's refusal's kind, no answer, a direction that writes nothing, or the machine's own refusal. */
const WRITE_REFUSALS = [
  "sign-in",
  "scope",
  "rate",
  "unreachable",
  "input",
  "unanswered",
  "direction",
  "machine",
] as const;

/** A write the door refused or the service would not make, in words. */
export class WriteRefused extends Schema.TaggedError<WriteRefused>()(
  "WriteRefused",
  {
    reason: Schema.Literals(WRITE_REFUSALS),
    resumeAt: Schema.NullOr(Schema.Number),
    words: Schema.String,
  }
) {}

/** Who a write is by, as the ledger names it (schema `external_writes.by`). */
export type WriteBy =
  { sync: string } | { session: string } | { work: string } | "hub";

/** Where a write is made: through a watch's connection (the sync), a connection named (`create_repo`), or on a machine with its own sign-in. */
export type WriteTarget =
  | { watch: string }
  | {
      connection: string;
      container: string;
      host: string;
      provider: "github" | "linear";
      /** How the binding it writes for syncs, when one does (a binding being made); `off` else. */
      sync?: WatchSyncMode;
    }
  | { machine: string; repo: string };

/** What a machine's write answered, as the door hands it on: its provider and what it made. */
export type MachineWritten = WriteMade & { provider: ProviderId };

/** One write asked of the door. */
export interface PostInput {
  by: WriteBy;
  /** A comment the sync carries out from a task: its entry's heading time, ms. */
  entryAt?: number;
  op: WriteOp;
  /** The project it is written for; null for the hub's own. */
  projectId: string | null;
  target: WriteTarget;
  /** The task it is written for, when one is known: the session's attempt's, the sync's. */
  taskId?: string | null;
}

/**
 * What a post answers: what every write made (its item, its comment), its
 * provider, and the parts of a provider's answer the op has (a write made
 * on a machine hands back no more than what it made).
 */
export type Posted = MachineWritten &
  Partial<
    Pick<
      WrittenOf["issue.create"] &
        WrittenOf["board.place"] &
        WrittenOf["board.columns"] &
        WrittenOf["repo.create"],
      "added" | "options" | "placed" | "repo" | "revision"
    >
  >;

/** A watch as the door reads it. */
export interface WriteWatch {
  connection: string;
  container: string;
  host: string;
  provider: string;
  sync: WatchSyncMode;
}

/** What a machine's write came to: its verdict, or why there is none, in words. */
export type MachineWriteCall =
  { kind: "answered"; verdict: ForgeVerdict } | { kind: "failed"; why: string };

export interface WritesDeps {
  readonly clients: {
    readonly github: (connection: string) => GitHubClient;
    readonly linear: (connection: string) => Promise<LinearClientFor>;
  };
  readonly db: { readonly writes: Pick<WritesDb, "record"> };
  /** Has `machineId` make the write with its own sign-in (agent `CONTROL_FORGE_POST`). */
  readonly machine: (
    machineId: string,
    ask: ForgeAsk
  ) => Promise<MachineWriteCall>;
  /** A watch by its id; undefined when it is gone. */
  readonly watch: (id: string) => WriteWatch | undefined;
}

/** The ledger's `by` for a writer. */
const byOf = (by: WriteBy): string => {
  if (by === "hub") {
    return "hub";
  }
  if ("sync" in by) {
    return `sync:${by.sync}`;
  }
  return "session" in by ? `session:${by.session}` : `work:${by.work}`;
};

/** A provider's failure as the door's refusal. */
const refusedOf = (failure: ProviderFailure): WriteRefused =>
  failure._tag === "ProviderRefused"
    ? new WriteRefused({
        reason: failure.kind satisfies RefusalKind,
        words: failure.words,
        resumeAt: failure.resumeAt,
      })
    : new WriteRefused({
        reason: "unanswered",
        words: `${failure.service} did not answer within ${secondsOf(failure.after)} s. The write may have succeeded.`,
        resumeAt: null,
      });

/** A refusal in words. */
const refuse = (reason: WriteRefused["reason"], words: string) =>
  new WriteRefused({ reason, words, resumeAt: null });

/** The ledger's rows for what one write made: each item it made or changed, each comment it posted. */
const rowsOf = (
  op: WriteOp,
  made: WriteMade & {
    repo?: { fullName: string; url: string };
    events?: readonly string[];
  },
  base: Pick<
    ExternalWriteDraft,
    "by" | "entryAt" | "projectId" | "taskId" | "at"
  > & { provider: ProviderId }
): ExternalWriteDraft[] => {
  const { item } = made;
  if (made.repo) {
    return [
      {
        ...base,
        host: new URL(made.repo.url).host,
        container: made.repo.fullName.toLowerCase(),
        kind: "repo",
        key: made.repo.fullName,
        url: made.repo.url,
      },
    ];
  }
  const of = (one: ItemRef) => ({
    ...base,
    host: one.host,
    container: one.container,
    key: one.key,
    url: one.url,
  });
  if (made.comment && item) {
    return [
      {
        ...of(item),
        kind: "comment",
        commentId: made.comment.id,
        url: made.comment.url,
      },
    ];
  }
  if (!item || made.existing) {
    return [];
  }
  switch (op.op) {
    case "issue.create":
    case "change-request.open":
      return [
        {
          ...of(item),
          kind: item.kind === "pr" ? "pr" : "issue",
          events: [...(made.events ?? [])],
        },
      ];
    case "issue.update":
      return [
        {
          ...of(item),
          kind: "update",
          events: [...(made.events ?? [])],
        },
      ];
    // Each of these makes nothing of its own: it finds, or places, or adds
    // a column; a comment and a repository are recorded above.
    case "comment.create":
    case "issue.find-marked":
    case "board.place":
    case "board.columns":
    case "repo.create":
      return [];
  }
};

/** What a session reads of a machine's write. */
export const madeWords = (op: MachineWriteOp, made: MachineWritten): string => {
  const name = externalItemWords.source[made.provider];
  const url = made.comment?.url ?? made.item?.url ?? "";
  switch (op.op) {
    case "change-request.open": {
      const kind = changeRequestWords(
        made.provider === "gitlab" || made.provider === "gitea"
          ? made.provider
          : "github"
      );
      return made.existing
        ? `${name} has a ${kind} open from ${op.head} into ${op.base} already: ${url}`
        : `${name} opened the ${kind}: ${url}`;
    }
    case "issue.create":
      return `${name} opened the issue: ${url}`;
    case "issue.update":
      return `${name} changed the issue: ${url}`;
    case "comment.create":
      return `${name} took the comment: ${url}`;
    case "issue.find-marked":
      return url
        ? `${name} has the issue open: ${url}`
        : `${name} has no open issue marked so.`;
  }
};

export const createWrites = (deps: WritesDeps) => {
  /** Each container's writes, one at a time, each held until recorded. */
  const containers = makeKeyedLock<string>();
  const keyOf = (host: string, container: string) =>
    `${host.toLowerCase()}/${container.toLowerCase()}`;

  /** The provider's write in the hub, through a connection's client. */
  const inHub = (
    provider: string,
    connection: string,
    container: string,
    op: WriteOp
  ): Effect.Effect<Written, WriteRefused> => {
    switch (provider) {
      case "github":
        return Effect.try({
          try: () => deps.clients.github(connection),
          catch: (error) =>
            refuse(
              "sign-in",
              error instanceof Error ? error.message : String(error)
            ),
        }).pipe(
          Effect.flatMap((client) =>
            githubWrites
              .run(client, container, op)
              .pipe(Effect.mapError(refusedOf))
          )
        );
      case "linear":
        return Effect.tryPromise({
          try: () => deps.clients.linear(connection),
          catch: (error) =>
            refuse(
              "sign-in",
              error instanceof Error ? error.message : String(error)
            ),
        }).pipe(
          Effect.flatMap((client) =>
            linearWrites
              .run(client, container, op)
              .pipe(Effect.mapError(refusedOf))
          )
        );
      default:
        return Effect.fail(
          refuse("input", `Cannot write to ${provider}. Not signed in.`)
        );
    }
  };

  /** The write on a machine with its own sign-in. */
  const onMachine = (
    machineId: string,
    repo: string,
    op: WriteOp
  ): Effect.Effect<
    MachineWritten & { container: string; host: string },
    WriteRefused
  > => {
    if (!isMachineWrite(op)) {
      return Effect.fail(
        refuse("input", `A machine makes no ${op.op} with its own sign-in.`)
      );
    }
    return Effect.promise(() => deps.machine(machineId, { repo, op })).pipe(
      Effect.flatMap((called) => {
        if (called.kind === "failed") {
          return Effect.fail(refuse("unreachable", called.why));
        }
        const { verdict } = called;
        return verdict.kind === "refused"
          ? Effect.fail(refuse("machine", verdict.why))
          : Effect.succeed({
              ...verdict.made,
              provider: verdict.provider,
              host: verdict.host,
              container: verdict.container,
            });
      })
    );
  };

  /**
   * THE write door: `op` made where `target` says, refused on a watch
   * that does not sync both ways when the sync asks, and recorded once
   * made, in its container's turn.
   */
  const post = (input: PostInput): Effect.Effect<Posted, WriteRefused> => {
    const { target, op } = input;
    const record = (
      writtenOn: ProviderId,
      made: Parameters<typeof rowsOf>[1]
    ) => {
      for (const row of rowsOf(op, made, {
        provider: writtenOn,
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        by: byOf(input.by),
        entryAt: input.entryAt ?? null,
        at: new Date(),
      })) {
        deps.db.writes.record(row);
      }
    };
    if ("machine" in target) {
      const at = repoAt(target.repo);
      const key = at ? keyOf(at.host, at.path) : `machine:${target.repo}`;
      const written = onMachine(target.machine, target.repo, op).pipe(
        Effect.tap((made) => Effect.sync(() => record(made.provider, made))),
        Effect.map(
          ({ host: _host, container: _container, ...made }): Posted => made
        )
      );
      return containers.withLock(key, written);
    }
    const at =
      "watch" in target
        ? deps.watch(target.watch)
        : {
            connection: target.connection,
            container: target.container,
            host: target.host,
            provider: target.provider,
            sync: target.sync ?? "off",
          };
    if (!at) {
      return Effect.fail(
        refuse("input", "Cannot write. The watch no longer exists.")
      );
    }
    if (input.by !== "hub" && "sync" in input.by && at.sync !== "both") {
      return Effect.fail(
        refuse(
          "direction",
          `Cannot write to ${at.container}. Sync is ${at.sync === "inbound" ? "inbound only" : "off"}.`
        )
      );
    }
    const { provider } = at;
    if (!isOneOf(PROVIDER_IDS, provider)) {
      return Effect.fail(
        refuse("input", `Writing to ${provider} is not supported.`)
      );
    }
    const written = inHub(provider, at.connection, at.container, op).pipe(
      Effect.tap((made) => Effect.sync(() => record(provider, made))),
      Effect.map((made): Posted => ({ ...made, provider }))
    );
    return containers.withLock(keyOf(at.host, at.container), written);
  };

  /**
   * An issue once (usability feedback): a comment on the open issue whose
   * body holds `marker`, else a new issue. Two of one marker at one moment
   * would both open one: the caller sends one marker's at a time.
   */
  const issueOnce = (input: {
    body: string;
    by: WriteBy;
    marker: string;
    projectId: string | null;
    search: string;
    target: { machine: string; repo: string };
    title: string;
  }): Effect.Effect<MachineWritten, WriteRefused> =>
    Effect.gen(function* () {
      const base = {
        by: input.by,
        projectId: input.projectId,
        target: input.target,
      };
      const found = yield* post({
        ...base,
        op: {
          op: "issue.find-marked",
          marker: input.marker,
          search: input.search,
        },
      });
      if (found.item) {
        const commented = yield* post({
          ...base,
          op: {
            op: "comment.create",
            on: { kind: "issue", key: found.item.key },
            body: input.body,
          },
        });
        return { ...commented, existing: true };
      }
      return yield* post({
        ...base,
        op: { op: "issue.create", title: input.title, body: input.body },
      });
    });

  /**
   * What a session's call of a connection's write tool made, read off its
   * answer (provider spec §2.8, last bullet): each URL in it that names a
   * comment on a linked service is a comment it posted; each that names an
   * issue or pull request, one it wrote. Answers the rows recorded.
   */
  const recordAnswer = (input: {
    projectId: string | null;
    sessionId: string;
    taskId: string | null;
    text: string;
  }): number => {
    const urls = new Set(input.text.match(URLS) ?? []);
    let recorded = 0;
    for (const url of urls) {
      const item = itemOfUrl(url);
      const link = linkOfUrl(url);
      if (!(item && link)) {
        continue;
      }
      const commentId = commentOfUrl(url);
      deps.db.writes.record({
        projectId: input.projectId,
        provider: item.provider,
        host: item.host,
        container: item.container,
        kind: commentId ? "comment" : itemKindOf(link.kind),
        key: item.key,
        commentId: commentId ?? null,
        url: commentId ? url : item.url,
        by: byOf({ session: input.sessionId }),
        taskId: input.taskId,
        entryAt: null,
        // What a tool's answer says of an item is that it names it: its
        // opening is the one event it may have caused that it can be
        // known by. A close or a label it made is not told apart.
        events: commentId
          ? []
          : [eventKeys.opened(itemKindOf(link.kind), item.key)],
        at: new Date(),
      });
      recorded += 1;
    }
    return recorded;
  };

  /** Done once every write to `host`'s `container` asked before it has been recorded. */
  const settled = (host: string, container: string): Effect.Effect<void> =>
    containers.withLock(keyOf(host, container), Effect.void);

  return { issueOnce, post, recordAnswer, settled };
};

/** The ledger's kind for an item a tool's answer names. */
const itemKindOf = (kind: string): "issue" | "pr" =>
  kind === "pr" ? "pr" : "issue";

/** URLs in a tool's answer: up to a quote, a bracket or whitespace. */
const URLS = /https?:\/\/[^\s"'<>()[\]{}]+/gu;

export type Writes = ReturnType<typeof createWrites>;
