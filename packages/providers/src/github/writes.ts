/**
 * GitHub's writes (provider spec §2.3 `Writes`): an issue made or changed,
 * a comment, a pull request opened, the open issue a marker names found, an
 * issue put in a Project's Status column, the Status columns a list of
 * stages lacks added, and a repository made. They are made only through the
 * hub's write door (hub writes.ts): the tracker sync's and `create_repo` in
 * the hub with a connection's client, a session's on its machine with gh's.
 *
 * - **Issues and comments** through REST: "Every pull request is an issue"
 *   (docs.github.com, REST issues), so a pull request's conversation is its
 *   issue's and a comment on either is the issue's comment. A new issue is
 *   open; one asked closed is closed after.
 * - **A pull request** for the same branches already open is answered as
 *   there already (`existing`).
 * - **A marked issue**: the newest open issues first, which the search
 *   index may not hold yet ("results … may take a few minutes to appear",
 *   docs.github.com, searching issues), then the search, for an older one.
 * - **Project Status** through GraphQL: "You cannot add and update an item
 *   in the same call. You must use `addProjectV2ItemById` to add the item
 *   and then use `updateProjectV2ItemFieldValue` to update the item"; "If
 *   you try to add an item that already exists, the existing item ID is
 *   returned instead"; a single select is set with `value: {
 *   singleSelectOptionId }` (docs.github.com, using the API to manage
 *   Projects). `updateProjectV2Field` replaces the field's whole list
 *   ("provided values overwrite existing options, and existing options
 *   should be fetched for partial updates"), so every option it has is sent
 *   back with its `id` ("Include this to preserve the option's identity
 *   during updates, preventing item field values from being cleared",
 *   docs.github.com/en/graphql/reference/projects), its colour and its
 *   description; an added one takes no id. None is removed or renamed.
 * - **A repository** is made under the signed-in person
 *   (`POST /user/repos`), empty, private as asked, no redirect followed.
 */
import { Effect } from "effect";
import { eventKeys } from "../event-keys";
import type { BoardAt, ItemRef, WriteOp, Writes } from "../provider";
import { issueWriteEvents, writesOf } from "../provider-writes";
import { refusedWith } from "../read-stop";
import { boardAsk } from "./board";
import type { GitHubClient } from "./client";
import { github } from "./descriptor";
import { issueRevisionOf } from "./ingest";
import { githubAsk, repoParts } from "./sync";

/** The hub's deadline on one request a write sends. Our choice, as the poll's. */
const REQUEST_MS = 30_000;

/** GitHub's most per page, for the open issues a marked one is looked for among. */
const MARKED_PAGE = 100;

/** The colour a Status option CawCo adds wears: GitHub's quiet one. Our choice. */
const ADDED_COLOR = "GRAY";

const ISSUE_NODE_QUERY = `query CawcoIssueNode($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { id } }
}`;

const ADD_MUTATION = `mutation CawcoProjectAdd($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`;

const SET_MUTATION = `mutation CawcoProjectStatus($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }
  ) { projectV2Item { id } }
}`;

const FIELD_OPTIONS_QUERY = `query CawcoStatusOptions($field: ID!) {
  node(id: $field) {
    ... on ProjectV2SingleSelectField { options { id name color description } }
  }
}`;

const FIELD_OPTIONS_MUTATION = `mutation CawcoStatusOptionsAdd($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { id name } } }
  }
}`;

/** A Status option as `updateProjectV2Field` takes it back. */
interface OptionInput {
  color: string;
  description: string;
  id?: string;
  name: string;
}

/** The item a page of GitHub's names (an issue, a pull request, a comment's item), read off its URL; refused when it names none. */
const itemAt = (
  url: string
): Effect.Effect<ItemRef, ReturnType<typeof refusedWith>> => {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  const item = parsed ? github.itemOfUrl(parsed) : undefined;
  return item
    ? Effect.succeed(item)
    : Effect.fail(refusedWith(`GitHub returned an unreadable page: ${url}`));
};

/** GitHub's state and reason for a state token the sync names. */
const writeState = (
  token: string
): { state: "open" | "closed"; state_reason?: "completed" | "not_planned" } =>
  token === "open"
    ? { state: "open" }
    : {
        state: "closed",
        state_reason:
          token === "closed:not_planned" ? "not_planned" : "completed",
      };

/** An issue as GitHub answers a write of it: what the events the write caused are read off. */
interface AnsweredIssue {
  closed_at: string | null;
  html_url: string;
  labels: (string | { name?: string | null })[];
  number: number;
  state: string;
  updated_at: string;
}

/** An issue's label names as GitHub answers them. */
const labelNames = (labels: AnsweredIssue["labels"]): Set<string> =>
  new Set(
    labels.map((one) => (typeof one === "string" ? one : (one.name ?? "")))
  );

/** An issue GitHub answered, as its ref, its revision and the events the write caused. */
const answeredIssue = Effect.fnUntraced(function* (
  data: AnsweredIssue,
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>,
  before: ReadonlySet<string> = new Set()
) {
  const item = yield* itemAt(data.html_url);
  const revision = issueRevisionOf(data, item);
  if (!revision) {
    return yield* refusedWith(
      `GitHub returned ${data.html_url}, not an issue.`
    );
  }
  return {
    item,
    revision,
    events: issueWriteEvents(
      String(data.number),
      {
        open: data.state !== "closed",
        closedAt: data.closed_at,
        updatedAt: data.updated_at,
        labels: [...labelNames(data.labels)],
      },
      op,
      [...before]
    ),
  };
});

/** An issue's fields as REST takes them: those the op names. */
const issueFields = (
  op: Extract<WriteOp, { op: "issue.create" | "issue.update" }>
) => ({
  ...(op.title === undefined ? {} : { title: op.title }),
  ...(op.body === undefined ? {} : { body: op.body }),
  ...(op.labels === undefined ? {} : { labels: [...op.labels] }),
});

/** What a board's request says it is on, in sentences. */
const onBoard = (board: BoardAt) => `the Project “${board.title}”`;

export const githubWrites: Writes<GitHubClient> = writesOf("GitHub", {
  "issue.create": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      const { data } = yield* githubAsk(
        REQUEST_MS,
        "create an issue",
        repo,
        (signal) =>
          octokit.request("POST /repos/{owner}/{repo}/issues", {
            ...target,
            title: op.title,
            body: op.body,
            ...(op.labels === undefined ? {} : { labels: [...op.labels] }),
            request: { signal },
          })
      );
      // A new issue is open; a task filed already closed closes it.
      if (op.stateToken === undefined || op.stateToken === "open") {
        return yield* answeredIssue(data, op);
      }
      const closed = yield* githubAsk(
        REQUEST_MS,
        `close issue #${data.number}`,
        repo,
        (signal) =>
          octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
            ...target,
            issue_number: data.number,
            ...writeState(op.stateToken ?? "open"),
            request: { signal },
          })
      );
      return yield* answeredIssue(closed.data, op);
    }),

  "issue.update": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      // The labels it had, read first when the write sets labels: the
      // events it causes are those of the labels it adds.
      const before =
        op.labels === undefined
          ? new Set<string>()
          : labelNames(
              (yield* githubAsk(
                REQUEST_MS,
                `read issue #${op.key}`,
                repo,
                (signal) =>
                  octokit.request(
                    "GET /repos/{owner}/{repo}/issues/{issue_number}",
                    {
                      ...target,
                      issue_number: Number(op.key),
                      request: { signal },
                    }
                  )
              )).data.labels
            );
      const { data } = yield* githubAsk(
        REQUEST_MS,
        `change issue #${op.key}`,
        repo,
        (signal) =>
          octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
            ...target,
            issue_number: Number(op.key),
            ...issueFields(op),
            ...(op.stateToken === undefined ? {} : writeState(op.stateToken)),
            request: { signal },
          })
      );
      return yield* answeredIssue(data, op, before);
    }),

  "comment.create": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      const { data } = yield* githubAsk(
        REQUEST_MS,
        `comment on #${op.on.key}`,
        repo,
        (signal) =>
          octokit.request(
            "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
            {
              ...target,
              issue_number: Number(op.on.key),
              body: op.saidBy
                ? `**${op.saidBy}** on CawCo:\n\n${op.body}`
                : op.body,
              request: { signal },
            }
          )
      );
      return {
        item: yield* itemAt(data.html_url),
        comment: {
          id: String(data.id),
          url: data.html_url,
          at: Date.parse(data.created_at),
        },
      };
    }),

  "change-request.open": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      const { data: open } = yield* githubAsk(
        REQUEST_MS,
        "list the open pull requests",
        repo,
        (signal) =>
          octokit.rest.pulls.list({
            ...target,
            state: "open",
            head: `${target.owner}:${op.head}`,
            base: op.base,
            request: { signal },
          })
      );
      const [existing] = open;
      if (existing) {
        return { item: yield* itemAt(existing.html_url), existing: true };
      }
      const { data } = yield* githubAsk(
        REQUEST_MS,
        "open the pull request",
        repo,
        (signal) =>
          octokit.rest.pulls.create({
            ...target,
            base: op.base,
            head: op.head,
            title: op.title,
            body: op.body,
            request: { signal },
          })
      );
      return {
        item: yield* itemAt(data.html_url),
        existing: false,
        events: [eventKeys.opened("pr", String(data.number))],
      };
    }),

  "issue.find-marked": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      // A pull request is an issue to this API: its `pull_request` key tells it apart.
      const marked = (each: { body?: string | null; pull_request?: unknown }) =>
        !each.pull_request && (each.body ?? "").includes(op.marker);
      const { data: recent } = yield* githubAsk(
        REQUEST_MS,
        "list the open issues",
        repo,
        (signal) =>
          octokit.rest.issues.listForRepo({
            ...target,
            state: "open",
            sort: "created",
            direction: "desc",
            per_page: MARKED_PAGE,
            request: { signal },
          })
      );
      const fresh = recent.find(marked);
      if (fresh) {
        return { item: yield* itemAt(fresh.html_url) };
      }
      const { data: found } = yield* githubAsk(
        REQUEST_MS,
        "search the open issues",
        repo,
        (signal) =>
          octokit.rest.search.issuesAndPullRequests({
            q: `repo:${target.owner}/${target.repo} is:issue is:open in:body ${op.search}`,
            per_page: MARKED_PAGE,
            request: { signal },
          })
      );
      const older = found.items.find(marked);
      return { item: older ? yield* itemAt(older.html_url) : null };
    }),

  "board.place": (octokit, repo, op) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      const on = onBoard(op.board);
      let itemId = op.boardItem;
      if (!itemId) {
        const node = yield* boardAsk<{
          repository: { issue: { id: string } | null } | null;
        }>(
          octokit,
          REQUEST_MS,
          `read issue #${op.key}`,
          repo,
          ISSUE_NODE_QUERY,
          {
            ...target,
            number: Number(op.key),
          }
        );
        const content = node.repository?.issue?.id;
        if (!content) {
          return yield* refusedWith(
            `GitHub has no issue #${op.key} on ${repo}.`
          );
        }
        const added = yield* boardAsk<{
          addProjectV2ItemById: { item: { id: string } };
        }>(octokit, REQUEST_MS, `add issue #${op.key}`, on, ADD_MUTATION, {
          project: op.board.id,
          content,
        });
        itemId = added.addProjectV2ItemById.item.id;
      }
      yield* boardAsk(
        octokit,
        REQUEST_MS,
        `set the Status of issue #${op.key}`,
        on,
        SET_MUTATION,
        {
          project: op.board.id,
          item: itemId,
          field: op.board.field,
          option: op.option,
        }
      );
      return { item: null, placed: { itemId, optionId: op.option } };
    }),

  "board.columns": (octokit, _repo, op) =>
    Effect.gen(function* () {
      const on = onBoard(op.board);
      const read = yield* boardAsk<{
        node: { options?: (OptionInput & { id: string })[] } | null;
      }>(
        octokit,
        REQUEST_MS,
        "read its Status options",
        on,
        FIELD_OPTIONS_QUERY,
        {
          field: op.board.field,
        }
      );
      const options = read.node?.options ?? [];
      const same = (a: string, b: string) =>
        a.trim().toLowerCase() === b.trim().toLowerCase();
      // Two names alike, ignoring case, take one option.
      const missing = op.names.filter(
        (name, at) =>
          !options.some((option) => same(option.name, name)) &&
          op.names.findIndex((other) => same(other, name)) === at
      );
      if (missing.length === 0) {
        return {
          item: null,
          added: [],
          options: options.map(({ id, name }) => ({ id, name })),
        };
      }
      const sent: OptionInput[] = [
        ...options.map(({ id, name, color, description }) => ({
          id,
          name,
          color,
          description,
        })),
        ...missing.map((name) => ({
          name,
          color: ADDED_COLOR,
          description: "",
        })),
      ];
      const added = yield* boardAsk<{
        updateProjectV2Field: {
          projectV2Field: { options?: { id: string; name: string }[] } | null;
        };
      }>(
        octokit,
        REQUEST_MS,
        `add the Status ${missing.length === 1 ? "option" : "options"} ${missing.join(", ")}`,
        on,
        FIELD_OPTIONS_MUTATION,
        { field: op.board.field, options: sent }
      );
      return {
        item: null,
        added: missing,
        options: added.updateProjectV2Field.projectV2Field?.options ?? [],
      };
    }),

  "repo.create": (octokit, _owner, op) =>
    Effect.gen(function* () {
      const { data } = yield* githubAsk(
        REQUEST_MS,
        `create ${op.name}`,
        "GitHub",
        (signal) =>
          octokit.rest.repos.createForAuthenticatedUser({
            name: op.name,
            private: op.private,
            auto_init: false,
            request: { signal, redirect: "error" },
          })
      );
      return {
        item: null,
        repo: {
          fullName: data.full_name,
          url: data.html_url,
          cloneUrl: data.clone_url,
        },
      };
    }),
});
