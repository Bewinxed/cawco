/**
 * Linear's writes (provider spec §2.3 `Writes`): an issue made or changed
 * on a team, and a comment on one, made only through the hub's write door
 * (hub writes.ts) with the watch's connection.
 *
 * - **Who it writes as.** A Linear app (`actor=app`) writes as the app, and
 *   names who said a comment with `createAsUser` ("rendered in *User (via
 *   Application)* format", linear.app/developers/oauth-actor-authorization);
 *   an API key writes as its person, so the comment says who in its words.
 * - **Labels** are named; each is the team's or the workspace's label of
 *   that name, and a name Linear has none for is refused in words.
 * - **A key** is what Linear's `issue(id:)` takes: its id or its identifier.
 */
import { Effect } from "effect";
import { eventKeys } from "../event-keys";
import type { ItemRef, WriteOp, Writes } from "../provider";
import { writesOf } from "../provider-writes";
import { refusedWith } from "../read-stop";
import { linkOfUrl } from "../registry";
import type { LinearClientFor } from "./client";
import {
  LINEAR_ISSUE_FIELDS,
  type LinearPage,
  type LinearRawIssue,
  linearAsk,
  linearIssueRevision,
  wholeIssue,
} from "./ingest";
import { restOf } from "./sync";

/** The hub's deadline on one request a write sends. Our choice, as the poll's. */
const REQUEST_MS = 30_000;

const LABELS_QUERY = `query CawcoLabels($team: ID!, $after: String) {
  issueLabels(first: 250, after: $after, filter: { or: [{ team: { id: { eq: $team } } }, { team: { null: true } }] }) {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}`;

const CREATE_MUTATION = `mutation CawcoIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { ${LINEAR_ISSUE_FIELDS} } }
}`;

const UPDATE_MUTATION = `mutation CawcoIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { ${LINEAR_ISSUE_FIELDS} } }
}`;

const COMMENT_MUTATION = `mutation CawcoCommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id createdAt url issue { url } } }
}`;

/** Each label name the team's issues can carry (its own and the workspace's), as its id; a name Linear has none for is refused. */
const labelIds = Effect.fnUntraced(function* (
  client: LinearClientFor,
  teamId: string,
  names: readonly string[]
) {
  if (names.length === 0) {
    return [];
  }
  const ask = (after: string | null) =>
    linearAsk<{ issueLabels: LinearPage<{ id: string; name: string }> }>(
      client,
      REQUEST_MS,
      "read its labels",
      LABELS_QUERY,
      { team: teamId, after }
    ).pipe(Effect.map((read) => read.issueLabels));
  const all = yield* restOf(yield* ask(null), ask);
  const byName = new Map(
    all.map((label) => [label.name.toLowerCase(), label.id])
  );
  const missing = names.filter((name) => !byName.has(name.toLowerCase()));
  if (missing.length > 0) {
    return yield* refusedWith(
      `Linear has no label ${missing.map((name) => `“${name}”`).join(", ")} for the team.`
    );
  }
  return names.flatMap((name) => byName.get(name.toLowerCase()) ?? []);
});

/** What an issue's create or update sends: the fields it names, its labels by id. */
const issueInput = Effect.fnUntraced(function* (
  client: LinearClientFor,
  teamId: string,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>
) {
  const ids =
    op.labels === undefined
      ? undefined
      : yield* labelIds(client, teamId, op.labels);
  return {
    ...(op.title === undefined ? {} : { title: op.title }),
    ...(op.body === undefined ? {} : { description: op.body }),
    ...(ids === undefined ? {} : { labelIds: ids }),
    ...(op.stateToken === undefined ? {} : { stateId: op.stateToken }),
  };
});

/** The states a close puts an issue in. */
const SHUT_TYPES: ReadonlySet<string> = new Set(["completed", "canceled"]);

/**
 * The events a write of an issue itself caused, by the keys Linear's poll
 * reads them under (event-keys.ts): its opening when it made it, its close
 * at the `completedAt` or `canceledAt` it set, its reopen at the version it
 * left.
 */
const causedBy = (
  raw: LinearRawIssue,
  key: string,
  version: string,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>
): string[] => {
  const shut = SHUT_TYPES.has(raw.state.type);
  const closedAt = raw.completedAt ?? raw.canceledAt;
  return [
    ...(op.op === "issue.create" ? [eventKeys.opened("issue", key)] : []),
    ...(op.stateToken !== undefined && shut && closedAt
      ? [eventKeys.closed("issue", key, Date.parse(closedAt))]
      : []),
    ...(op.op === "issue.update" && op.stateToken !== undefined && !shut
      ? [eventKeys.reopened("issue", key, version)]
      : []),
  ];
};

/** An issue a write answered, whole, as its ref, its revision and the events the write caused. */
const madeIssue = Effect.fnUntraced(function* (
  client: LinearClientFor,
  raw: LinearRawIssue | null,
  failed: string,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>
) {
  const full = raw ? yield* wholeIssue(client, REQUEST_MS, raw) : null;
  const revision = full ? linearIssueRevision(full) : undefined;
  const item = revision ? linkOfUrl(revision.item.url ?? "") : undefined;
  if (!(full && revision && item)) {
    return yield* refusedWith(failed);
  }
  const ref: ItemRef = item;
  return {
    item: ref,
    revision,
    events: causedBy(full, ref.key, revision.version, op),
  };
});

export const linearWrites: Writes<LinearClientFor> = writesOf("Linear", {
  "issue.create": (client, teamId, op) =>
    Effect.gen(function* () {
      const input = yield* issueInput(client, teamId, op);
      const made = yield* linearAsk<{
        issueCreate: { issue: LinearRawIssue | null; success: boolean };
      }>(client, REQUEST_MS, "create an issue", CREATE_MUTATION, {
        input: { teamId, ...input },
      });
      return yield* madeIssue(
        client,
        made.issueCreate.success ? made.issueCreate.issue : null,
        "Linear did not create the issue.",
        op
      );
    }),

  "issue.update": (client, teamId, op) =>
    Effect.gen(function* () {
      const input = yield* issueInput(client, teamId, op);
      const changed = yield* linearAsk<{
        issueUpdate: { issue: LinearRawIssue | null; success: boolean };
      }>(client, REQUEST_MS, `change ${op.key}`, UPDATE_MUTATION, {
        id: op.key,
        input,
      });
      return yield* madeIssue(
        client,
        changed.issueUpdate.success ? changed.issueUpdate.issue : null,
        `Linear did not change ${op.key}.`,
        op
      );
    }),

  "comment.create": (client, _teamId, op) =>
    Effect.gen(function* () {
      const said = op.saidBy;
      const created = yield* linearAsk<{
        commentCreate: {
          comment: {
            createdAt: string;
            id: string;
            issue: { url: string } | null;
            url: string;
          } | null;
          success: boolean;
        };
      }>(client, REQUEST_MS, `comment on ${op.on.key}`, COMMENT_MUTATION, {
        input:
          said && client.asApp
            ? {
                issueId: op.on.key,
                body: op.body,
                createAsUser: `${said} (CawCo)`,
              }
            : {
                issueId: op.on.key,
                body: said ? `**${said}** on CawCo:\n\n${op.body}` : op.body,
              },
      });
      const { comment } = created.commentCreate;
      const item = linkOfUrl(comment?.issue?.url ?? comment?.url ?? "");
      if (!(created.commentCreate.success && comment && item)) {
        return yield* refusedWith(
          `Linear did not add the comment to ${op.on.key}.`
        );
      }
      return {
        item,
        comment: {
          id: comment.id,
          url: comment.url,
          at: Date.parse(comment.createdAt),
        },
      };
    }),
});
