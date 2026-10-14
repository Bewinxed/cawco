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
 *   the repository through the connection (`POST /user/repos`, private as
 *   asked) and pushes that branch from its bare repository with the token in
 *   an `http.extraHeader` given through git's environment, never argv; the
 *   project is then linked to it, as `link_repo` links one.
 */
import {
  CAWCO_ENV,
  CONTROL_PLACE_PUSH,
  type PlacePush,
  type ProjectSettingChange,
  readEnv,
} from "@cawco/core";
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
  readonly connections: Pick<Connections, "githubToken" | "list">;
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
    // A connection the hub holds no token for is refused before anyone is asked.
    connections.githubToken(pick.name);
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
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.extraHeader",
          GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
        },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
        timeout: PUSH_MS,
      }
    );
    const [stderr, code] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
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
    const token = connections.githubToken(change.connection);
    const api = readEnv(CAWCO_ENV.githubApi) ?? "https://api.github.com";
    const response = await fetch(`${new URL(api).origin}/user/repos`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "CawCo-hub",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        name: change.name,
        private: change.private,
        auto_init: false,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(API_MS),
    });
    const made = (await response.json().catch(() => ({}))) as {
      clone_url?: string;
      full_name?: string;
      message?: string;
    };
    if (!(response.ok && made.full_name && made.clone_url)) {
      throw new Error(
        `GitHub did not create ${change.name}: ${response.status} ${made.message ?? response.statusText}`
      );
    }
    await pushFromHub(project.id, pushed.branch, made.clone_url, token);
    console.log(
      `[repo-publish] ${project.name}: ${pushed.branch} at ${pushed.commit.slice(0, 9)} published to ${made.full_name}`
    );
    return made.full_name;
  };

  return { read, publish };
};

export type RepoPublish = ReturnType<typeof createRepoPublish>;
