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
import type {
  ItemRead,
  ItemRevision,
  Items,
  MirroredRef,
  MirrorState,
  Within,
} from "../provider";
import { githubActorOf } from "./actor";
import { answerOf, refusalWords } from "./answer";
import { pullState } from "./ingest";

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

/** One read's place: the item, its repository, the ETag its last read kept, and the request's signal. */
interface ReadAt {
  etag: string | null;
  item: MirroredRef;
  octokit: Octokit;
  owner: string;
  repo: string;
  signal: AbortSignal;
}

const readIssue = async (at: ReadAt): Promise<ItemRead> => {
  const { data } = await at.octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}",
    {
      owner: at.owner,
      repo: at.repo,
      issue_number: Number(at.item.key),
      request: { signal: at.signal },
    }
  );
  const closed = data.state === "closed";
  const canceled = closed && data.state_reason === "not_planned";
  let state: MirrorState = "open";
  if (canceled) {
    state = "canceled";
  } else if (closed) {
    state = "closed";
  }
  return {
    kind: "read",
    revision: revisionOf(at.item, {
      externalId: data.node_id,
      title: data.title,
      state,
      stateName: canceled ? "Closed as not planned" : "",
      author: githubActorOf(data.user),
      labels: labelNames(data.labels),
      updatedAt: data.updated_at,
    }),
  };
};

const readPull = async (at: ReadAt): Promise<ItemRead> => {
  try {
    const { data, headers } = await at.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner: at.owner,
        repo: at.repo,
        pull_number: Number(at.item.key),
        request: { signal: at.signal },
        ...(at.etag ? { headers: { "if-none-match": at.etag } } : {}),
      }
    );
    return {
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
  } catch (error) {
    if (at.etag && answerOf(error).status === NOT_MODIFIED) {
      return { kind: "unchanged" };
    }
    throw error;
  }
};

const readRun = async (at: ReadAt): Promise<ItemRead> => {
  const { data: run } = await at.octokit.rest.actions.getWorkflowRun({
    owner: at.owner,
    repo: at.repo,
    run_id: Number(at.item.key),
    request: { signal: at.signal },
  });
  let state: MirrorState = "running";
  if (run.status === "completed") {
    state = GREEN_RUNS.has(run.conclusion ?? "") ? "green" : "red";
  }
  return {
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
};

const readDiscussion = async (at: ReadAt): Promise<ItemRead> => {
  const answer = await at.octokit.graphql<DiscussionRead>(DISCUSSION_QUERY, {
    owner: at.owner,
    name: at.repo,
    number: Number(at.item.key),
    request: { signal: at.signal },
  });
  const found = answer.repository?.discussion;
  if (!found) {
    return { kind: "gone" };
  }
  return {
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
};

/** Each kind's read; a record is no GitHub item. */
const READS: Record<MirroredRef["kind"], (at: ReadAt) => Promise<ItemRead>> = {
  issue: readIssue,
  pr: readPull,
  run: readRun,
  discussion: readDiscussion,
  record: () => Promise.resolve({ kind: "gone" }),
};

/** One item read now, within the hub's deadline: its revision, nothing new, gone, or GitHub's words as its problem. */
const readItem = async (
  octokit: Octokit,
  item: MirroredRef,
  etag: string | null,
  within: Within
): Promise<ItemRead> => {
  const [owner, repo] = item.container.split("/");
  if (!(owner && repo)) {
    return { kind: "gone" };
  }
  try {
    const asked = await within((signal) =>
      READS[item.kind]({ etag, item, octokit, owner, repo, signal })
    );
    return asked.kind === "unanswered"
      ? { kind: "unanswered", after: asked.after }
      : asked.value;
  } catch (error) {
    const said = refusalWords(error, `read ${item.ref}`, item.container);
    return {
      kind: "stopped",
      problem: { words: said.words, resumeAt: said.resumeAt },
    };
  }
};

/** GitHub's single-item reads. */
export const githubItems: Items<Octokit> = {
  kinds: ["issue", "pr", "discussion", "run"],
  read: readItem,
};
