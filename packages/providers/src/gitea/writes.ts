/**
 * Gitea's writes (provider spec §2.3 `Writes`), and Forgejo's: an issue, a
 * comment on an issue or a pull request (one numbering for both, a pull
 * request's conversation its issue's), and a pull request opened, through
 * gitea-mcp's tools (gitea/client.ts). They are made only through the hub's
 * write door (hub writes.ts), on a session's machine with tea's login.
 * gitea-mcp's tools listed search no issues, so no marked issue is found.
 */
import { Effect, Predicate, Result, Schema } from "effect";
import { eventKeys } from "../event-keys";
import type { ItemRef, WriteOp, Writes } from "../provider";
import { writesOf, writtenIssue } from "../provider-writes";
import { refusedWith } from "../read-stop";
import { type GiteaAnswer, type GiteaClient, repoArgs } from "./client";
import { gitea } from "./descriptor";

/** What a gitea-mcp tool's answer is read for: an object's `html_url`, at its top or one level down, and a pull request's state. */
const Answered = Schema.Record(Schema.String, Schema.Unknown);

/** A tool's answer as text, or its failure in its words. */
const answerText = (answer: GiteaAnswer, tool: string) => {
  const said = answer.content
    .map((part) => ("text" in part && part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
  return answer.isError
    ? Effect.fail(refusedWith(`gitea-mcp's ${tool}: ${said || "failed"}`))
    : Effect.succeed(said);
};

/** An answer's JSON object; undefined when it is none. */
const objectOf = (text: string): Record<string, unknown> | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  const read = Schema.decodeUnknownResult(Answered)(parsed);
  return Result.isSuccess(read) ? read.success : undefined;
};

/** An object's `html_url` at its top or one level down, as Gitea's answers carry it. */
const htmlUrl = (text: string): string | undefined => {
  const read = objectOf(text);
  if (!read) {
    return;
  }
  const nested = Object.values(read)
    .map((value) =>
      Predicate.hasProperty(value, "html_url") ? value.html_url : undefined
    )
    .find((each) => typeof each === "string");
  const url = read.html_url ?? nested;
  return typeof url === "string" ? url : undefined;
};

/** One tool's answer, as text, through the client. */
const call = (
  client: GiteaClient,
  tool: string,
  args: Record<string, unknown>
) =>
  Effect.tryPromise({
    try: () => client.call(tool, args),
    catch: (error) =>
      refusedWith(
        `gitea-mcp's ${tool} failed: ${error instanceof Error ? error.message : String(error)}`,
        "unreachable"
      ),
  });

/** The item a Gitea page names; refused when the answer named none it reads. */
const itemAt = (text: string, what: string) => {
  const url = htmlUrl(text);
  let item: ItemRef | undefined;
  try {
    item = url ? gitea.itemOfUrl(new URL(url)) : undefined;
  } catch {
    item = undefined;
  }
  return item
    ? Effect.succeed({ item, url: url ?? "" })
    : Effect.fail(refusedWith(`gitea-mcp returned no ${what}: ${text}`));
};

/** What a written issue's answer is read for (gitea-mcp's `slimIssue`). */
const AnsweredIssue = Schema.Struct({
  closed_at: Schema.optional(Schema.NullOr(Schema.String)),
  created_at: Schema.String,
  id: Schema.Number,
  labels: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  number: Schema.Number,
  state: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
});

/**
 * An issue a write answered, as its ref, its revision, and the events the
 * write itself caused (event-keys.ts): its opening when it made it, its
 * close at the `closed_at` it set, its reopen at the version it left, and
 * each label it put on.
 */
const answeredIssue = Effect.fnUntraced(function* (
  text: string,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>,
  before: readonly string[] = []
) {
  const { item } = yield* itemAt(text, "issue");
  const read = Schema.decodeUnknownResult(AnsweredIssue)(objectOf(text));
  if (Result.isFailure(read)) {
    return yield* refusedWith(`gitea-mcp returned no whole issue: ${text}`);
  }
  const made = read.success;
  return writtenIssue(
    item,
    made,
    { labels: made.labels ?? [], body: op.body ?? null },
    op,
    before
  );
});

/** Gitea's own word for a state token. */
const stateOf = (token: string): "open" | "closed" =>
  token === "open" ? "open" : "closed";

export const giteaWrites: Writes<GiteaClient> = writesOf("Gitea", {
  "issue.create": (client, path, op) =>
    Effect.gen(function* () {
      const text = yield* answerText(
        yield* call(client, "issue_write", {
          method: "create",
          ...repoArgs(path),
          title: op.title,
          body: op.body,
          ...(op.labels === undefined ? {} : { labels: [...op.labels] }),
        }),
        "issue_write"
      );
      // A new issue is open; one asked closed is closed after.
      if (op.stateToken === undefined || op.stateToken === "open") {
        return yield* answeredIssue(text, op);
      }
      const { item } = yield* itemAt(text, "issue");
      const closed = yield* answerText(
        yield* call(client, "issue_write", {
          method: "update",
          ...repoArgs(path),
          issue_number: Number(item.key),
          state: "closed",
        }),
        "issue_write"
      );
      return yield* answeredIssue(closed, op);
    }),

  "issue.update": (client, path, op) =>
    Effect.gen(function* () {
      const number = Number(op.key);
      // The labels it had, read first when the write sets labels: the
      // events it causes are those of the labels it adds.
      const before: string[] = [];
      if (op.labels !== undefined) {
        const had = Schema.decodeUnknownResult(AnsweredIssue)(
          objectOf(
            yield* answerText(
              yield* call(client, "issue_read", {
                method: "get",
                ...repoArgs(path),
                issue_number: number,
              }),
              "issue_read"
            )
          )
        );
        before.push(
          ...(Result.isSuccess(had) ? (had.success.labels ?? []) : [])
        );
      }
      // Labels next: the update's answer then holds them as they end.
      if (op.labels !== undefined) {
        yield* answerText(
          yield* call(client, "issue_write", {
            method: "replace_labels",
            ...repoArgs(path),
            issue_number: number,
            labels: [...op.labels],
          }),
          "issue_write"
        );
      }
      const text = yield* answerText(
        yield* call(client, "issue_write", {
          method: "update",
          ...repoArgs(path),
          issue_number: number,
          ...(op.title === undefined ? {} : { title: op.title }),
          ...(op.body === undefined ? {} : { body: op.body }),
          ...(op.stateToken === undefined
            ? {}
            : { state: stateOf(op.stateToken) }),
        }),
        "issue_write"
      );
      return yield* answeredIssue(text, op, before);
    }),

  "issue.find-marked": () =>
    Effect.fail(
      refusedWith(
        "CawCo finds no open issue by its text on Gitea, so it files usability feedback on GitHub or GitLab only."
      )
    ),

  "change-request.open": (client, path, op) =>
    Effect.gen(function* () {
      // The open one for these branches, when there is one: an answer that
      // is no error is it; a refusal, none ("get_by_branches"). Gitea's
      // lookup answers its latest, closed or not.
      const found = yield* call(client, "pull_request_read", {
        method: "get_by_branches",
        ...repoArgs(path),
        base: op.base,
        head: op.head,
      });
      if (!found.isError) {
        const text = yield* answerText(found, "pull_request_read");
        if (objectOf(text)?.state === "open") {
          return {
            item: (yield* itemAt(text, "pull request")).item,
            existing: true,
          };
        }
      }
      const made = yield* answerText(
        yield* call(client, "pull_request_write", {
          method: "create",
          ...repoArgs(path),
          base: op.base,
          head: op.head,
          title: op.title,
          body: op.body,
        }),
        "pull_request_write"
      );
      const opened = (yield* itemAt(made, "pull request")).item;
      return {
        item: opened,
        existing: false,
        events: [eventKeys.opened("pr", opened.key)],
      };
    }),

  "comment.create": (client, path, op) =>
    Effect.gen(function* () {
      const text = yield* answerText(
        yield* call(client, "issue_write", {
          method: "add_comment",
          ...repoArgs(path),
          issue_number: Number(op.on.key),
          body: op.body,
        }),
        "issue_write"
      );
      const { item, url } = yield* itemAt(text, "comment");
      const answered = objectOf(text);
      const id =
        typeof answered?.id === "number"
          ? String(answered.id)
          : gitea.commentOfUrl(new URL(url));
      if (!id) {
        return yield* refusedWith(`gitea-mcp returned no comment id: ${text}`);
      }
      const at = Date.parse(String(answered?.created_at ?? ""));
      return {
        item,
        comment: { id, url, at: Number.isNaN(at) ? Date.now() : at },
      };
    }),
});
