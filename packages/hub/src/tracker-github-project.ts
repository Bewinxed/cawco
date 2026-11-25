/**
 * A GitHub Project (v2) as the stages of a GitHub binding (sync.ts): each
 * linked issue's item on the Project, and the option its single-select
 * Status field stands in, read and written through GitHub's GraphQL API with
 * Octokit's `graphql`, signed in by the binding's connection.
 *
 * - **Why.** An issue is open or closed, so a move between open stages
 *   (ready → working → review) has no place on the issue. The PRD's §5.2:
 *   "With GitHub, stages map onto a Projects single-select field".
 * - **Reading** is the GitHub provider's: the Projects a connection
 *   reaches, and a Project's Status field with each issue's Status, read as
 *   the syncing watch's board stream (providers github/board.ts) and kept
 *   on the binding by the sync (sync.ts). Here are the sync's writes.
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
 *   accessible by integration". A refusal is a `tracker-scope` problem
 *   with GitHub's own words; sync.ts then leaves Status alone and issues
 *   sync as before (CawCo's no-fallback rule: the piece does not start).
 */

import { readWithin } from "@cawco/core/bounded";
import type {
  GithubProject,
  GithubProjectsView,
  StatusOption,
} from "@cawco/core/trackers";
import {
  boardProblem,
  githubProjects as listProjects,
} from "@cawco/providers/github/board";
import type { Octokit } from "@octokit/rest";
import { ElysiaStatus, problem } from "elysia";
import type { TrackerProblem } from "./tracker-adapter";
import { partsOf, trackerProblemOf } from "./tracker-github";

/** One request. Our choice, as tracker-github.ts's. */
const REQUEST_MS = 30_000;
/** A Project item as a sync reads it: its id, and the Status option it stands in (null: none). */
export interface StatusItem {
  itemId: string;
  optionId: string | null;
}

/** A Project as the sync reads it off its board's last read: its Status field, and each of the repository's issues on it by number. */
export interface ProjectRead {
  /** Every item was read; false when the read stopped short, so an issue missing from `items` may be on it still. */
  complete: boolean;
  fieldId: string | null;
  items: Map<string, StatusItem>;
  options: StatusOption[];
  title: string;
  url: string;
}

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

/** A Status option as `updateProjectV2Field` takes it back: its id keeps it, and every item standing in it. */
interface OptionInput {
  color: string;
  description: string;
  id?: string;
  name: string;
}

/** The colour an option the hub adds wears: GitHub's quiet one. Our choice. */
const ADDED_COLOR = "GRAY";

/** What GitHub's error says of `what`, in its words: the GraphQL error a token or app may not pass, or the HTTP one. */
const graphqlProblem = (
  error: unknown,
  what: string,
  on: string
): TrackerProblem => trackerProblemOf(boardProblem(error, what, on));

/** One GraphQL request within {@link REQUEST_MS}: its data, or GitHub's problem in words. */
const ask = async <T>(
  octokit: Octokit,
  what: string,
  on: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T | TrackerProblem> => {
  let read: Awaited<ReturnType<typeof readWithin<T>>>;
  try {
    read = await readWithin(REQUEST_MS, (signal) =>
      octokit.graphql<T>(query, { ...variables, request: { signal } })
    );
  } catch (error) {
    return graphqlProblem(error, what, on);
  }
  if (read.kind === "unanswered") {
    return problem(400, {
      code: "tracker-unreachable",
      detail: `GitHub did not answer to ${what} on ${on} within ${REQUEST_MS / 1000} s.`,
    });
  }
  return read.value;
};

/**
 * The open Projects a GitHub connection reaches for a repository, for the
 * binding's choice (providers github/board.ts `githubProjects`): those
 * linked to it first, then the rest of its owner's. A connection that may
 * not read them answers GitHub's words instead.
 */
export const githubProjects = async (
  octokit: Octokit,
  repoName: string
): Promise<GithubProjectsView | TrackerProblem> => {
  const target = partsOf(repoName);
  if (target instanceof ElysiaStatus) {
    return target;
  }
  const listed = await listProjects(
    octokit,
    (read) => readWithin(REQUEST_MS, read),
    `${target.owner}/${target.repo}`
  );
  return listed.kind === "problem"
    ? trackerProblemOf(listed.problem)
    : listed.value;
};

/**
 * The Project's Status options with one added for each of `stages` it has
 * none named as (core `statusOptionFor` matches by name, ignoring case),
 * through `updateProjectV2Field`. That mutation replaces the field's whole
 * list ("provided values overwrite existing options, and existing options
 * should be fetched for partial updates"), so every option it has is sent
 * back with its `id` ("Include this to preserve the option's identity
 * during updates, preventing item field values from being cleared",
 * docs.github.com/en/graphql/reference/projects), its colour and its
 * description; an added one takes no id. It never removes or renames one.
 * Answers the options as they stand after and the names it added (none
 * when every stage had one), or GitHub's refusal in its words.
 */
export const statusOptionsAdded = async (
  octokit: Octokit,
  project: Pick<GithubProject, "title">,
  fieldId: string,
  stages: readonly string[]
): Promise<{ added: string[]; options: StatusOption[] } | TrackerProblem> => {
  const on = `the Project “${project.title}”`;
  const read = await ask<{
    node: { options?: (OptionInput & { id: string })[] } | null;
  }>(octokit, "read its Status options", on, FIELD_OPTIONS_QUERY, {
    field: fieldId,
  });
  if (read instanceof ElysiaStatus) {
    return read;
  }
  const options = read.node?.options ?? [];
  const named = (stage: string) =>
    options.some(
      (option) =>
        option.name.trim().toLowerCase() === stage.trim().toLowerCase()
    );
  // Two stages named alike, ignoring case, take one option.
  const missing = stages.filter(
    (stage, at) =>
      !named(stage) &&
      stages.findIndex(
        (other) => other.trim().toLowerCase() === stage.trim().toLowerCase()
      ) === at
  );
  if (missing.length === 0) {
    return {
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
    ...missing.map((name) => ({ name, color: ADDED_COLOR, description: "" })),
  ];
  const added = await ask<{
    updateProjectV2Field: {
      projectV2Field: { options?: StatusOption[] } | null;
    };
  }>(
    octokit,
    `add the Status ${missing.length === 1 ? "option" : "options"} ${missing.join(", ")}`,
    on,
    FIELD_OPTIONS_MUTATION,
    { field: fieldId, options: sent }
  );
  if (added instanceof ElysiaStatus) {
    return added;
  }
  return {
    added: missing,
    options: added.updateProjectV2Field.projectV2Field?.options ?? [],
  };
};

/** One Project's Status for one repository's issues, as the sync asks of it; a problem when the name is no `owner/repo`. */
export const githubProjectStatus = (
  octokit: Octokit,
  repoName: string,
  project: Pick<GithubProject, "id" | "title">
) => {
  const target = partsOf(repoName);
  if (target instanceof ElysiaStatus) {
    return target;
  }
  const repo = `${target.owner}/${target.repo}`;
  const on = `the Project “${project.title}”`;

  /** The issue's node id, which adding it to the Project names. */
  const issueNode = async (
    number: string
  ): Promise<string | TrackerProblem> => {
    const data = await ask<{
      repository: { issue: { id: string } | null } | null;
    }>(octokit, `read issue #${number}`, repo, ISSUE_QUERY, {
      ...target,
      number: Number(number),
    });
    if (data instanceof ElysiaStatus) {
      return data;
    }
    const id = data.repository?.issue?.id;
    if (!id) {
      return problem(400, {
        code: "tracker-github-issue-unknown",
        detail: `GitHub has no issue #${number} on ${repo}.`,
      });
    }
    return id;
  };

  return {
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
    ): Promise<StatusItem | TrackerProblem> => {
      let itemId = item?.itemId;
      if (!itemId) {
        const content = await issueNode(number);
        if (content instanceof ElysiaStatus) {
          return content;
        }
        const added = await ask<{
          addProjectV2ItemById: { item: { id: string } };
        }>(octokit, `add issue #${number}`, on, ADD_MUTATION, {
          project: project.id,
          content,
        });
        if (added instanceof ElysiaStatus) {
          return added;
        }
        itemId = added.addProjectV2ItemById.item.id;
      }
      const set = await ask<{
        updateProjectV2ItemFieldValue: { projectV2Item: { id: string } };
      }>(octokit, `set the Status of issue #${number}`, on, SET_MUTATION, {
        project: project.id,
        item: itemId,
        field: fieldId,
        option: optionId,
      });
      if (set instanceof ElysiaStatus) {
        return set;
      }
      return { itemId, optionId };
    },
  };
};

/** A Project's Status client, as {@link githubProjectStatus} makes it for a repository named as `owner/repo`. */
export type GithubProjectStatus = Exclude<
  ReturnType<typeof githubProjectStatus>,
  TrackerProblem
>;
