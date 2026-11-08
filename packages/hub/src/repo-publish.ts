/**
 * A project's folder published to a new GitHub repository (`project_settings`
 * `create_repo`, always behind the person's Approve). THE INVARIANT: the
 * GitHub connection's token never leaves the hub. Any of a project's
 * repositories is published this way, each once: the folder is named, and
 * its repository's link records which hub repository it is the copy of.
 *
 * - **Read**, before the card: the checkout named (`folder`, the project's
 *   only one when left out) is made a git repository when it is a plain folder (place-repo.ts `ensure`: what is
 *   private, secret, large or generated stays out, and the project's
 *   conversation is told),
 *   then its branch, commit, files and bytes, and every path the rules keep
 *   out, are read on its machine (CONTROL_PLACE_PUSH, a dry run), which
 *   refuses a place whose commits hold what the rules or the credential
 *   scan would have kept out. The card says them all.
 * - **Publish**, on Approve: the place pushes its branch to the hub's own
 *   remote of its repository with its machine's credential (agent
 *   place-push.ts names which); the hub creates
 *   the repository through the connection with Octokit
 *   (`repos.createForAuthenticatedUser`, private as asked) and pushes that
 *   branch from that repository's bare one with the token in
 *   an `http.extraHeader` given through git's environment, never argv; the
 *   project then links it as that repository's published copy.
 */

import { readWithin } from "@cawco/core/bounded";
import { type HubRepoKey, hubRepoSegment } from "@cawco/core/hub-repo";
import type { ProjectSettingChange } from "@cawco/core/permission-presentation";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import {
  CONTROL_PLACE_PUSH,
  type PlacePush,
} from "@cawco/core/workspace/controls";
import { startedPath } from "@cawco/core/workspace-needs";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { PlaceRow, ProjectRow } from "./db/projects";
import type { PlaceRepos } from "./place-repo";

/** GitHub's rule for a repository's name. */
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/u;
/** How long one GitHub API call may take. Our choice. */
const API_MS = 30_000;
/** How long the hub's push to GitHub may take. Our choice. */
const PUSH_MS = 10 * 60_000;

type CreateRepo = Extract<ProjectSettingChange, { kind: "create_repo" }>;

export interface RepoPublishDeps {
  /** The hub's bare repository of one of a project's repositories (git-remote.ts `bareRepoPath`). */
  readonly bare: (key: HubRepoKey) => string;
  /** A machine-scoped daemon function, answered or thrown in the machine's words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly connections: Pick<Connections, "githubClient" | "list">;
  readonly db: Pick<DbShape, "projectLinkPublishedFrom">;
  readonly places: Pick<PlaceRepos, "ensure">;
}

/** A publish done: the repository made, `owner/name`, and the hub repository it is the copy of. */
export interface Published {
  readonly from: HubRepoKey;
  readonly full: string;
}

const TRAILING_SLASHES = /\/+$/u;

const refuse = (message: string): never => {
  throw new Error(message);
};

export const createRepoPublish = ({
  bare,
  call,
  connections,
  db,
  places,
}: RepoPublishDeps) => {
  /** The checkout a publish reads and pushes: the one named, else the project's only one. */
  const placeOf = (
    project: ProjectRow,
    folder: string | undefined
  ): PlaceRow => {
    const checkouts = project.places.filter(
      (place) => place.kind === "checkout"
    );
    const named = folder?.trim().replace(TRAILING_SLASHES, "");
    const [only, ...others] = checkouts;
    const sole = others.length === 0 ? only : undefined;
    const found = named
      ? checkouts.find((place) => place.path === named)
      : sole;
    if (found) {
      return found;
    }
    if (checkouts.length === 0) {
      return refuse(
        "This project has no checkout on a machine to publish: its only place is its folder on the hub."
      );
    }
    const listed = checkouts.map((place) => place.path).join(", ");
    return refuse(
      named
        ? `${named} isn't one of this project's folders. Pass one as folder: ${listed}.`
        : `Name the folder to publish (folder): ${listed}.`
    );
  };

  /** Refused when the hub repository `key` is published already: its link names where. */
  const unpublished = (project: ProjectRow, key: HubRepoKey | undefined) => {
    const linked = key
      ? db.projectLinkPublishedFrom(project.id, hubRepoSegment(key))
      : undefined;
    if (linked) {
      refuse(`This folder's repository is already published, as ${linked}.`);
    }
  };

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
        const mine = github.filter(
          (one) =>
            one.projects.includes(project.id) ||
            (!!project.areaId && one.areas.includes(project.areaId))
        );
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
    asked: {
      connection?: string;
      folder?: string;
      name?: string;
      private?: boolean;
    }
  ): Promise<CreateRepo> => {
    const name = asked.name?.trim() ?? "";
    if (!REPO_NAME.test(name)) {
      refuse(
        "create_repo takes the repository's name: letters, digits, '.', '-' and '_'."
      );
    }
    const connection = connectionOf(project, asked.connection);
    const place = placeOf(project, asked.folder);
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
    unpublished(project, tree.hub);
    return {
      kind: "create_repo",
      folder: place.path,
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
    key: HubRepoKey,
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
          bare(key),
          "push",
          "--quiet",
          url,
          `refs/heads/${branch}:refs/heads/${branch}`,
        ],
        {
          env: {
            PATH: startedPath(),
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
          `The hub's push to ${url} did not finish within ${secondsOf(ran.after)} s; the repository may hold part of it.`
        );
      default:
        unhandled("read", ran);
    }
    const { stderr, code } = ran.value;
    if (code !== 0) {
      throw new Error(
        `The hub's push to ${url} failed: ${stderr.split(token).join("[token]").split(basic).join("[token]").trim()}`
      );
    }
  };

  /** Approved: pushed to the hub, created on GitHub, pushed there; answers what it made, from where. */
  const publish = async (
    project: ProjectRow,
    change: CreateRepo
  ): Promise<Published> => {
    const place = placeOf(project, change.folder);
    const pushed = (await call(place.machineId, CONTROL_PLACE_PUSH, [
      place.path,
      project.id,
      false,
    ])) as PlacePush;
    const hub =
      pushed.hub ??
      refuse(
        `${place.path} answered its push without naming the hub repository it went to.`
      );
    unpublished(project, hub);
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
          `GitHub did not answer within ${secondsOf(asked.after)} s about creating ${change.name}, so it may or may not exist: look on GitHub before you retry.`
        );
      default:
        unhandled("read", asked);
    }
    const { made, refused } = asked.value;
    if (!made) {
      throw new Error(`GitHub did not create ${change.name}: ${refused}`);
    }
    // The token the connection's Octokit signs in with (@octokit/auth-token:
    // `auth()` answers `{ token }`).
    const { token } = (await octokit.auth()) as { token: string };
    await pushFromHub(hub, pushed.branch, made.clone_url, token);
    console.log(
      `[repo-publish] ${project.name}: ${place.path}'s ${pushed.branch} at ${pushed.commit.slice(0, 9)} published to ${made.full_name}`
    );
    return { full: made.full_name, from: hub };
  };

  return { read, publish };
};

export type RepoPublish = ReturnType<typeof createRepoPublish>;
