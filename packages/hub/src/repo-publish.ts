/**
 * A project's place published to a new GitHub repository (`project_settings`
 * `create_repo`, always behind the person's Approve). THE INVARIANT: the
 * GitHub connection's token never leaves the hub.
 *
 * - **Read**, before the card: the project's primary checkout is made a git
 *   repository when it is a plain folder (place-repo.ts `ensure`: what is
 *   private, secret, large or generated stays out, and the thread is told),
 *   then its branch, commit, files and bytes, and every path the rules keep
 *   out, are read on its machine (CONTROL_PLACE_PUSH, a dry run), which
 *   refuses a place whose commits hold what the rules or the credential
 *   scan would have kept out. The card says them all.
 * - **Publish**, on Approve: the place pushes its branch to the hub's own
 *   remote of the project with its machine's credential; the hub creates
 *   the repository through the connection with Octokit
 *   (`repos.createForAuthenticatedUser`, private as asked) and pushes that
 *   branch from its bare repository with the token in
 *   an `http.extraHeader` given through git's environment, never argv; the
 *   project is then linked to it, as `link_repo` links one.
 */
import {
  CONTROL_PLACE_PUSH,
  type PlacePush,
  type ProjectSettingChange,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import type { Connections } from "./connections";
import type { ProjectRow } from "./db";
import type { PlaceRepos } from "./place-repo";

/** GitHub's rule for a repository's name. */
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
/** How long one GitHub API call may take. Our choice. */
const API_MS = 30_000;
/** How long the hub's push to GitHub may take. Our choice. */
const PUSH_MS = 10 * 60_000;

type CreateRepo = Extract<ProjectSettingChange, { kind: "create_repo" }>;

export interface RepoPublishDeps {
  /** The hub's bare repository of a project (git-remote.ts `bareRepoPath`). */
  readonly bare: (projectId: string) => string;
  /** A machine-scoped daemon function, answered or thrown in the machine's words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly connections: Pick<Connections, "githubClient" | "list">;
  readonly places: Pick<PlaceRepos, "ensure">;
}

const refuse = (message: string): never => {
  throw new Error(message);
};

export const createRepoPublish = ({
  bare,
  call,
  connections,
  places,
}: RepoPublishDeps) => {
  /** The project's primary checkout: the place a publish reads and pushes. */
  const placeOf = (project: ProjectRow) =>
    project.places.find((place) => place.kind === "checkout") ??
    refuse(
      "This project has no checkout on a machine to publish: its only place is its folder on the hub."
    );

  /** The GitHub connection to create it with: the one named, else the project's one, else the fleet's one. */
  const connectionOf = (project: ProjectRow, named: string | undefined) => {
    const github = connections
      .list()
      .filter((one) => one.service.trim().toLowerCase() === "github");
    const pick =
      (named?.trim() && github.find((one) => one.name === named.trim())) ||
      (named?.trim()
        ? refuse(`There is no GitHub connection ${named.trim()}.`)
        : undefined) ||
      (() => {
        const mine = github.filter((one) => one.projects.includes(project.id));
        const from = mine.length > 0 ? mine : github;
        if (from.length === 1) {
          return from[0];
        }
        return refuse(
          from.length === 0
            ? "The fleet has no GitHub connection to create the repository with; add one in Settings › Connections."
            : `Name the GitHub connection to create it with (connection): ${from.map((one) => one.name).join(", ")}.`
        );
      })();
    // A connection the hub cannot sign in as is refused before anyone is
    // asked; so is a GitHub App's, which makes no repository under a person
    // (`POST /user/repos` takes a user's token).
    if (!(
      pick.auth === "bearer" ||
      pick.auth === "gh" ||
      pick.auth === "device"
    )) {
      refuse(
        `${pick.name} signs in with ${pick.auth}; creating a repository takes a GitHub connection that acts as you: gh on a machine, a code sign-in, or a token.`
      );
    }
    connections.githubClient(pick.name);
    return pick;
  };

  /** What the card says: the place made a repository if it is a folder, then what would go. */
  const read = async (
    project: ProjectRow,
    asked: { connection?: string; name?: string; private?: boolean }
  ): Promise<CreateRepo> => {
    if (project.remote) {
      refuse(`This project is linked to ${project.remote} already.`);
    }
    const name = asked.name?.trim() ?? "";
    if (!REPO_NAME.test(name)) {
      refuse(
        "create_repo takes the repository's name: letters, digits, '.', '-' and '_'."
      );
    }
    const connection = connectionOf(project, asked.connection);
    const place = placeOf(project);
    const made = await places.ensure({
      projectId: project.id,
      machineId: place.machineId,
      path: place.path,
    });
    const tree = (await call(place.machineId, CONTROL_PLACE_PUSH, [
      place.path,
      project.id,
      true,
    ])) as PlacePush;
    return {
      kind: "create_repo",
      name,
      private: asked.private ?? true,
      connection: connection.name,
      account: connection.account,
      files: tree.files,
      bytes: tree.bytes,
      // What stays out by the rules, with what a first commit made now
      // left out besides (its own .gitignore's, a credential's text).
      leftOut: [
        ...new Map(
          [...(made.state === "made" ? made.leftOut : []), ...tree.leftOut].map(
            (one) => [one.path, one]
          )
        ).values(),
      ].sort((a, b) => a.path.localeCompare(b.path)),
    };
  };

  /** The hub's push from its bare repository to GitHub, the token in git's environment. */
  const pushFromHub = async (
    projectId: string,
    branch: string,
    url: string,
    token: string
  ): Promise<void> => {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    const ran = await readWithin(PUSH_MS, async (signal) => {
      const child = Bun.spawn(
        [
          "git",
          "-C",
          bare(projectId),
          "push",
          "--quiet",
          url,
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        {
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: process.env.HOME ?? "/",
            ...GIT_LOCALE,
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.extraHeader",
            GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
          },
          stdin: "ignore",
          stdout: "ignore",
          stderr: "pipe",
          signal,
        }
      );
      const [stderr, code] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stderr, code };
    });
    switch (ran.kind) {
      case "answered":
        break;
      case "unanswered":
        throw new Error(
          `The hub's push to ${url} did not finish within ${Math.round(ran.after / 1000)} s; the repository may hold part of it.`
        );
      default: {
        const unhandled: never = ran;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const { stderr, code } = ran.value;
    if (code !== 0) {
      throw new Error(
        `The hub's push to ${url} failed: ${stderr.split(token).join("[token]").split(basic).join("[token]").trim()}`
      );
    }
  };

  /** Approved: pushed to the hub, created on GitHub, pushed there; answers `owner/name`. */
  const publish = async (
    project: ProjectRow,
    change: CreateRepo
  ): Promise<string> => {
    const place = placeOf(project);
    const pushed = (await call(place.machineId, CONTROL_PLACE_PUSH, [
      place.path,
      project.id,
      false,
    ])) as PlacePush;
    const octokit = connections.githubClient(change.connection);
    const asked = await readWithin(API_MS, async (signal) => {
      try {
        const { data } = await octokit.rest.repos.createForAuthenticatedUser({
          name: change.name,
          private: change.private,
          auto_init: false,
          request: { signal, redirect: "error" },
        });
        return { made: data };
      } catch (error) {
        const failed = error as {
          message?: string;
          response?: { data?: { message?: unknown } };
          status?: number;
        };
        const said = failed.response?.data?.message;
        return {
          refused:
            `${failed.status ?? "no answer"} ${typeof said === "string" ? said : (failed.message ?? "")}`.trim(),
        };
      }
    });
    switch (asked.kind) {
      case "answered":
        break;
      case "unanswered":
        throw new Error(
          `GitHub did not answer within ${Math.round(asked.after / 1000)} s about creating ${change.name}, so it may or may not exist: look on GitHub before you retry.`
        );
      default: {
        const unhandled: never = asked;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const { made, refused } = asked.value;
    if (!made) {
      throw new Error(`GitHub did not create ${change.name}: ${refused}`);
    }
    // The token the connection's Octokit signs in with (@octokit/auth-token:
    // `auth()` answers `{ token }`).
    const { token } = (await octokit.auth()) as { token: string };
    await pushFromHub(project.id, pushed.branch, made.clone_url, token);
    console.log(
      `[repo-publish] ${project.name}: ${pushed.branch} at ${pushed.commit.slice(0, 9)} published to ${made.full_name}`
    );
    return made.full_name;
  };

  return { read, publish };
};

export type RepoPublish = ReturnType<typeof createRepoPublish>;
