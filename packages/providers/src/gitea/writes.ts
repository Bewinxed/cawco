/**
 * Gitea's writes (provider spec §2.3 `Writes`), and Forgejo's: an issue, a
 * comment on an issue or a pull request (one numbering for both, a pull
 * request's conversation its issue's), and a pull request opened, through
 * gitea-mcp's tools (gitea/client.ts). They are made only through the hub's
 * write door (hub writes.ts), on a session's machine with tea's login.
 * gitea-mcp's tools listed search no issues, so no marked issue is found.
 */
import { Effect, Predicate, Result, Schema } from "effect";
import type { ItemRef, ItemRevision, Writes } from "../provider";
import { writesOf } from "../provider-writes";
import { refusedWith } from "../read-stop";
import type { GiteaAnswer, GiteaClient } from "./client";
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
    : Effect.fail(
        refusedWith(`gitea-mcp did not say where the ${what} is: ${text}`)
      );
};

/** `owner/repo` as gitea-mcp names them. */
const parts = (path: string) => {
  const [owner = "", repo = ""] = path.split("/");
  return { owner, repo };
};

export const giteaWrites: Writes<GiteaClient> = writesOf("Gitea", {
  "issue.create": (client, path, op) =>
    Effect.gen(function* () {
      const text = yield* answerText(
        yield* call(client, "issue_write", {
          method: "create",
          ...parts(path),
          title: op.title,
          body: op.body,
        }),
        "issue_write"
      );
      const { item } = yield* itemAt(text, "issue");
      const now = Date.now();
      const revision: ItemRevision = {
        item,
        version: String(now),
        snapshot: {
          externalId: "",
          title: op.title,
          state: "open",
          stateName: "",
          author: null,
          labels: [],
          body: op.body,
          createdAt: now,
        },
      };
      return { item, revision };
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
        ...parts(path),
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
          ...parts(path),
          base: op.base,
          head: op.head,
          title: op.title,
          body: op.body,
        }),
        "pull_request_write"
      );
      return {
        item: (yield* itemAt(made, "pull request")).item,
        existing: false,
      };
    }),

  "comment.create": (client, path, op) =>
    Effect.gen(function* () {
      const text = yield* answerText(
        yield* call(client, "issue_write", {
          method: "add_comment",
          ...parts(path),
          issue_number: Number(op.on.key),
          body: op.body,
        }),
        "issue_write"
      );
      const { item, url } = yield* itemAt(text, "comment");
      return {
        item,
        comment: {
          id: gitea.commentOfUrl(new URL(url)) ?? "",
          url,
          at: Date.now(),
        },
      };
    }),
});
