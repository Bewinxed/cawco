/**
 * A GitHub Project (v2) as the stages of a GitHub binding (tracker.ts): each
 * linked issue's item on the Project, and the option its single-select
 * Status field stands in, read and written through GitHub's GraphQL API with
 * Octokit's `graphql`, signed in by the binding's connection.
 *
 * - **Why.** An issue is open or closed, so a move between open stages
 *   (ready → working → review) has no place on the issue. The PRD's §5.2:
 *   "With GitHub, stages map onto a Projects single-select field".
 * - **Reading.** The Project's Status field and its options, and its items
 *   with each one's issue and Status: "Single select fields are returned as
 *   a `ProjectV2SingleSelectField` object and have an `options` field where
 *   you can find the ID of each option"; `ProjectV2.field(name:)` "A field of
 *   the project"; `ProjectV2Item.fieldValueByName(name:)`; `items`
 *   "Defaults to only returning items that are not archived"
 *   (docs.github.com/en/graphql/reference/projects).
 * - **Writing.** "You cannot add and update an item in the same call. You
 *   must use `addProjectV2ItemById` to add the item and then use
 *   `updateProjectV2ItemFieldValue` to update the item"; "If you try to add
 *   an item that already exists, the existing item ID is returned instead";
 *   a single select is set with `value: { singleSelectOptionId }`
 *   (docs.github.com, using the API to manage Projects).
 * - **Permission.** "replace `TOKEN` with a token that has the
 *   `read:project` scope (for queries) or `project` scope (for queries and
 *   mutations)" (same page); a fine-grained token or a GitHub App needs the
 *   organization permission "Projects" (`organization_projects`, "read,
 *   write, admin": docs.github.com, fine-grained token permissions). A
 *   GitHub App reaches no user-owned Project: GitHub answers it "Resource not
 *   accessible by integration". A refusal is {@link TrackerRefusal} `scope`
 *   with GitHub's own words; tracker.ts then leaves Status alone and issues
 *   sync as before (CawCo's no-fallback rule: the piece does not start).
 */
import type {
  GithubProject,
  GithubProjectChoice,
  GithubProjectsView,
  StatusOption,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import type { Octokit } from "@octokit/rest";
import { TrackerRefusal } from "./tracker-adapter";
import { githubRefusal } from "./tracker-github";

/** One request. Our choice, as tracker-github.ts's. */
const REQUEST_MS = 30_000;
/** The field whose options are the stages: GitHub's own default single-select (its docs' example answer: "Status" with "Todo", "In Progress", "Done"). */
export const STATUS_FIELD = "Status";
const PER_PAGE = 100;
/** Pages of a Project's items one sync reads at most. Our choice: 2,000 items. */
const MAX_PAGES = 20;
/** Projects a binding's form lists from the owner and the repository each. Our choice. */
const PROJECTS_FIRST = 50;
/** GitHub's error types that mean the connection may not do it (GraphQL `errors[].type`). */
const REFUSED_TYPES: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "INSUFFICIENT_SCOPES",
]);
const OWNER_REPO = /^([^/]+)\/([^/]+)$/u;

/** GitHub's GraphQL error as Octokit's GraphqlResponseError carries it. */
interface GraphqlFailure {
  errors?: { message?: string; type?: string }[];
}

/** A Project item as a sync reads it: its id, and the Status option it stands in (null: none). */
export interface StatusItem {
  itemId: string;
  optionId: string | null;
}

/** A Project as one sync reads it: its Status field, and each of the repository's issues on it by number. */
export interface ProjectRead {
  /** Every item was read; false when the read stopped at {@link MAX_PAGES}, so an issue missing from `items` may be on it still. */
  complete: boolean;
  fieldId: string | null;
  items: Map<string, StatusItem>;
  options: StatusOption[];
  title: string;
  url: string;
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
      title url ${FIELD}
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

const ISSUE_QUERY = `query CawcoIssueNode($owner: String!, $repo: String!, $number: Int!) {
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
    title?: string;
    url?: string;
  } | null;
}

type ItemNodes = NonNullable<
  NonNullable<ItemsAnswer["node"]>["items"]
>["nodes"];

/** The repository's issues among a page's items, each with its Status, put in `into` by number. */
const keepItems = (
  nodes: ItemNodes,
  repo: string,
  into: Map<string, StatusItem>
) => {
  for (const node of nodes) {
    const number = node?.content?.number;
    const from = node?.content?.repository?.nameWithOwner ?? "";
    if (
      node &&
      number !== undefined &&
      from.toLowerCase() === repo.toLowerCase()
    ) {
      into.set(String(number), {
        itemId: node.id,
        optionId: node.fieldValueByName?.optionId ?? null,
      });
    }
  }
};

/** GitHub's refusal of `what`, in its words: the GraphQL error a token or app may not pass, or the HTTP one. */
const refusalOf = (
  error: unknown,
  what: string,
  on: string
): TrackerRefusal => {
  if (error instanceof TrackerRefusal) {
    return error;
  }
  const { errors } = error as GraphqlFailure;
  if (Array.isArray(errors) && errors.length > 0) {
    const refused = errors.find((one) => REFUSED_TYPES.has(one.type ?? ""));
    const said = (refused ?? errors[0])?.message ?? "";
    return refused
      ? new TrackerRefusal(
          "scope",
          `GitHub refused to ${what} on ${on}: “${said}” The connection needs the organization permission Projects (read and write), or a classic token's project scope; GitHub lets no app reach a user's own Projects.`
        )
      : new TrackerRefusal(
          "input",
          `GitHub answered to ${what} on ${on}: “${said}”`
        );
  }
  return githubRefusal(error, what, on);
};

/** One GraphQL request within {@link REQUEST_MS}: its data, or GitHub's refusal in words. */
const ask = async <T>(
  octokit: Octokit,
  what: string,
  on: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> => {
  let read: Awaited<ReturnType<typeof readWithin<T>>>;
  try {
    read = await readWithin(REQUEST_MS, (signal) =>
      octokit.graphql<T>(query, { ...variables, request: { signal } })
    );
  } catch (error) {
    throw refusalOf(error, what, on);
  }
  if (read.kind === "unanswered") {
    throw new TrackerRefusal(
      "unreachable",
      `GitHub did not answer to ${what} on ${on} within ${REQUEST_MS / 1000} s.`
    );
  }
  return read.value;
};

const partsOf = (repo: string): { owner: string; repo: string } => {
  const found = OWNER_REPO.exec(repo);
  if (!found) {
    throw new TrackerRefusal(
      "input",
      `“${repo}” is not a repository like owner/name.`
    );
  }
  return { owner: found[1] as string, repo: found[2] as string };
};

const choiceOf = (raw: RawProject, linked: boolean): GithubProjectChoice => ({
  id: raw.id,
  number: raw.number,
  title: raw.title,
  url: raw.url,
  linked,
  fieldId: raw.field?.id ?? null,
  options: raw.field?.options ?? [],
});

/**
 * The open Projects a GitHub connection reaches for a repository: those
 * linked to it first, then the rest of its owner's. A connection that may
 * not read them answers GitHub's words instead.
 */
export const githubProjects = async (
  octokit: Octokit,
  repoName: string
): Promise<GithubProjectsView> => {
  const target = partsOf(repoName);
  let data: {
    repository: {
      owner: { projectsV2?: { nodes: (RawProject | null)[] } } | null;
      projectsV2: { nodes: (RawProject | null)[] };
    } | null;
  };
  try {
    data = await ask(
      octokit,
      "read the Projects",
      target.owner,
      PROJECTS_QUERY,
      {
        ...target,
        field: STATUS_FIELD,
        first: PROJECTS_FIRST,
      }
    );
  } catch (error) {
    if (error instanceof TrackerRefusal && error.kind === "scope") {
      return { projects: [], refused: error.message };
    }
    throw error;
  }
  const linked = (data.repository?.projectsV2.nodes ?? []).filter(
    (one): one is RawProject => one !== null && !one.closed
  );
  const owned = (data.repository?.owner?.projectsV2?.nodes ?? []).filter(
    (one): one is RawProject =>
      one !== null && !one.closed && !linked.some((each) => each.id === one.id)
  );
  return {
    refused: null,
    projects: [
      ...linked.map((one) => choiceOf(one, true)),
      ...owned.map((one) => choiceOf(one, false)),
    ],
  };
};

/** One Project's Status for one repository's issues, as the sync asks of it. */
export const githubProjectStatus = (
  octokit: Octokit,
  repoName: string,
  project: Pick<GithubProject, "id" | "title">
) => {
  const target = partsOf(repoName);
  const repo = `${target.owner}/${target.repo}`;
  const on = `the Project “${project.title}”`;

  /** The issue's node id, which adding it to the Project names. */
  const issueNode = async (number: string): Promise<string> => {
    const data = await ask<{
      repository: { issue: { id: string } | null } | null;
    }>(octokit, `read issue #${number}`, repo, ISSUE_QUERY, {
      ...target,
      number: Number(number),
    });
    const id = data.repository?.issue?.id;
    if (!id) {
      throw new TrackerRefusal(
        "input",
        `GitHub has no issue #${number} on ${repo}.`
      );
    }
    return id;
  };

  return {
    /** The Project's Status field, and each of the repository's issues on it with its Status. */
    read: async (): Promise<ProjectRead> => {
      const items = new Map<string, StatusItem>();
      let after: string | null = null;
      let head: Omit<ProjectRead, "complete" | "items"> | null = null;
      let complete = false;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each page follows the one before it
        const data: ItemsAnswer = await ask<ItemsAnswer>(
          octokit,
          "read the Status of its items",
          on,
          ITEMS_QUERY,
          {
            id: project.id,
            field: STATUS_FIELD,
            first: PER_PAGE,
            after,
          }
        );
        if (!data.node?.items) {
          throw new TrackerRefusal(
            "scope",
            `GitHub answered no Project for “${project.title}”: deleted, or one the connection cannot see.`
          );
        }
        head ??= {
          title: data.node.title ?? project.title,
          url: data.node.url ?? "",
          fieldId: data.node.field?.id ?? null,
          options: data.node.field?.options ?? [],
        };
        keepItems(data.node.items.nodes, repo, items);
        const { hasNextPage, endCursor } = data.node.items.pageInfo;
        if (!hasNextPage) {
          complete = true;
          break;
        }
        after = endCursor;
      }
      return {
        ...(head as Omit<ProjectRead, "complete" | "items">),
        complete,
        items,
      };
    },

    /**
     * Puts issue `number` in Status `optionId`: added to the Project first
     * when it is not on it (adding answers the item it has already), then its
     * Status set. Answers the item.
     */
    put: async (
      number: string,
      item: StatusItem | undefined,
      fieldId: string,
      optionId: string
    ): Promise<StatusItem> => {
      let itemId = item?.itemId;
      if (!itemId) {
        const content = await issueNode(number);
        const added = await ask<{
          addProjectV2ItemById: { item: { id: string } };
        }>(octokit, `add issue #${number}`, on, ADD_MUTATION, {
          project: project.id,
          content,
        });
        itemId = added.addProjectV2ItemById.item.id;
      }
      await ask(
        octokit,
        `set the Status of issue #${number}`,
        on,
        SET_MUTATION,
        {
          project: project.id,
          item: itemId,
          field: fieldId,
          option: optionId,
        }
      );
      return { itemId, optionId };
    },
  };
};

export type GithubProjectStatus = ReturnType<typeof githubProjectStatus>;
