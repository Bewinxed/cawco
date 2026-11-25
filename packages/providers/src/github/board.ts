/**
 * A GitHub Project (v2) as the board a tracker's stages show on (provider
 * spec §2.3 `Board`, §2.9): the Projects a connection reaches for a
 * repository, and one Project's Status field with each of the repository's
 * issues on it, read through GitHub's GraphQL API with Octokit's `graphql`.
 * The poll reads it as the watch's `board:<id>` stream (github/ingest.ts),
 * and the tracker sync reads its stages' Status off what the door hands it
 * (hub sync.ts). Setting a Status and adding options are writes, the
 * sync's own, through the hub's write door (github/writes.ts).
 *
 * - **Reading.** "Single select fields are returned as a
 *   `ProjectV2SingleSelectField` object and have an `options` field where
 *   you can find the ID of each option"; `ProjectV2.field(name:)` "A field
 *   of the project"; `ProjectV2Item.fieldValueByName(name:)`; `items`
 *   "Defaults to only returning items that are not archived"
 *   (docs.github.com/en/graphql/reference/projects).
 * - **Permission.** "replace `TOKEN` with a token that has the
 *   `read:project` scope (for queries)" (docs.github.com, using the API to
 *   manage Projects); a fine-grained token or a GitHub App needs the
 *   organization permission "Projects". A GitHub App reaches no user-owned
 *   Project: GitHub answers it "Resource not accessible by integration". A
 *   refusal is said in GitHub's own words, and the sync leaves Status alone
 *   while issues sync as before.
 * - **Asked again.** A board the connection may not read is asked again
 *   every ten minutes, or at once on Sync now (its stream's mark dropped).
 */
import type { Octokit } from "@octokit/rest";
import { Effect, Result, Schema } from "effect";
import type { BoardItem, BoardRead, Polled, WatchView } from "../provider";
import {
  type ProviderFailure,
  type ProviderRefused,
  refusedWith,
  request,
} from "../read-stop";
import { graphqlErrorsOf, type RefusalCode, refusalWords } from "./answer";

/** The field whose options are the stages: GitHub's own default single-select (its docs' example answer: "Status" with "Todo", "In Progress", "Done"). */
const STATUS_FIELD = "Status";
const PER_PAGE = 100;
/** Pages of a Project's items one read takes at most. Our choice: 2,000 items. */
const MAX_PAGES = 20;
/** Projects a binding's form lists from the owner and the repository each. Our choice. */
const PROJECTS_FIRST = 50;
/** How often a board the connection may not read is asked again on its own; Sync now asks at once. Our choice. */
const RECHECK_MS = 10 * 60_000;
/** GitHub's error types that mean the connection may not do it (GraphQL `errors[].type`). */
const REFUSED_TYPES: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "INSUFFICIENT_SCOPES",
]);

/** The stream a watch's board is read as. */
export const BOARD_STREAM = "board:";

/** A Status option. */
interface StatusOption {
  id: string;
  name: string;
}

/** One Project as a binding's choice lists it. */
export interface ProjectChoice {
  fieldId: string | null;
  id: string;
  /** Linked to the repository, as against only its owner's. */
  linked: boolean;
  number: number;
  options: StatusOption[];
  title: string;
  url: string;
}

/** Why GitHub would not answer a board's request, as the hub's problems read it: its kind, words and rate limit. */
interface BoardProblem {
  code: RefusalCode;
  resumeAt: number | null;
  words: string;
}

const FIELD = `field(name: $field) {
  ... on ProjectV2SingleSelectField { id options { id name } }
}`;

const PROJECT_FIELDS = `id number title url closed ${FIELD}`;

const PROJECTS_QUERY = `query CawcoProjects($owner: String!, $repo: String!, $field: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    projectsV2(first: $first) { nodes { ${PROJECT_FIELDS} } }
    owner {
      ... on ProjectV2Owner { projectsV2(first: $first) { nodes { ${PROJECT_FIELDS} } } }
    }
  }
}`;

const ITEMS_QUERY = `query CawcoProjectItems($id: ID!, $field: String!, $first: Int!, $after: String) {
  node(id: $id) {
    ... on ProjectV2 {
      number title url ${FIELD}
      items(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { number repository { nameWithOwner } } }
          fieldValueByName(name: $field) {
            ... on ProjectV2ItemFieldSingleSelectValue { optionId }
          }
        }
      }
    }
  }
}`;

interface RawProject {
  closed?: boolean;
  field?: { id?: string; options?: StatusOption[] } | null;
  id: string;
  number: number;
  title: string;
  url: string;
}

/** One page of a Project's items, as GitHub answers it. */
interface ItemsAnswer {
  node: {
    field?: RawProject["field"];
    items?: {
      nodes: ({
        content?: {
          number?: number;
          repository?: { nameWithOwner: string };
        } | null;
        fieldValueByName?: { optionId?: string | null } | null;
        id: string;
      } | null)[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
    number?: number;
    title?: string;
    url?: string;
  } | null;
}

type ItemNodes = NonNullable<
  NonNullable<ItemsAnswer["node"]>["items"]
>["nodes"];

/** What GitHub's error says of `what`, in its words: the GraphQL error a token or app may not pass, or the HTTP one. */
const boardProblem = (
  error: unknown,
  what: string,
  on: string
): BoardProblem => {
  const errors = graphqlErrorsOf(error);
  if (errors.length > 0) {
    const refused = errors.find((one) => REFUSED_TYPES.has(one.type ?? ""));
    const said = (refused ?? errors[0])?.message ?? "";
    return refused
      ? {
          code: "scope",
          resumeAt: null,
          words: `GitHub refused to ${what} on ${on}: “${said}” The connection needs the organization permission Projects (read and write), or a classic token's project scope; GitHub lets no app reach a user's own Projects.`,
        }
      : {
          code: "input",
          resumeAt: null,
          words: `GitHub answered to ${what} on ${on}: “${said}”`,
        };
  }
  return refusalWords(error, what, on);
};

/** One GraphQL request within the hub's deadline: its data; GitHub's refusal in its words, or no answer, its failure. */
export const boardAsk = <T>(
  octokit: Octokit,
  requestMs: number,
  what: string,
  on: string,
  query: string,
  variables: Record<string, unknown>
): Effect.Effect<T, ProviderFailure> =>
  request(
    "GitHub",
    requestMs,
    (signal) =>
      octokit.graphql<T>(query, {
        ...variables,
        request: { redirect: "error", signal },
      }),
    (error) => {
      const said = boardProblem(error, what, on);
      return refusedWith(said.words, said.code, said.resumeAt);
    }
  );

const choiceOf = (raw: RawProject, linked: boolean): ProjectChoice => ({
  id: raw.id,
  number: raw.number,
  title: raw.title,
  url: raw.url,
  linked,
  fieldId: raw.field?.id ?? null,
  options: raw.field?.options ?? [],
});

/**
 * The open Projects a GitHub connection reaches for `owner/repo`: those
 * linked to it first, then the rest of its owner's. A connection that may
 * not read them answers GitHub's words as `refused`.
 */
export const githubProjects = (
  octokit: Octokit,
  requestMs: number,
  repo: string
): Effect.Effect<
  { projects: ProjectChoice[]; refused: string | null },
  ProviderFailure
> => {
  const [owner = "", name = ""] = repo.split("/");
  return boardAsk<{
    repository: {
      owner: { projectsV2?: { nodes: (RawProject | null)[] } } | null;
      projectsV2: { nodes: (RawProject | null)[] };
    } | null;
  }>(octokit, requestMs, "read the Projects", owner, PROJECTS_QUERY, {
    owner,
    repo: name,
    field: STATUS_FIELD,
    first: PROJECTS_FIRST,
  }).pipe(
    Effect.map((data) => {
      const linked = (data.repository?.projectsV2.nodes ?? []).filter(
        (one): one is RawProject => one !== null && !one.closed
      );
      const owned = (data.repository?.owner?.projectsV2?.nodes ?? []).filter(
        (one): one is RawProject =>
          one !== null &&
          !one.closed &&
          !linked.some((each) => each.id === one.id)
      );
      return {
        refused: null,
        projects: [
          ...linked.map((one) => choiceOf(one, true)),
          ...owned.map((one) => choiceOf(one, false)),
        ],
      };
    }),
    Effect.catchIf(
      (failure) =>
        failure._tag === "ProviderRefused" && failure.kind === "scope",
      (failure) =>
        Effect.succeed({
          projects: [],
          refused: failure._tag === "ProviderRefused" ? failure.words : null,
        })
    )
  );
};

/** The repository's issues among a page's items, each with its Status, put in `into` by number. */
const keepItems = (
  nodes: ItemNodes,
  repo: string,
  into: Record<string, BoardItem>
) => {
  for (const node of nodes) {
    const issue = node?.content?.number;
    const from = node?.content?.repository?.nameWithOwner ?? "";
    if (
      node &&
      issue !== undefined &&
      from.toLowerCase() === repo.toLowerCase()
    ) {
      into[String(issue)] = {
        itemId: node.id,
        optionId: node.fieldValueByName?.optionId ?? null,
      };
    }
  }
};

/** A Project's Status field, and each of `repo`'s issues on it with its Status. */
const readBoard = Effect.fnUntraced(function* (
  octokit: Octokit,
  requestMs: number,
  repo: string,
  project: { id: string; number: number; title: string }
) {
  const on = `the Project “${project.title}”`;
  const items: Record<string, BoardItem> = {};
  const pageAt = Effect.fnUntraced(function* (after: string | null) {
    const { node } = yield* boardAsk<ItemsAnswer>(
      octokit,
      requestMs,
      "read the Status of its items",
      on,
      ITEMS_QUERY,
      { id: project.id, field: STATUS_FIELD, first: PER_PAGE, after }
    );
    if (!node?.items) {
      return yield* refusedWith(
        `GitHub answered no Project for “${project.title}”: deleted, or one the connection cannot see.`,
        "scope"
      );
    }
    keepItems(node.items.nodes, repo, items);
    return { node, next: node.items.pageInfo };
  });
  const first = yield* pageAt(null);
  let { next } = first;
  for (let page = 2; page <= MAX_PAGES && next.hasNextPage; page += 1) {
    ({ next } = yield* pageAt(next.endCursor));
  }
  const { node } = first;
  const read: Extract<BoardRead, { kind: "read" }> = {
    kind: "read",
    id: project.id,
    number: node.number ?? project.number,
    title: node.title ?? project.title,
    url: node.url ?? "",
    fieldId: node.field?.id ?? null,
    options: node.field?.options ?? [],
    complete: !next.hasNextPage,
    items,
  };
  return read;
});

/** The board part of a watch's settings, as the tracker sync keeps it (hub db watches): read off them, the rest let be. */
const BoardSettingsSchema = Schema.Struct({
  githubProject: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        number: Schema.Number,
        title: Schema.String,
      })
    )
  ),
  githubProjectReason: Schema.optional(Schema.NullOr(Schema.String)),
});

/** The Project a binding names, as its board's read needs it. */
interface BoundProject {
  id: string;
  number: number;
  title: string;
}

/** A watch's board settings; none when they do not read. */
const boardSettingsOf = (
  watch: WatchView
): {
  githubProject: BoundProject | null;
  githubProjectReason: string | null;
} => {
  const read = Schema.decodeUnknownResult(BoardSettingsSchema)(watch.settings);
  return {
    githubProject: Result.isSuccess(read)
      ? (read.success.githubProject ?? null)
      : null,
    githubProjectReason: Result.isSuccess(read)
      ? (read.success.githubProjectReason ?? null)
      : null,
  };
};

/** Where a board's stream stands: when it last read, and when the connection was last refused it, ms. */
export interface BoardCursor {
  etag: null;
  refusedAt?: number;
  since: number;
}

/**
 * The stream a syncing watch's board is read as, when it has one to read
 * or to ask again: `board:<project id>`, or `board:` while a refused
 * binding named none and the Projects are asked again.
 */
export const boardStreams = (watch: WatchView): string[] => {
  if (watch.sync === "off") {
    return [];
  }
  const { githubProject, githubProjectReason } = boardSettingsOf(watch);
  if (githubProject) {
    return [`${BOARD_STREAM}${githubProject.id}`];
  }
  return githubProjectReason ? [BOARD_STREAM] : [];
};

/**
 * One read of a watch's board: the bound Project's Status, or, while the
 * connection was refused it, the Projects asked again every
 * {@link RECHECK_MS} (the one bound, else the first linked to the
 * repository). A refusal is the board's `refused`, said by the sync; a
 * rate limit, or GitHub unreached, stops the read.
 */
export const pollBoard = (input: {
  cursor: BoardCursor | null;
  now: number;
  octokit: Octokit;
  requestMs: number;
  watch: WatchView;
}): Effect.Effect<Polled<BoardCursor>, ProviderFailure> => {
  const { cursor, now, octokit, watch, requestMs } = input;
  const { githubProject, githubProjectReason } = boardSettingsOf(watch);
  if (
    githubProjectReason &&
    cursor?.refusedAt !== undefined &&
    now - cursor.refusedAt < RECHECK_MS
  ) {
    return Effect.succeed({ kind: "unchanged" });
  }
  const read = (found: BoardRead): Polled<BoardCursor> => ({
    kind: "read",
    baseline: false,
    ingested: { revisions: [], events: [], board: found },
    cursor: {
      etag: null,
      since: now,
      ...(found.kind === "refused" ? { refusedAt: now } : {}),
    },
  });
  const bound = Effect.fnUntraced(function* () {
    let project: BoundProject | null = githubProject;
    if (githubProjectReason) {
      const listed = yield* githubProjects(octokit, requestMs, watch.container);
      if (listed.refused) {
        return read({ kind: "refused", words: listed.refused });
      }
      const found = githubProject
        ? listed.projects.find((one) => one.id === githubProject.id)
        : listed.projects.find((one) => one.linked);
      if (!found) {
        return read(
          githubProject
            ? {
                kind: "refused",
                words: `${watch.connection} reaches no open GitHub Project “${githubProject.title}” for ${watch.container}.`,
              }
            : { kind: "none" }
        );
      }
      project = found;
    }
    if (!project) {
      const unchanged: Polled<BoardCursor> = { kind: "unchanged" };
      return unchanged;
    }
    return read(yield* readBoard(octokit, requestMs, watch.container, project));
  });
  // A refusal of the board is the board's to say; a rate limit, or GitHub
  // unreached, stops the read.
  return bound().pipe(
    Effect.catchIf(
      (failure): failure is ProviderRefused =>
        failure._tag === "ProviderRefused" &&
        failure.kind !== "rate" &&
        failure.kind !== "unreachable",
      (refused) =>
        Effect.succeed(read({ kind: "refused", words: refused.words }))
    )
  );
};
