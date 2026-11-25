/**
 * GitHub Issues as a project's tracker (provider spec §2.3 `Sync`, hub
 * sync.ts): one repository's issues, read through the client a hub
 * connection signs in (github/client.ts). What changed on the repository
 * comes through the door from GitHub's poll (github/ingest.ts); its writes
 * are github/writes.ts's.
 *
 * - **States.** Open, closed as completed, closed as not planned; a
 *   duplicate's close reads as not planned's category ("`state_reason` …
 *   Can be one of: `completed`, `not_planned`, `duplicate`, `reopened`",
 *   docs.github.com, update an issue).
 * - **What it needs.** Repository permissions "Issues" (read, or write for
 *   a `both` binding) and "Metadata" (read), which every fine-grained token
 *   and GitHub App has.
 */
import { Effect } from "effect";
import type { IssueState, MirroredRef, Sync, SyncTarget } from "../provider";
import { refusedWith, request } from "../read-stop";
import { linkOfUrl } from "../registry";
import { refusalWords } from "./answer";
import type { GitHubClient } from "./client";
import { githubItems } from "./items";

const PER_PAGE = 100;
/** Pages of repositories a binding's choice lists before a search; a search reads on to the last page. Our choice. */
const TARGET_PAGES = 3;

const OPEN: IssueState = { token: "open", name: "Open", type: "unstarted" };
const COMPLETED: IssueState = {
  token: "closed:completed",
  name: "Closed",
  type: "completed",
};
const NOT_PLANNED: IssueState = {
  token: "closed:not_planned",
  name: "Not planned",
  type: "canceled",
};
const DUPLICATE: IssueState = {
  token: "closed:duplicate",
  name: "Duplicate",
  type: "canceled",
};
/** The states the sync puts an issue in, in GitHub's order. */
const STATES: readonly IssueState[] = [OPEN, COMPLETED, NOT_PLANNED];

/** The state a GitHub state token names (github/ingest.ts `issueStateToken`): open, else a close by its reason, a reason it does not know a completed one. */
export const githubIssueState = (token: string): IssueState =>
  [OPEN, COMPLETED, NOT_PLANNED, DUPLICATE].find(
    (state) => state.token === token
  ) ?? (token.startsWith("closed") ? COMPLETED : OPEN);

const OWNER_REPO = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/u;

/** `owner/repo` as its two parts; refused in words when the name is no such thing. */
export const repoParts = (
  repo: string
): Effect.Effect<
  { owner: string; repo: string },
  ReturnType<typeof refusedWith>
> => {
  const found = OWNER_REPO.exec(repo.trim());
  return found?.[1] && found[2]
    ? Effect.succeed({ owner: found[1], repo: found[2] })
    : Effect.fail(
        refusedWith(`“${repo}” is not a repository like owner/name.`)
      );
};

/** One request to GitHub within the hub's deadline: GitHub's refusal of `what` on `repo` in its words and with what the connection needs. */
export const githubAsk = <A>(
  requestMs: number,
  what: string,
  repo: string,
  run: (signal: AbortSignal) => Promise<A>
) =>
  request("GitHub", requestMs, run, (error) => {
    const said = refusalWords(error, what, repo);
    return refusedWith(said.words, said.code, said.resumeAt);
  });

/** An issue of `repo` named by its number, as the mirror names it. */
const issueRef = (repo: string, key: string): MirroredRef => ({
  provider: "github",
  host: "github.com",
  container: repo.toLowerCase(),
  kind: "issue",
  key,
  ref: `#${key}`,
  url: `https://github.com/${repo}/issues/${key}`,
});

/** A repository GitHub lists, as the binding's choice and a repository picker draw it. */
interface ListedRepo {
  clone_url: string;
  description: string | null;
  full_name: string;
  html_url: string;
  owner: { avatar_url: string; login: string; type: string };
  private: boolean;
  ssh_url: string;
  updated_at?: string | null;
}

const targetOf = (each: ListedRepo): SyncTarget => ({
  id: each.full_name,
  name: each.full_name,
  url: each.html_url,
  repo: {
    nameWithOwner: each.full_name,
    description: each.description,
    isPrivate: each.private,
    owner: {
      login: each.owner.login,
      avatarUrl: each.owner.avatar_url,
      kind: each.owner.type === "Organization" ? "org" : "user",
    },
    sshUrl: each.ssh_url,
    updatedAt: each.updated_at ?? "",
    url: each.clone_url,
  },
});

export const githubSync: Sync<GitHubClient> = {
  describe: (octokit, repo, requestMs) =>
    Effect.gen(function* () {
      const target = yield* repoParts(repo);
      const { data } = yield* githubAsk(
        requestMs,
        "read the repository",
        repo,
        (signal) =>
          octokit.request("GET /repos/{owner}/{repo}", {
            ...target,
            request: { signal },
          })
      );
      const described: SyncTarget = {
        id: data.full_name,
        name: data.full_name,
        url: data.html_url,
      };
      return described;
    }),

  states: () => Effect.succeed([...STATES]),

  issue: (octokit, repo, key, requestMs) =>
    githubItems
      .read(octokit, issueRef(repo, key), null, requestMs)
      .pipe(
        Effect.map((read) => (read.kind === "read" ? read.revision : null))
      ),

  keyOf: (_octokit, repo, url) => {
    const item = linkOfUrl(url);
    return Effect.succeed(
      item?.provider === "github" &&
        item.kind === "issue" &&
        item.container === repo.toLowerCase()
        ? item.key
        : undefined
    );
  },

  targets: (octokit, requestMs, { app, search }) =>
    Effect.gen(function* () {
      const what = app
        ? "list the repositories the app is installed on"
        : "list the token's repositories";
      /** One page: the app's installation's repositories, or the token's own. */
      const page = (number: number) =>
        githubAsk(
          requestMs,
          what,
          "GitHub",
          async (signal): Promise<ListedRepo[]> =>
            app
              ? (
                  await octokit.request("GET /installation/repositories", {
                    per_page: PER_PAGE,
                    page: number,
                    request: { signal },
                  })
                ).data.repositories
              : (
                  await octokit.request("GET /user/repos", {
                    per_page: PER_PAGE,
                    page: number,
                    sort: "pushed",
                    request: { signal },
                  })
                ).data
        );
      const repos: ListedRepo[] = [];
      let last = PER_PAGE;
      for (
        let number = 1;
        last === PER_PAGE && (search !== undefined || number <= TARGET_PAGES);
        number += 1
      ) {
        const batch = yield* page(number);
        repos.push(...batch);
        last = batch.length;
      }
      const needle = search?.trim().toLowerCase() ?? "";
      return {
        // Without a search, a full last page means the connection reaches more.
        more: search === undefined && last === PER_PAGE,
        targets: repos
          .filter((each) => each.full_name.toLowerCase().includes(needle))
          .map(targetOf),
      };
    }),
};
