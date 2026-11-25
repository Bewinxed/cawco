/**
 * GitHub's single-item reads (provider spec §2.3 `Items`): an issue, a pull
 * request and an Actions run through REST, a discussion through GraphQL,
 * each read once within the hub's deadline. The hub reads a task's linked
 * items with it (hub links.ts `readLinks`) and stores what it answers
 * through its door.
 *
 * - A pull request is asked with the ETag its last read kept: a 304 says
 *   nothing new of it, and "does not count against your primary rate
 *   limit" (docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).
 * - An Actions run's state is `running` until it completes, then `green`
 *   (success, skipped, neutral) or `red`; its workflow's name is its title.
 * - A read GitHub refuses answers its words as the item's problem; one it
 *   does not answer in time says so, and the item is read again later.
 */
import type { Octokit } from "@octokit/rest";
import { Effect } from "effect";
import type {
  ItemRead,
  ItemRevision,
  Items,
  MirroredRef,
  MirrorState,
} from "../provider";
import { type ProviderFailure, refusedWith, request } from "../read-stop";
import { githubActorOf } from "./actor";
import { answerOf, refusalWords } from "./answer";
import { issueRevisionOf, pullState } from "./ingest";

/** GitHub's answer to a conditional read of something unchanged. */
const NOT_MODIFIED = 304;

/** An Actions run's conclusions that settle a wait on it: every other completed one is red. */
const GREEN_RUNS: ReadonlySet<string> = new Set([
  "success",
  "skipped",
  "neutral",
]);

/** One discussion by its number (docs.github.com/en/graphql/reference/discussions: `closed`, `labels`, `author`). */
const DISCUSSION_QUERY = `query CawcoDiscussion($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      id
      title
      closed
      updatedAt
      author { __typename login avatarUrl url }
      labels(first: 20) { nodes { name } }
    }
  }
}`;

/** A discussion as {@link DISCUSSION_QUERY} answers it. */
interface DiscussionRead {
  repository: {
    discussion: {
      author: {
        __typename: string;
        avatarUrl: string | null;
        login: string;
        url: string | null;
      } | null;
      closed: boolean;
      id: string;
      labels: { nodes: ({ name: string } | null)[] } | null;
      title: string;
      updatedAt: string;
    } | null;
  } | null;
}

/** The names of labels as REST answers them. */
const labelNames = (labels: (string | { name?: string | null })[]): string[] =>
  labels
    .map((one) => (typeof one === "string" ? one : (one.name ?? "")))
    .filter(Boolean);

/** What GitHub said of an item, as its revision takes it. */
interface Said {
  author: ItemRevision["snapshot"]["author"];
  externalId: string;
  labels: string[];
  state: MirrorState;
  stateName?: string;
  title: string;
  updatedAt: string;
}

/** A revision of `item` from what GitHub said of it. */
const revisionOf = (
  item: MirroredRef,
  said: Said,
  etag?: string | null
): ItemRevision => ({
  item,
  version: String(Date.parse(said.updatedAt)),
  snapshot: {
    externalId: said.externalId,
    title: said.title,
    state: said.state,
    stateName: said.stateName ?? "",
    author: said.author,
    labels: said.labels,
  },
  ...(etag === undefined ? {} : { etag }),
});

/** One read's place: the item, its repository, the ETag its last read kept, and the hub's deadline on a request. */
interface ReadAt {
  etag: string | null;
  item: MirroredRef;
  octokit: Octokit;
  owner: string;
  repo: string;
  requestMs: number;
}

/** One request of a read, within the hub's deadline, GitHub's refusal in its words. */
const ask = <A>(at: ReadAt, run: (signal: AbortSignal) => Promise<A>) =>
  request("GitHub", at.requestMs, run, (error) => {
    const said = refusalWords(error, `read ${at.item.ref}`, at.item.container);
    return refusedWith(said.words, said.code, said.resumeAt);
  });

/**
 * An issue, whole (its body, its state's token, who opened it and whether
 * GitHub vouches for them, for the tracker sync); gone when GitHub answers
 * it from another repository (it was transferred) or no issue at all.
 */
const readIssue = Effect.fnUntraced(function* (at: ReadAt) {
  const { data } = yield* ask(at, (signal) =>
    at.octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}", {
      owner: at.owner,
      repo: at.repo,
      issue_number: Number(at.item.key),
      request: { signal },
    })
  );
  const here = data.repository_url
    .toLowerCase()
    .endsWith(`/${at.owner}/${at.repo}`.toLowerCase());
  const revision = here ? issueRevisionOf(data, at.item) : undefined;
  const read: ItemRead = revision ? { kind: "read", revision } : GONE;
  return read;
});

/** What a conditional read of something unchanged answers: GitHub's 304, read as such. */
const UNCHANGED = "not modified";

const readPull = Effect.fnUntraced(function* (at: ReadAt) {
  const answer = yield* ask(at, (signal) =>
    at.octokit
      .request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner: at.owner,
        repo: at.repo,
        pull_number: Number(at.item.key),
        request: { signal },
        ...(at.etag ? { headers: { "if-none-match": at.etag } } : {}),
      })
      .catch((error: unknown): typeof UNCHANGED => {
        if (at.etag && answerOf(error).status === NOT_MODIFIED) {
          return UNCHANGED;
        }
        throw error;
      })
  );
  if (answer === UNCHANGED) {
    const read: ItemRead = { kind: "unchanged" };
    return read;
  }
  const { data, headers } = answer;
  const read: ItemRead = {
    kind: "read",
    revision: revisionOf(
      at.item,
      {
        externalId: data.node_id,
        title: data.title,
        state: pullState(data),
        author: githubActorOf(data.user),
        labels: labelNames(data.labels),
        updatedAt: data.updated_at,
      },
      typeof headers.etag === "string" ? headers.etag : null
    ),
  };
  return read;
});

const readRun = Effect.fnUntraced(function* (at: ReadAt) {
  const { data: run } = yield* ask(at, (signal) =>
    at.octokit.rest.actions.getWorkflowRun({
      owner: at.owner,
      repo: at.repo,
      run_id: Number(at.item.key),
      request: { signal },
    })
  );
  let state: MirrorState = "running";
  if (run.status === "completed") {
    state = GREEN_RUNS.has(run.conclusion ?? "") ? "green" : "red";
  }
  const read: ItemRead = {
    kind: "read",
    revision: revisionOf(at.item, {
      externalId: run.node_id,
      title: run.name ?? "",
      state,
      stateName: run.conclusion ?? run.status ?? "",
      author: null,
      labels: [],
      updatedAt: run.updated_at,
    }),
  };
  return read;
});

const readDiscussion = Effect.fnUntraced(function* (at: ReadAt) {
  const answer = yield* ask(at, (signal) =>
    at.octokit.graphql<DiscussionRead>(DISCUSSION_QUERY, {
      owner: at.owner,
      name: at.repo,
      number: Number(at.item.key),
      request: { signal },
    })
  );
  const found = answer.repository?.discussion;
  if (!found) {
    return GONE;
  }
  const read: ItemRead = {
    kind: "read",
    revision: revisionOf(at.item, {
      externalId: found.id,
      title: found.title,
      state: found.closed ? "closed" : "open",
      author: found.author
        ? {
            source: "github",
            login: found.author.login,
            name: null,
            avatarUrl: found.author.avatarUrl,
            url: found.author.url,
            kind: found.author.__typename === "Bot" ? "bot" : "person",
            memberId: null,
          }
        : null,
      labels: (found.labels?.nodes ?? []).flatMap((one) =>
        one ? [one.name] : []
      ),
      updatedAt: found.updatedAt,
    }),
  };
  return read;
});

const GONE: ItemRead = { kind: "gone" };

/** Each kind's read; a record is no GitHub item. */
const READS: Record<
  MirroredRef["kind"],
  (at: ReadAt) => Effect.Effect<ItemRead, ProviderFailure>
> = {
  issue: readIssue,
  pr: readPull,
  run: readRun,
  discussion: readDiscussion,
  record: () => Effect.succeed(GONE),
};

/** One item read now, each request within the hub's deadline: its revision, nothing new, or gone; GitHub's refusal in its words, or no answer, its failure. */
const readItem = (
  octokit: Octokit,
  item: MirroredRef,
  etag: string | null,
  requestMs: number
): Effect.Effect<ItemRead, ProviderFailure> => {
  const [owner, repo] = item.container.split("/");
  return owner && repo
    ? READS[item.kind]({ etag, item, octokit, owner, repo, requestMs })
    : Effect.succeed(GONE);
};

/** GitHub's single-item reads. */
export const githubItems: Items<Octokit> = {
  kinds: ["issue", "pr", "discussion", "run"],
  read: readItem,
};
